import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  AdvisoryAcknowledgement,
  AutoFillFieldOutcome,
  CompletenessResult,
  FormDraftDto,
  QualityIssue,
  QualityReport,
  FormFieldDefinition,
  FormTemplate,
  asRows,
  checkCompleteness,
  hasSensitiveRow,
  isFieldValueComplete,
  isGroupValueComplete,
  requiredFieldIds,
  shouldRunCompletenessCheck,
  crossFieldFindings,
  isConditionallyRequired,
  type ValidationFinding,
} from '@mgs/shared';
import { DraftsService } from '../../core/services/drafts.service';
import { TemplatesService } from '../../core/services/templates.service';
import { SensitiveAccessSession } from './sensitive-section/sensitive-access-session';
import { ReviewPanel } from './review-panel/review-panel';
import { PdfControls } from './pdf-controls/pdf-controls';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';
import { ConsistencyIssues } from '../../shared/dynamic-form/consistency-issues';
import { Mg11Wizard } from './mg11-wizard/mg11-wizard';

const AUTOSAVE_DEBOUNCE_MS = 1500;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * UC-01 steps 3–7: renders the template for a draft, tracks required-field
 * progress in real time, autosaves (debounced) and supports explicit saves.
 */
@Component({
  selector: 'app-form-fill-page',
  imports: [
    DatePipe,
    RouterLink,
    DynamicForm,
    ConsistencyIssues,
    Mg11Wizard,
    ReviewPanel,
    PdfControls,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './form-fill-page.html',
  styleUrl: './form-fill-page.scss',
})
export class FormFillPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draftsService = inject(DraftsService);
  private readonly templatesService = inject(TemplatesService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sensitiveAccess = inject(SensitiveAccessSession);

  protected readonly draft = signal<FormDraftDto | null>(null);
  protected readonly template = signal<FormTemplate | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly caseLinkWarning = signal<string | null>(null);

  protected readonly saveState = signal<SaveState>('idle');
  protected readonly lastSavedAt = signal<string | null>(null);

  /** UC-02 state: latest run's summary (dismissible panel) and outcomes. */
  protected readonly autoFillSummary = signal<{ filled: number; total: number } | null>(null);
  protected readonly autoFillOutcomes = signal<AutoFillFieldOutcome[]>([]);
  protected readonly autoFilling = signal(false);

  /** True when the linked case changed after this draft was populated. */
  protected readonly caseChanged = computed(() => {
    const draft = this.draft();
    if (!draft?.case) return false;
    const caseUpdatedAt = draft.case.updatedAt;
    return Object.values(draft.autoFill).some((p) => p.caseUpdatedAt < caseUpdatedAt);
  });

  /** UC-03: MG11 uses the guided wizard; every other form keeps the flat renderer. */
  protected readonly isMg11 = computed(() => this.template()?.code === 'MG11');

  /** UC-03: set by the wizard, shown as a header indicator. */
  protected readonly vulnerableWitness = signal(false);

  /**
   * UC-04: the template's repeating group, if it has one. Found by field type,
   * never by form code — the MG6 designation is disputed (LER-1205), so the
   * schedule must work wherever it ends up living.
   */
  protected readonly scheduleField = computed<FormFieldDefinition | null>(
    () => this.template()?.fields.find((f) => f.type === 'group') ?? null,
  );

  /**
   * UC-05: every value on the form, mirrored so cross-field findings recompute
   * as the user types. Cross-field rules can compare against a case datum, which
   * is why this lives on the page (which has the case) rather than in the
   * renderer (which does not).
   */
  private readonly formValues = signal<Record<string, unknown>>({});

  protected readonly consistencyFindings = computed<ValidationFinding[]>(() => {
    const template = this.template();
    if (!template) return [];
    return crossFieldFindings(template, this.formValues(), this.draft()?.case ?? null);
  });

  /**
   * True for any template a practitioner has not signed off. `verification` is
   * optional — absent means "not yet assessed", which is even further from
   * sign-off than the literal 'unverified' — so the test must be against
   * 'verified', never against 'unverified': the strict-equality form silently
   * dropped the warning on the five legacy templates that carry no marker.
   */
  protected readonly templateUnverified = computed(() => {
    const template = this.template();
    return !!template && template.verification !== 'verified';
  });

  /** Live schedule state, refreshed on every form value change. */
  private readonly scheduleValue = signal<unknown>(null);
  private readonly complexityValue = signal<unknown>(undefined);

  /** UC-04: any row marked sensitive raises this, with no further user action. */
  protected readonly sensitiveMaterial = computed(() => {
    const field = this.scheduleField();
    return field ? hasSensitiveRow(field, this.scheduleValue()) : false;
  });

  /**
   * UC-04 completeness advisory. Non-blocking by design: it appears, it can be
   * dismissed, and nothing anywhere waits on it.
   */
  protected readonly completeness = computed<CompletenessResult | null>(() => {
    if (!this.scheduleField()) return null;
    const itemCount = asRows(this.scheduleValue()).length;
    const complexity = this.complexityValue();
    if (!shouldRunCompletenessCheck({ itemCount, complexity })) return null;
    const result = checkCompleteness({ itemCount, complexity });
    return result.sparse ? result : null;
  });

  protected readonly completenessDismissed = signal(false);

  protected dismissCompleteness(): void {
    this.completenessDismissed.set(true);
  }

  /** Human label for a complexity band, for the advisory text. */
  protected complexityLabel(band: string): string {
    const field = this.template()?.fields.find((f) => f.id === this.scheduleField()?.complexityFieldId);
    return field?.options?.find((o) => o.value === band)?.label ?? band;
  }

  // ── UC-08 review & finalisation ────────────────────────────────────────────
  protected readonly reviewReport = signal<QualityReport | null>(null);
  protected readonly reviewing = signal(false);
  protected readonly finalising = signal(false);
  protected readonly finaliseError = signal<string | null>(null);
  /** Drives the MG11 wizard to the step holding a jump target. */
  protected readonly revealField = signal<{ fieldId: string; nonce: number } | null>(null);

  protected readonly finalised = computed(() => this.draft()?.status === 'FINALISED');
  /** UC-10: superseded by an amendment — read-only forever. */
  protected readonly superseded = computed(() => this.draft()?.status === 'ARCHIVED');
  /** The UI lock is a courtesy; the API refusing edits is the enforcement
   *  (409 on every mutating endpoint for FINALISED and ARCHIVED). */
  protected readonly locked = computed(() => this.finalised() || this.superseded());
  protected readonly reopening = signal(false);

  /** The scope's review pre-condition: at least one field completed. */
  protected readonly anyFieldComplete = computed(() => {
    const template = this.template();
    if (!template) return false;
    const values = this.formValues();
    return template.fields.some((f) => isFieldValueComplete(values[f.id]));
  });

  /** UC-08: runs the suite server-side and shows the checklist. */
  protected runReview(): void {
    const draft = this.draft();
    if (!draft || this.reviewing()) return;
    this.reviewing.set(true);
    this.finaliseError.set(null);
    this.draftsService.review(draft.id).subscribe({
      next: (res) => {
        this.reviewing.set(false);
        this.reviewReport.set(res.report);
        this.draft.set({ ...draft, status: res.status });
      },
      error: (err: { status?: number }) => {
        this.reviewing.set(false);
        this.snackBar.open(
          err.status === 422
            ? 'Complete at least one field before running the review.'
            : 'The review could not run. Try again.',
          'Dismiss',
          { duration: 6000 },
        );
      },
    });
  }

  /**
   * UC-08: Jump to field (LER-1147). MG11 first reveals the step holding the
   * field; a sensitive-declared target that is not rendered for this viewer
   * (locked or unconfirmed UC-07 section) lands on the section block — the
   * nearest honest destination. The highlight is a temporary class.
   */
  protected onJump(issue: QualityIssue): void {
    if (this.isMg11() && issue.fieldId) {
      this.revealField.set({ fieldId: issue.fieldId, nonce: Date.now() });
    }
    const fieldId = issue.fieldId;
    setTimeout(() => {
      const el =
        (fieldId ? document.querySelector(`[data-field-id="${fieldId}"]`) : null) ??
        document.querySelector('[data-testid="sensitive-section"]');
      if (!(el instanceof HTMLElement)) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('jump-highlight');
      const control = el.querySelector<HTMLElement>('input, textarea, mat-select');
      control?.focus?.();
      setTimeout(() => el.classList.remove('jump-highlight'), 2400);
    }, 60);
  }

  /** UC-08: the finalise request — the server re-runs the engine regardless. */
  protected onFinalise(acknowledgements: AdvisoryAcknowledgement[]): void {
    const draft = this.draft();
    if (!draft || this.finalising()) return;
    this.finalising.set(true);
    this.finaliseError.set(null);
    this.draftsService
      .finalise(draft.id, { advisoryAcknowledgements: acknowledgements })
      .subscribe({
        next: (res) => {
          this.finalising.set(false);
          this.draft.set({ ...draft, status: res.status });
          this.form?.disable({ emitEvent: false });
          this.snackBar.open('Form finalised.', undefined, { duration: 3000 });
        },
        error: (err: { status?: number; error?: { message?: string } }) => {
          this.finalising.set(false);
          this.finaliseError.set(
            err.error?.message ??
              'The form could not be finalised. Run the review again for the latest findings.',
          );
        },
      });
  }

  protected readonly completedRequired = signal(0);
  /** UC-05: ids made required by another field's current value. */
  private readonly conditionallyRequired = signal<string[]>([]);
  /** The required set as it stands now — static requirements plus conditional ones. */
  private readonly requiredIds = computed(() => {
    const t = this.template();
    if (!t) return [];
    return [...new Set([...requiredFieldIds(t), ...this.conditionallyRequired()])];
  });
  protected readonly totalRequired = computed(() => this.requiredIds().length);
  protected readonly progressPercent = computed(() => {
    const total = this.totalRequired();
    return total === 0 ? 0 : Math.round((this.completedRequired() / total) * 100);
  });

  private form: FormGroup | null = null;
  private version = 1;
  private lastSavedJson = '';
  private saving = false;
  private saveQueued = false;

  ngOnInit(): void {
    // Set only during in-app navigation right after draft creation.
    const warning = history.state?.['caseLinkWarning'];
    if (typeof warning === 'string') {
      this.caseLinkWarning.set(warning);
    }
    this.load();
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    // UC-07 step-up (LER-1251): every load of this page is a fresh ACCESS, so
    // any earlier confirmation is discarded and the sensitive section starts
    // locked again — including navigate-away-and-back within the SPA.
    this.sensitiveAccess.reset();
    this.loading.set(true);
    this.loadError.set(null);
    this.draftsService.getDraft(id).subscribe({
      next: (draft) => {
        this.draft.set(draft);
        this.version = draft.version;
        this.lastSavedJson = JSON.stringify(draft.values);
        this.lastSavedAt.set(draft.updatedAt);
        this.loadTemplate(draft.formCode);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('This draft could not be loaded.');
      },
    });
  }

  private loadTemplate(formCode: string): void {
    this.templatesService.getTemplate(formCode).subscribe({
      next: (template) => {
        this.template.set(template);
        if (this.shouldAutoFillOnOpen(template)) {
          this.runAutoFill(true); // clears `loading` once populated
        } else {
          this.loading.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(`The ${formCode} form template could not be loaded.`);
      },
    });
  }

  /** UC-02: populate automatically on first open of a case-linked draft that
   *  has no values yet and a template with at least one mapped field. */
  private shouldAutoFillOnOpen(template: FormTemplate): boolean {
    const draft = this.draft();
    if (!draft?.caseId) return false;
    if (!template.fields.some((f) => f.mapsTo)) return false;
    return (
      Object.keys(draft.autoFill).length === 0 &&
      Object.values(draft.values).every((v) => !isFieldValueComplete(v))
    );
  }

  protected rerunAutoFill(): void {
    this.runAutoFill(false);
  }

  protected dismissAutoFillSummary(): void {
    this.autoFillSummary.set(null);
  }

  private runAutoFill(initial: boolean): void {
    const draft = this.draft();
    if (!draft) return;
    this.autoFilling.set(true);
    this.draftsService.autoFill(draft.id).subscribe({
      next: (result) => {
        this.autoFilling.set(false);
        this.version = result.draft.version;
        this.lastSavedJson = JSON.stringify(result.draft.values);
        this.lastSavedAt.set(result.draft.updatedAt);
        this.draft.set(result.draft);
        this.autoFillOutcomes.set(result.outcomes);
        this.autoFillSummary.set(result.summary);
        if (!initial) {
          // Patch only the fields this run wrote — anything the user typed
          // since the last save stays untouched.
          this.form?.patchValue(result.values);
          const n = result.summary.filled;
          this.snackBar.open(
            `Auto-fill updated ${n} field${n === 1 ? '' : 's'} from the case file`,
            undefined,
            { duration: 3000 },
          );
        }
        this.loading.set(false);
      },
      error: () => {
        this.autoFilling.set(false);
        this.loading.set(false);
        this.snackBar.open(
          'Auto-population was unavailable — you can complete the form manually.',
          'Dismiss',
          { duration: 6000 },
        );
      },
    });
  }

  /** UC-10: reopen for amendment — navigates to the new editable copy. */
  protected reopen(): void {
    const d = this.draft();
    if (!d || this.reopening()) return;
    this.reopening.set(true);
    this.draftsService.reopen(d.id).subscribe({
      next: (res) => {
        this.reopening.set(false);
        this.snackBar.open('Amendment copy created — the original is locked.', undefined, {
          duration: 4000,
        });
        void this.router.navigate(['/drafts', res.draftId]);
      },
      error: (err: unknown) => {
        this.reopening.set(false);
        const message =
          typeof (err as { error?: { message?: unknown } })?.error?.message === 'string'
            ? ((err as { error: { message: string } }).error.message)
            : 'The form could not be reopened.';
        this.snackBar.open(message, undefined, { duration: 5000 });
      },
    });
  }

  protected onFormReady(form: FormGroup): void {
    this.form = form;
    // UC-08/UC-10: finalised AND superseded forms render read-only; the
    // server refuses edits either way — this disable is the courtesy copy.
    if (this.locked()) form.disable({ emitEvent: false });
    this.recomputeProgress();

    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.recomputeProgress();
      if (JSON.stringify(form.getRawValue()) !== this.lastSavedJson) {
        this.saveState.set('dirty');
      }
    });

    form.valueChanges
      .pipe(debounceTime(AUTOSAVE_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.save(false));
  }

  /** "N of M required fields completed" — recomputed on every value change. */
  private recomputeProgress(): void {
    const template = this.template();
    const form = this.form;
    if (!template || !form) return;
    const byId = new Map(template.fields.map((f) => [f.id, f]));
    const raw = form.getRawValue() as Record<string, unknown>;
    this.formValues.set(raw);
    // UC-05: a field made required by another field's value counts towards the
    // total from the moment its trigger is set.
    this.conditionallyRequired.set(
      template.fields.filter((f) => isConditionallyRequired(f, raw)).map((f) => f.id),
    );
    const done = this.requiredIds().filter((id) => {
      const control = form.get(id);
      if (!control || !control.valid) return false;
      const field = byId.get(id);
      // A schedule is complete only with at least one row and every required
      // column filled in every row — an empty array is not a completed field.
      return field?.type === 'group'
        ? isGroupValueComplete(field, control.value)
        : isFieldValueComplete(control.value);
    }).length;
    this.completedRequired.set(done);

    const schedule = this.scheduleField();
    if (schedule) {
      this.scheduleValue.set(form.get(schedule.id)?.value ?? null);
      this.complexityValue.set(
        schedule.complexityFieldId ? form.get(schedule.complexityFieldId)?.value : undefined,
      );
    }
  }

  protected saveDraft(): void {
    this.save(true);
  }

  private save(manual: boolean): void {
    const form = this.form;
    const draft = this.draft();
    if (!form || !draft) return;

    const values = form.getRawValue() as Record<string, unknown>;
    const json = JSON.stringify(values);
    if (!manual && json === this.lastSavedJson) return;
    if (this.saving) {
      this.saveQueued = true;
      return;
    }

    this.saving = true;
    this.saveState.set('saving');
    // UC-07: while the sensitive section is unlocked, every save carries the
    // recorded confirmation id — the API rejects sensitive-touching saves
    // without one, and values now include the sensitive keys.
    const sensitiveConfirmationId = this.sensitiveAccess.confirmationIdFor(draft.id);
    this.draftsService
      .update(draft.id, {
        values,
        baseVersion: this.version,
        ...(sensitiveConfirmationId ? { sensitiveConfirmationId } : {}),
      })
      .subscribe({
      next: (updated) => {
        this.saving = false;
        this.version = updated.version;
        this.lastSavedJson = json;
        this.lastSavedAt.set(updated.updatedAt);
        this.draft.set(updated);
        this.saveState.set(
          JSON.stringify(form.getRawValue()) === json ? 'saved' : 'dirty',
        );
        if (manual) {
          this.snackBar.open('Draft saved', undefined, { duration: 2500 });
        }
        if (this.saveQueued) {
          this.saveQueued = false;
          this.save(false);
        }
      },
      error: (err: { status?: number }) => {
        this.saving = false;
        this.saveQueued = false;
        this.saveState.set('error');
        const message =
          err.status === 409
            ? 'This draft was updated elsewhere. Reload the page to continue from the latest version.'
            : 'The draft could not be saved. Check your connection and try again.';
        this.snackBar.open(message, 'Dismiss', { duration: 6000 });
      },
    });
  }
}

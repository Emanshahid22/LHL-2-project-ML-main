import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MG11_DECLARATION,
  MG11_SPECIAL_MEASURES_APPLIED_FIELD_ID,
  MG11_VULNERABLE_FLAG_KEY,
  isFieldValueComplete,
  isVulnerableWitness,
  type AutoFillFieldOutcome,
  type AutoFillProvenance,
  type FormFieldDefinition,
  type FormTemplate,
} from '@mgs/shared';
import { DynamicForm } from '../../../shared/dynamic-form/dynamic-form';
import { NarrativeField } from '../narrative-field/narrative-field';

/** The narrative gets its own component (highlighting, word count). */
const NARRATIVE_FIELD_ID = 'statementText';

interface WizardStep {
  title: string;
  /** Field ids from the MG11 template, in the order the step shows them. */
  fieldIds: string[];
}

/**
 * UC-03 step definition. This is deliberately MG11-specific and lives here
 * rather than in the shared template model: every other form keeps the flat
 * renderer, and the wizard is a shell around the same field machinery.
 */
const MG11_STEPS: readonly WizardStep[] = [
  {
    title: 'Witness details',
    fieldIds: [
      'title',
      'witnessName',
      'witnessDob',
      'witnessOccupation',
      'witnessAddress',
      'witnessPhone',
      'witnessConsentsCourt',
      'specialMeasures',
      MG11_SPECIAL_MEASURES_APPLIED_FIELD_ID,
    ],
  },
  { title: 'Statement narrative', fieldIds: [NARRATIVE_FIELD_ID, 'exhibitsReferenced'] },
  { title: 'Declaration', fieldIds: ['declarationConfirmed'] },
  { title: 'Signature and date', fieldIds: ['signatureName', 'statementTakenBy', 'statementDate'] },
];

/** Zero-based index of the declaration step, which gates progress. */
const DECLARATION_STEP = 2;

@Component({
  selector: 'app-mg11-wizard',
  imports: [DynamicForm, NarrativeField, MatButtonModule, MatTooltipModule],
  templateUrl: './mg11-wizard.html',
  styleUrl: './mg11-wizard.scss',
})
export class Mg11Wizard {
  readonly template = input.required<FormTemplate>();
  readonly initialValues = input<Record<string, unknown>>({});
  readonly autoFill = input<Record<string, AutoFillProvenance>>({});
  readonly outcomes = input<AutoFillFieldOutcome[]>([]);
  /** UC-06: passed through so an accepted suggestion can be audited. */
  readonly draftId = input<string | null>(null);

  /** Re-emitted upward so the page keeps driving progress and autosave. */
  /**
   * UC-08: a review "Jump to field" request. The wizard reveals the step that
   * holds the field so the page can then scroll and highlight it — jump works
   * across steps, not only within the visible one. Nonce so repeated jumps to
   * the same field re-fire.
   */
  readonly revealField = input<{ fieldId: string; nonce: number } | null>(null);

  private readonly revealEffect = effect(() => {
    const request = this.revealField();
    if (!request) return;
    const index = this.steps.findIndex((step) => step.fieldIds.includes(request.fieldId));
    if (index < 0) return;
    this.currentStep.set(index);
    // update(), not set-after-read: reading visited() here would make it a
    // dependency of this effect and loop it forever.
    this.visited.update((v) => (v.has(index) ? v : new Set([...v, index])));
  });

  readonly formReady = output<FormGroup>();
  /** Drives the header's Vulnerable Witness indicator. */
  readonly vulnerableWitnessChange = output<boolean>();

  private readonly destroyRef = inject(DestroyRef);

  protected readonly steps = MG11_STEPS;
  protected readonly declarationText = MG11_DECLARATION;
  protected readonly currentStep = signal(0);
  /** Steps the user has reached — their headers become clickable. */
  protected readonly visited = signal<ReadonlySet<number>>(new Set([0]));
  /** Set when the user tries to leave the declaration step without ticking. */
  protected readonly declarationReminder = signal(false);

  private form: FormGroup | null = null;
  /** Mirrors the form's values so computeds react to edits. */
  private readonly values = signal<Record<string, unknown>>({});

  protected readonly vulnerable = computed(() => isVulnerableWitness(this.values()));

  constructor() {
    // Persist the derived flag into the draft values so PDF output (UC-09) does
    // not have to re-derive it, and tell the page so the header can show it.
    effect(() => {
      const vulnerable = this.vulnerable();
      this.vulnerableWitnessChange.emit(vulnerable);
      const control = this.form?.get(MG11_VULNERABLE_FLAG_KEY);
      if (control && control.value !== vulnerable) {
        control.setValue(vulnerable);
      }
    });
  }

  /** Fields of the current step, minus any that are conditionally hidden. */
  protected readonly visibleFieldIds = computed<string[]>(() => {
    const step = this.steps[this.currentStep()];
    return step.fieldIds.filter((id) => {
      // The narrative has its own component on step 2.
      if (id === NARRATIVE_FIELD_ID) return false;
      // "Special measures applied" only appears for a vulnerable witness.
      if (id === MG11_SPECIAL_MEASURES_APPLIED_FIELD_ID) return this.vulnerable();
      return true;
    });
  });

  protected readonly showNarrative = computed(() =>
    this.steps[this.currentStep()].fieldIds.includes(NARRATIVE_FIELD_ID),
  );

  protected readonly isDeclarationStep = computed(() => this.currentStep() === DECLARATION_STEP);

  protected readonly declarationConfirmed = computed(
    () => this.values()['declarationConfirmed'] === true,
  );

  /** Required-field progress for the step the user is on. */
  protected readonly stepProgress = computed(() => {
    const required = this.requiredIdsForStep(this.currentStep());
    const done = required.filter((id) => isFieldValueComplete(this.values()[id])).length;
    return { done, total: required.length };
  });

  protected narrativeControl(): FormControl {
    return this.form?.get(NARRATIVE_FIELD_ID) as FormControl;
  }

  protected narrativeField(): FormFieldDefinition {
    return this.template().fields.find((f) => f.id === NARRATIVE_FIELD_ID)!;
  }

  protected onFormReady(form: FormGroup): void {
    this.form = form;

    // Derived, non-template value: added as a control so it rides along with
    // every save without the page needing to know about it.
    if (!form.get(MG11_VULNERABLE_FLAG_KEY)) {
      form.addControl(MG11_VULNERABLE_FLAG_KEY, new FormControl(false), { emitEvent: false });
    }

    this.values.set(form.getRawValue() as Record<string, unknown>);
    form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.values.set(form.getRawValue() as Record<string, unknown>);
      if (this.declarationConfirmed()) this.declarationReminder.set(false);
    });

    this.currentStep.set(this.furthestIncompleteStep());
    this.markVisited(this.currentStep());
    this.formReady.emit(form);
  }

  /** Resuming lands on the first step with unfinished required fields. */
  private furthestIncompleteStep(): number {
    const values = this.form?.getRawValue() ?? {};
    for (let i = 0; i < this.steps.length; i++) {
      const required = this.requiredIdsForStep(i);
      if (required.some((id) => !isFieldValueComplete(values[id]))) return i;
    }
    return this.steps.length - 1;
  }

  private requiredIdsForStep(index: number): string[] {
    const byId = new Map(this.template().fields.map((f) => [f.id, f]));
    return this.steps[index].fieldIds.filter((id) => byId.get(id)?.required === true);
  }

  private markVisited(index: number): void {
    const next = new Set(this.visited());
    next.add(index);
    this.visited.set(next);
  }

  protected isVisited(index: number): boolean {
    return this.visited().has(index);
  }

  /** True once every required field on the step is complete. */
  protected isStepComplete(index: number): boolean {
    const required = this.requiredIdsForStep(index);
    return required.every((id) => isFieldValueComplete(this.values()[id]));
  }

  protected goTo(index: number): void {
    if (index < 0 || index >= this.steps.length) return;
    // Leaving the declaration step forward requires the tick.
    if (index > DECLARATION_STEP && !this.declarationConfirmed()) {
      this.currentStep.set(DECLARATION_STEP);
      this.markVisited(DECLARATION_STEP);
      this.declarationReminder.set(true);
      return;
    }
    if (index > this.currentStep() && !this.isVisited(index) && index > this.currentStep() + 1) {
      // Never skip ahead past unvisited steps via the header.
      return;
    }
    this.declarationReminder.set(false);
    this.currentStep.set(index);
    this.markVisited(index);
  }

  protected next(): void {
    this.goTo(this.currentStep() + 1);
  }

  protected back(): void {
    this.goTo(this.currentStep() - 1);
  }
}

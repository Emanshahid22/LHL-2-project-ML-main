import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  isFieldValueComplete,
  requiredFieldIds,
  type CaseSummaryDto,
  type FormDraftDto,
  type FormTemplate,
} from '@mgs/shared';
import { TemplatesService } from '../../core/services/templates.service';
import { DraftsService } from '../../core/services/drafts.service';
import { CasesService } from '../../core/services/cases.service';
import { AppIcon, formVisual, type FormVisual } from '../../shared/icon/app-icon';
import { CaseLinkDialog, CaseLinkDialogData, CaseLinkDialogResult } from './case-link-dialog';

/** How the work queue is ordered. */
export type DraftSort = 'recent' | 'code' | 'case';

/** Drafts shown before the "View all" toggle expands the queue. */
const DRAFT_PAGE_SIZE = 6;

/** One row of the work queue: the draft plus everything the row renders. */
interface DraftRow {
  draft: FormDraftDto;
  formName: string;
  /** Icon/accent for the form — presentation only. */
  visual: FormVisual;
  /** "URN — Defendant" for a linked case; null renders the Standalone chip. */
  caseLabel: string | null;
  savedRelative: string;
  /** Required-field progress, from the shared template helpers. */
  requiredDone: number;
  requiredTotal: number;
  requiredPercent: number;
  /** Lower-cased filter target: form code, form name, URN, defendant name. */
  haystack: string;
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

/** "2 hours ago" — the exact timestamp is exposed as the element's tooltip. */
function relativeSaved(iso: string, nowMs: number): string {
  const deltaSec = Math.round((new Date(iso).getTime() - nowMs) / 1000);
  const abs = Math.abs(deltaSec);
  if (abs < 45) return 'just now';
  if (abs < 3_600) return RELATIVE_TIME.format(Math.round(deltaSec / 60), 'minute');
  if (abs < 86_400) return RELATIVE_TIME.format(Math.round(deltaSec / 3_600), 'hour');
  if (abs < 2_592_000) return RELATIVE_TIME.format(Math.round(deltaSec / 86_400), 'day');
  if (abs < 31_536_000) return RELATIVE_TIME.format(Math.round(deltaSec / 2_592_000), 'month');
  return RELATIVE_TIME.format(Math.round(deltaSec / 31_536_000), 'year');
}

/** MG codes sort numerically, so MG5 precedes MG11 rather than following it. */
function formCodeRank(code: string): number {
  const digits = Number(code.replace(/\D+/g, ''));
  return Number.isFinite(digits) ? digits : Number.MAX_SAFE_INTEGER;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    AppIcon,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements OnInit {
  private readonly templatesService = inject(TemplatesService);
  private readonly draftsService = inject(DraftsService);
  private readonly casesService = inject(CasesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly templates = signal<FormTemplate[] | null>(null);
  protected readonly templatesError = signal(false);
  protected readonly drafts = signal<FormDraftDto[] | null>(null);
  protected readonly cases = signal<CaseSummaryDto[] | null>(null);
  protected readonly starting = signal(false);

  /** Work-queue controls. */
  protected readonly draftFilter = signal('');
  protected readonly draftSort = signal<DraftSort>('recent');
  protected readonly draftsExpanded = signal(false);
  protected readonly pageSize = DRAFT_PAGE_SIZE;

  /** Fixed at load so relative times stay stable while sorting/filtering. */
  private readonly now = signal(Date.now());

  private readonly templatesByCode = computed(() => {
    const byCode = new Map<string, FormTemplate>();
    for (const template of this.templates() ?? []) {
      byCode.set(template.code, template);
    }
    return byCode;
  });

  /** Every draft as a renderable row. Progress needs the draft's template, so
   *  rows recompute once the (already-fetched) templates arrive. */
  protected readonly draftRows = computed<DraftRow[]>(() => {
    const byCode = this.templatesByCode();
    const nowMs = this.now();
    return (this.drafts() ?? []).map((draft) => {
      const template = byCode.get(draft.formCode);
      const caseLabel = draft.case ? `${draft.case.urn} — ${draft.case.defendantName}` : null;
      const required = template ? requiredFieldIds(template) : [];
      const done = required.filter((id) => isFieldValueComplete(draft.values[id])).length;
      return {
        draft,
        formName: template?.name ?? draft.formCode,
        visual: formVisual(draft.formCode),
        caseLabel,
        savedRelative: relativeSaved(draft.updatedAt, nowMs),
        requiredDone: done,
        requiredTotal: required.length,
        requiredPercent: required.length === 0 ? 0 : Math.round((done / required.length) * 100),
        haystack: [draft.formCode, template?.name ?? '', caseLabel ?? 'Standalone']
          .join(' ')
          .toLowerCase(),
      };
    });
  });

  protected readonly filteredRows = computed<DraftRow[]>(() => {
    const term = this.draftFilter().trim().toLowerCase();
    const rows = term
      ? this.draftRows().filter((row) => row.haystack.includes(term))
      : [...this.draftRows()];

    switch (this.draftSort()) {
      case 'code':
        return rows.sort(
          (a, b) =>
            formCodeRank(a.draft.formCode) - formCodeRank(b.draft.formCode) ||
            b.draft.updatedAt.localeCompare(a.draft.updatedAt),
        );
      case 'case':
        // Standalone drafts have no case, so they sort last.
        return rows.sort(
          (a, b) =>
            Number(a.caseLabel === null) - Number(b.caseLabel === null) ||
            (a.caseLabel ?? '').localeCompare(b.caseLabel ?? '') ||
            b.draft.updatedAt.localeCompare(a.draft.updatedAt),
        );
      default:
        return rows.sort((a, b) => b.draft.updatedAt.localeCompare(a.draft.updatedAt));
    }
  });

  /** The rows actually rendered — capped until "View all" is pressed. */
  protected readonly visibleRows = computed<DraftRow[]>(() =>
    this.draftsExpanded() ? this.filteredRows() : this.filteredRows().slice(0, DRAFT_PAGE_SIZE),
  );

  protected readonly hiddenRowCount = computed(
    () => this.filteredRows().length - this.visibleRows().length,
  );

  ngOnInit(): void {
    this.loadTemplates();
    this.draftsService.getMyDrafts().subscribe({
      next: (drafts) => {
        this.now.set(Date.now());
        this.drafts.set(drafts);
      },
      error: () => this.drafts.set([]),
    });
    this.casesService.getMyCases().subscribe({
      next: (cases) => this.cases.set(cases),
      error: () => this.cases.set([]),
    });
  }

  protected loadTemplates(): void {
    this.templatesError.set(false);
    this.templates.set(null);
    this.templatesService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: () => this.templatesError.set(true),
    });
  }

  /** Hero stat tiles — real counts only, never derived scores. */
  protected readonly stats = computed(() => ({
    inProgress: this.drafts()?.length ?? null,
    cases: this.cases()?.length ?? null,
    forms: this.templates()?.length ?? null,
  }));

  protected visualFor(code: string): FormVisual {
    return formVisual(code);
  }

  /** The "Continue" button; the row itself remains a link to the same place. */
  protected continueDraft(row: DraftRow): void {
    this.router.navigate(['/drafts', row.draft.id]);
  }

  protected setDraftFilter(value: string): void {
    this.draftFilter.set(value);
  }

  protected toggleDraftsExpanded(): void {
    this.draftsExpanded.update((expanded) => !expanded);
  }

  /** UC-01 main flow: pick a form, then choose a case link (or standalone). */
  protected pickForm(template: FormTemplate): void {
    this.dialog
      .open<CaseLinkDialog, CaseLinkDialogData, CaseLinkDialogResult>(CaseLinkDialog, {
        data: { form: template },
        width: '540px',
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.startDraft(template.code, result.caseId);
        }
      });
  }

  private startDraft(formCode: string, caseId: string | null): void {
    this.starting.set(true);
    this.draftsService.create({ formCode, caseId }).subscribe({
      next: (res) => {
        this.router.navigate(['/drafts', res.draft.id], {
          state: res.caseLinkWarning ? { caseLinkWarning: res.caseLinkWarning } : undefined,
        });
      },
      error: () => {
        this.starting.set(false);
        this.snackBar.open('Could not start the form. Please try again.', 'Dismiss', {
          duration: 5000,
        });
      },
    });
  }
}

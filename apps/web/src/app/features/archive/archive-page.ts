import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import type { ArchiveLineageEntryDto, CaseSummaryDto, FormTemplate } from '@mgs/shared';
import { ArchiveService, ArchiveFilters } from '../../core/services/archive.service';
import { CasesService } from '../../core/services/cases.service';
import { TemplatesService } from '../../core/services/templates.service';
import { LinkCaseDialog } from './link-case-dialog';
import { VersionDrawer } from './version-drawer';

/**
 * UC-10: the MG Forms archive (LER-1184/1185/1186) — the caller's standalone
 * AND case-linked lineages, searchable by case, form type, date and status
 * (the scope's four fields, nothing invented), all filtering server-side.
 * Standalone rows carry the manual case-link action; its 409/404 outcomes
 * surface exactly as the API words them (content-free by construction).
 */
@Component({
  selector: 'app-archive-page',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    VersionDrawer,
  ],
  templateUrl: './archive-page.html',
  styleUrl: './archive-page.scss',
})
export class ArchivePage implements OnInit {
  private readonly archive = inject(ArchiveService);
  private readonly casesService = inject(CasesService);
  private readonly templatesService = inject(TemplatesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly entries = signal<ArchiveLineageEntryDto[]>([]);
  protected readonly cases = signal<CaseSummaryDto[]>([]);
  protected readonly templates = signal<FormTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly expanded = signal<string | null>(null);

  // LER-1186's four filters — case, form type, date, status.
  protected filterForm = '';
  protected filterCase = '';
  protected filterFrom = '';
  protected filterTo = '';
  protected filterStatus = '';

  ngOnInit(): void {
    this.casesService.getMyCases().subscribe((c) => this.cases.set(c));
    this.templatesService.getTemplates().subscribe((t) => this.templates.set(t));
    this.search();
  }

  protected search(): void {
    this.loading.set(true);
    const filters: ArchiveFilters = {
      formCode: this.filterForm || undefined,
      caseId: this.filterCase || undefined,
      from: this.filterFrom || undefined,
      to: this.filterTo || undefined,
      status: this.filterStatus || undefined,
    };
    this.archive.list(filters).subscribe({
      next: (res) => {
        this.entries.set(res.entries);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected caseName(caseId: string | null): string {
    if (!caseId) return '—';
    const found = this.cases().find((c) => c.id === caseId);
    return found ? `R v ${found.defendantName}` : 'Case';
  }

  protected toggle(lineageId: string): void {
    this.expanded.set(this.expanded() === lineageId ? null : lineageId);
  }

  protected openLinkDialog(entry: ArchiveLineageEntryDto): void {
    this.dialog
      .open<LinkCaseDialog, void, string | null>(LinkCaseDialog)
      .afterClosed()
      .subscribe((caseId) => {
        if (!caseId) return;
        this.archive.link(entry.lineageId, caseId).subscribe({
          next: () => {
            this.snackBar.open('Form linked to the case.', undefined, { duration: 3000 });
            this.search();
          },
          error: (err) => {
            // The server's reason is content-free by construction (409
            // already linked / 404 case not found) — surfaced verbatim.
            const message =
              typeof err?.error?.message === 'string'
                ? err.error.message
                : 'The form could not be linked.';
            this.snackBar.open(message, undefined, { duration: 5000 });
          },
        });
      });
  }
}

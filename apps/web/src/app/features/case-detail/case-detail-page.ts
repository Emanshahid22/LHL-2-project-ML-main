import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { CaseSummaryDto } from '@mgs/shared';
import { CasesService } from '../../core/services/cases.service';
import { DraftsService } from '../../core/services/drafts.service';
import {
  FormPickerDialog,
  FormPickerDialogData,
  FormPickerDialogResult,
} from './form-picker-dialog';
import { CaseDocuments } from './case-documents';

@Component({
  selector: 'app-case-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    CaseDocuments,
  ],
  templateUrl: './case-detail-page.html',
  styleUrl: './case-detail-page.scss',
})
export class CaseDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly casesService = inject(CasesService);
  private readonly draftsService = inject(DraftsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly caseDetail = signal<CaseSummaryDto | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading.set(true);
    this.loadFailed.set(false);
    this.casesService.getCase(id).subscribe({
      next: (c) => {
        this.caseDetail.set(c);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Pre-linked initiation: the case is fixed, only the form is chosen. */
  protected completeForm(): void {
    const caseDetail = this.caseDetail();
    if (!caseDetail) return;
    this.dialog
      .open<FormPickerDialog, FormPickerDialogData, FormPickerDialogResult>(FormPickerDialog, {
        data: { case: caseDetail },
        width: '560px',
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.draftsService.create({ formCode: result.formCode, caseId: caseDetail.id }).subscribe({
          next: (res) => {
            this.router.navigate(['/drafts', res.draft.id], {
              state: res.caseLinkWarning ? { caseLinkWarning: res.caseLinkWarning } : undefined,
            });
          },
          error: () => {
            this.snackBar.open('Could not start the form. Please try again.', 'Dismiss', {
              duration: 5000,
            });
          },
        });
      });
  }
}

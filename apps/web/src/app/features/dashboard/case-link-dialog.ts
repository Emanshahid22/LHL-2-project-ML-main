import { Component, inject, signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import type { CaseSummaryDto, FormTemplate } from '@mgs/shared';
import { CasesService } from '../../core/services/cases.service';

export interface CaseLinkDialogData {
  form: FormTemplate;
}

export interface CaseLinkDialogResult {
  /** null = standalone form */
  caseId: string | null;
}

const STANDALONE = 'standalone';

/**
 * UC-01 step 2: after picking a form, the user links it to one of their
 * accessible cases or starts it standalone.
 */
@Component({
  selector: 'app-case-link-dialog',
  imports: [MatDialogModule, MatButtonModule, MatRadioModule, MatProgressSpinnerModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Link to a case?</h2>
    <mat-dialog-content>
      <p class="intro">
        Starting <strong>{{ data.form.code }} — {{ data.form.name }}</strong
        >. Link it to one of your cases, or complete it standalone.
      </p>

      @if (loading()) {
        <div class="spinner-row"><mat-spinner diameter="28" /></div>
      } @else {
        @if (loadFailed()) {
          <p class="load-error">
            Your case list could not be loaded, so the form can only be started standalone right
            now.
          </p>
        }
        <mat-radio-group class="case-list" [(ngModel)]="selection">
          @for (c of cases(); track c.id) {
            <mat-radio-button [value]="c.id">
              <span class="case-urn">{{ c.urn }}</span>
              <span class="case-defendant">{{ c.defendantName }}</span>
              <span class="case-offence">{{ c.offenceSummary }}</span>
            </mat-radio-button>
          }
          <mat-radio-button [value]="'${STANDALONE}'">
            <span class="case-urn">Standalone</span>
            <span class="case-offence">Complete without linking to a case</span>
          </mat-radio-button>
        </mat-radio-group>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button matButton="filled" type="button" [disabled]="!selection || loading()" (click)="confirm()">
        Start form
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .intro { margin-top: 0; }
    .spinner-row { display: flex; justify-content: center; padding: 24px; }
    .load-error { color: var(--mat-sys-error, #b3261e); font-size: 0.85rem; }
    .case-list { display: flex; flex-direction: column; gap: 4px; }
    mat-radio-button ::ng-deep .mdc-label { display: flex; flex-direction: column; padding: 6px 0; }
    .case-urn { font-weight: 600; font-family: monospace; }
    .case-defendant { font-size: 0.9rem; }
    .case-offence { font-size: 0.8rem; opacity: 0.7; }
  `,
})
export class CaseLinkDialog {
  protected readonly data = inject<CaseLinkDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CaseLinkDialog>);
  private readonly casesService = inject(CasesService);

  protected readonly cases = signal<CaseSummaryDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected selection: string | null = null;

  constructor() {
    this.casesService.getMyCases().subscribe({
      next: (cases) => {
        this.cases.set(cases);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected confirm(): void {
    if (!this.selection) return;
    const result: CaseLinkDialogResult = {
      caseId: this.selection === STANDALONE ? null : this.selection,
    };
    this.dialogRef.close(result);
  }
}

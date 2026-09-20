import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { CaseSummaryDto, FormTemplate } from '@mgs/shared';
import { TemplatesService } from '../../core/services/templates.service';

export interface FormPickerDialogData {
  case: CaseSummaryDto;
}

export interface FormPickerDialogResult {
  formCode: string;
}

/**
 * UC-01 alternative flow: from a case detail page the case is already
 * chosen, so the user only picks which MG form to complete.
 */
@Component({
  selector: 'app-form-picker-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Complete MG form</h2>
    <mat-dialog-content>
      <p class="intro">
        For case <strong class="urn">{{ data.case.urn }}</strong> ({{ data.case.defendantName }}).
        Choose the form to complete:
      </p>
      @if (templates(); as forms) {
        <div class="form-list">
          @for (form of forms; track form.code) {
            <button
              type="button"
              class="form-option"
              [attr.data-form-code]="form.code"
              (click)="choose(form)"
            >
              <span class="code">{{ form.code }}</span>
              <span class="name">{{ form.name }}</span>
              <span class="desc">{{ form.description }}</span>
            </button>
          }
        </div>
      } @else if (loadFailed()) {
        <div class="error-panel">
          <p>The form list could not be loaded.</p>
          <button matButton="filled" type="button" (click)="load()">Retry</button>
        </div>
      } @else {
        <div class="spinner-row"><mat-spinner diameter="28" /></div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
    </mat-dialog-actions>
  `,
  styles: `
    .intro { margin-top: 0; }
    .urn { font-family: monospace; }
    .spinner-row { display: flex; justify-content: center; padding: 24px; }
    .form-list { display: flex; flex-direction: column; gap: 6px; }
    .form-option {
      display: grid;
      grid-template-columns: 56px 1fr;
      grid-template-areas: 'code name' 'code desc';
      gap: 0 10px;
      text-align: left;
      padding: 10px 12px;
      border: 1px solid var(--mat-sys-outline-variant, #ddd);
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
      font: inherit;
    }
    .form-option:hover { background: var(--mat-sys-surface-container, #f2f4f8); }
    .code { grid-area: code; font-family: monospace; font-weight: 700; color: var(--mat-sys-primary); align-self: center; }
    .name { grid-area: name; font-weight: 500; }
    .desc { grid-area: desc; font-size: 0.8rem; opacity: 0.7; }
    .error-panel { color: var(--mat-sys-error, #b3261e); }
  `,
})
export class FormPickerDialog {
  protected readonly data = inject<FormPickerDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<FormPickerDialog>);
  private readonly templatesService = inject(TemplatesService);

  protected readonly templates = signal<FormTemplate[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.templates.set(null);
    this.templatesService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: () => this.loadFailed.set(true),
    });
  }

  protected choose(form: FormTemplate): void {
    const result: FormPickerDialogResult = { formCode: form.code };
    this.dialogRef.close(result);
  }
}

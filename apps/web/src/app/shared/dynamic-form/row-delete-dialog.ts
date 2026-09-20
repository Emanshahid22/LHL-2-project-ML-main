import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface RowDeleteDialogData {
  /** The row's displayed number, so the prompt names what is being removed. */
  ordinal: number;
  /** The row's own reference or description, when it has one yet. */
  summary: string | null;
  /** How many later rows will take a new number if this goes ahead. */
  renumbering: number;
  /** Singular noun for a row of this group, e.g. "item". */
  noun: string;
}

/**
 * UC-04: confirmation before a row is deleted (LER-1086).
 *
 * Deletion is destructive twice over — the row's data goes, and every later row
 * changes number. The prompt states both, because a user who expected only the
 * first would not know to re-check references elsewhere in the file. Cancel
 * resolves to nothing at all, so the caller performs no operation.
 */
@Component({
  selector: 'app-row-delete-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Delete {{ data.noun }} {{ data.ordinal }}?</h2>
    <mat-dialog-content data-testid="renumber-confirm">
      @if (data.summary) {
        <p class="summary">
          <span class="noun">{{ data.noun }}</span> {{ data.ordinal }}:
          <strong>{{ data.summary }}</strong>
        </p>
      }
      <p>
        This removes the {{ data.noun }} and everything recorded against it.
        @if (data.renumbering > 0) {
          The {{ data.renumbering }} {{ data.noun }}{{ data.renumbering === 1 ? '' : 's' }} after it
          {{ data.renumbering === 1 ? 'is' : 'are' }} renumbered, so numbering stays continuous.
        } @else {
          No other {{ data.noun }} changes number.
        }
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button" data-testid="cancel-delete">Cancel</button>
      <button
        matButton="filled"
        type="button"
        class="confirm-delete"
        data-testid="confirm-delete"
        (click)="dialogRef.close(true)"
      >
        Delete and renumber
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .summary { margin-top: 0; }
    .noun { text-transform: capitalize; }
    .confirm-delete { --mat-button-filled-container-color: var(--mat-sys-error, #b3261e); }
  `,
})
export class RowDeleteDialog {
  protected readonly data = inject<RowDeleteDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<RowDeleteDialog, boolean>);
}

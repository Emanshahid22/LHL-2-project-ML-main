import { Component, OnInit, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import type { CaseSummaryDto } from '@mgs/shared';
import { CasesService } from '../../core/services/cases.service';

/**
 * UC-10 (LER-1185): pick the case a standalone archived form attaches to.
 * The dialog only picks — the POST and its content-free error surfaces
 * belong to the archive page.
 */
@Component({
  selector: 'app-link-case-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    FormsModule,
  ],
  template: `
    <h2 mat-dialog-title>Link to a case</h2>
    <mat-dialog-content>
      <p class="intro">
        The form's whole version history attaches to the case you pick. Linking cannot be undone.
      </p>
      @if (loading()) {
        <div class="spinner-row"><mat-spinner diameter="24" /></div>
      } @else {
        <mat-radio-group [(ngModel)]="selected" class="case-list" data-testid="link-case-options">
          @for (c of cases(); track c.id) {
            <mat-radio-button [value]="c.id" [attr.data-testid]="'link-case-' + c.urn">
              {{ c.urn }} — R v {{ c.defendantName }}
            </mat-radio-button>
          }
        </mat-radio-group>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="ref.close(null)">Cancel</button>
      <button
        matButton="filled"
        type="button"
        data-testid="link-case-confirm"
        [disabled]="!selected"
        (click)="ref.close(selected)"
      >
        Link to case
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .case-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .intro {
      max-width: 26rem;
    }
  `,
})
export class LinkCaseDialog implements OnInit {
  protected readonly ref = inject(MatDialogRef<LinkCaseDialog, string | null>);
  private readonly casesService = inject(CasesService);

  protected readonly cases = signal<CaseSummaryDto[]>([]);
  protected readonly loading = signal(true);
  protected selected: string | null = null;

  ngOnInit(): void {
    this.casesService.getMyCases().subscribe({
      next: (cases) => {
        this.cases.set(cases);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

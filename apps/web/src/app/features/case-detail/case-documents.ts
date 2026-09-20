import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { ArchiveLineageEntryDto } from '@mgs/shared';
import { ArchiveService } from '../../core/services/archive.service';
import { VersionDrawer } from '../archive/version-drawer';

/**
 * UC-10: the case's Documents section — the "MG Forms" folder (LER-1172/
 * 1173). ONE primary row per lineage and it is always the CURRENT version
 * (DoD line 4: "Case file Documents section shows the correct current
 * version as the primary entry"); superseded versions live only in the
 * drawer a row expands into.
 */
@Component({
  selector: 'app-case-documents',
  imports: [DatePipe, MatButtonModule, MatCardModule, MatProgressSpinnerModule, VersionDrawer],
  template: `
    <mat-card appearance="outlined" class="documents-card" data-testid="case-documents">
      <mat-card-header>
        <mat-card-title>Documents</mat-card-title>
        <mat-card-subtitle>MG Forms</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <div class="spinner-row"><mat-spinner diameter="24" /></div>
        } @else if (lineages().length === 0) {
          <p class="empty" data-testid="case-documents-empty">
            No generated MG forms are filed on this case yet.
          </p>
        } @else {
          @for (entry of lineages(); track entry.lineageId) {
            <div class="doc-lineage" [attr.data-testid]="'case-doc-' + entry.lineageId">
              <div class="doc-primary" data-testid="case-doc-primary">
                <span class="doc-form" data-testid="doc-form">{{ entry.current.formCode }}</span>
                <span class="doc-version" data-testid="doc-version"
                  >V{{ entry.current.versionNumber }} — {{ entry.current.label }}</span
                >
                <span class="doc-date" data-testid="doc-date">{{
                  entry.current.createdAt | date: 'dd/MM/yyyy'
                }}</span>
                <span class="doc-by" data-testid="doc-by">{{
                  entry.current.generatedByName
                }}</span>
                <span class="doc-status" data-testid="doc-status">{{ entry.status }}</span>
                <button
                  matButton
                  type="button"
                  data-testid="doc-history-toggle"
                  (click)="toggle(entry.lineageId)"
                >
                  {{ expanded() === entry.lineageId ? 'Hide history' : 'History' }}
                  ({{ entry.versionCount }})
                </button>
              </div>
              @if (expanded() === entry.lineageId) {
                <app-version-drawer [lineageId]="entry.lineageId" />
              }
            </div>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .documents-card {
      margin-top: 1rem;
    }
    .doc-primary {
      display: flex;
      gap: 1rem;
      align-items: center;
      padding: 0.45rem 0;
      font-size: 0.92rem;
    }
    .doc-form {
      font-weight: 600;
      min-width: 3.5rem;
    }
    .doc-version {
      min-width: 10rem;
    }
    .doc-by {
      flex: 1;
      color: var(--app-text-muted, rgba(0, 0, 0, 0.6));
    }
    .doc-lineage + .doc-lineage {
      border-top: 1px solid var(--app-divider, rgba(0, 0, 0, 0.08));
    }
    .empty {
      color: var(--app-text-muted, rgba(0, 0, 0, 0.6));
    }
  `,
})
export class CaseDocuments implements OnInit {
  private readonly archive = inject(ArchiveService);

  readonly caseId = input.required<string>();

  protected readonly lineages = signal<ArchiveLineageEntryDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly expanded = signal<string | null>(null);

  ngOnInit(): void {
    this.archive.getCaseDocuments(this.caseId()).subscribe({
      next: (res) => {
        this.lineages.set(res.lineages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected toggle(lineageId: string): void {
    this.expanded.set(this.expanded() === lineageId ? null : lineageId);
  }
}

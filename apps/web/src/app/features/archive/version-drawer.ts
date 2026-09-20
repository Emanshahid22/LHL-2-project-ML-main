import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import {
  SENSITIVE_PERMISSION_LEVEL,
  type ArchiveDiffResponse,
  type ArchivedVersionDto,
} from '@mgs/shared';
import { ArchiveService } from '../../core/services/archive.service';
import { UserService } from '../../core/services/user.service';

/**
 * UC-10: the version history drawer (LER-1178/1179/1180) and the diff view
 * (LER-1183). Every row shows the scope's exact fields — number, label,
 * generated date, generator, download link — oldest first, straight from
 * GET /archive/lineages/:id/versions.
 *
 * The withheld state (stage-3 item 6): a sensitive-bearing version for a
 * viewer without the permission names the LEVEL, never the content — the
 * UC-07 locked-section presentation. The chip is a courtesy; the API's
 * serve-time re-check is the enforcement, and it answers 403 regardless of
 * what this template renders.
 *
 * The diff renders ONLY what the endpoint returned for THIS caller, held in
 * a transient signal and refetched on every compare — a permitted caller's
 * diff is never cached into any state a later unpermitted view could read.
 */
@Component({
  selector: 'app-version-drawer',
  imports: [DatePipe, FormsModule, MatButtonModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    @if (loading()) {
      <div class="drawer-loading"><mat-spinner diameter="22" /></div>
    } @else {
      <div class="version-list" data-testid="version-drawer">
        @for (v of versions(); track v.id) {
          <div class="version-row" [attr.data-testid]="'version-row-' + v.versionNumber">
            <span class="v-num" data-testid="version-number">V{{ v.versionNumber }}</span>
            <span class="v-label" data-testid="version-label">{{ v.label }}</span>
            <span class="v-date" data-testid="version-date">{{
              v.createdAt | date: 'dd/MM/yyyy'
            }}</span>
            <span class="v-by" data-testid="version-generator">{{ v.generatedByName }}</span>
            @if (v.containsSensitive && !viewerPermitted()) {
              <span class="v-withheld" data-testid="version-withheld"
                >Contains sensitive material — requires {{ permissionLevel }}</span
              >
            } @else {
              <a
                class="v-download"
                data-testid="version-download"
                [href]="'/api/documents/' + v.documentId + '/download'"
                >Download</a
              >
            }
          </div>
        }
      </div>

      @if (versions().length > 1) {
        <div class="diff-controls" data-testid="diff-controls">
          <mat-select
            class="diff-select"
            [(ngModel)]="diffFrom"
            aria-label="Compare from version"
            data-testid="diff-from"
          >
            @for (v of versions(); track v.id) {
              <mat-option [value]="v.versionNumber">V{{ v.versionNumber }}</mat-option>
            }
          </mat-select>
          <span class="diff-arrow" aria-hidden="true">→</span>
          <mat-select
            class="diff-select"
            [(ngModel)]="diffTo"
            aria-label="Compare to version"
            data-testid="diff-to"
          >
            @for (v of versions(); track v.id) {
              <mat-option [value]="v.versionNumber">V{{ v.versionNumber }}</mat-option>
            }
          </mat-select>
          <button matButton type="button" data-testid="diff-compare" (click)="compare()">
            Compare
          </button>
        </div>
        @if (diff(); as d) {
          <div class="diff-result" data-testid="diff-result">
            @if (d.entries.length === 0) {
              <p class="diff-empty" data-testid="diff-empty">
                No visible differences between V{{ d.from }} and V{{ d.to }}.
              </p>
            }
            @for (entry of d.entries; track entry.fieldId) {
              <div class="diff-entry" [attr.data-testid]="'diff-entry-' + entry.fieldId">
                <span class="diff-field">{{ entry.label }}</span>
                <span class="diff-kind">{{ entry.kind }}</span>
                @if (entry.kind !== 'added') {
                  <span class="diff-from" data-testid="diff-value-from">{{
                    display(entry.from)
                  }}</span>
                }
                @if (entry.kind === 'changed') {
                  <span class="diff-arrow" aria-hidden="true">→</span>
                }
                @if (entry.kind !== 'removed') {
                  <span class="diff-to" data-testid="diff-value-to">{{ display(entry.to) }}</span>
                }
              </div>
            }
          </div>
        }
      }
    }
  `,
  styles: `
    .drawer-loading {
      padding: 0.75rem;
    }
    .version-row {
      display: flex;
      gap: 1rem;
      align-items: baseline;
      padding: 0.4rem 0;
      border-bottom: 1px solid var(--app-divider, rgba(0, 0, 0, 0.08));
      font-size: 0.9rem;
    }
    .v-num {
      font-weight: 600;
      min-width: 2.5rem;
    }
    .v-label {
      min-width: 8rem;
    }
    .v-by {
      flex: 1;
      color: var(--app-text-muted, rgba(0, 0, 0, 0.6));
    }
    .v-withheld {
      font-style: italic;
      color: var(--app-text-muted, rgba(0, 0, 0, 0.6));
    }
    .diff-controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.75rem;
    }
    .diff-select {
      width: 5.5rem;
    }
    .diff-entry {
      display: flex;
      gap: 0.6rem;
      align-items: baseline;
      padding: 0.3rem 0;
      font-size: 0.88rem;
    }
    .diff-field {
      font-weight: 600;
    }
    .diff-kind {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--app-text-muted, rgba(0, 0, 0, 0.6));
    }
    .diff-from {
      text-decoration: line-through;
      opacity: 0.75;
      white-space: pre-wrap;
    }
    .diff-to {
      white-space: pre-wrap;
    }
  `,
})
export class VersionDrawer implements OnInit {
  private readonly archive = inject(ArchiveService);
  private readonly userService = inject(UserService);

  readonly lineageId = input.required<string>();

  protected readonly versions = signal<ArchivedVersionDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly diff = signal<ArchiveDiffResponse | null>(null);
  private readonly user = signal<{ sensitiveMaterialAccess: boolean } | null>(null);
  protected readonly viewerPermitted = computed(
    () => this.user()?.sensitiveMaterialAccess === true,
  );
  protected readonly permissionLevel = SENSITIVE_PERMISSION_LEVEL;

  protected diffFrom = 1;
  protected diffTo = 1;

  ngOnInit(): void {
    // Same guard class as the shell's user signal: a /me failure must never
    // escape to the global handler — the drawer just keeps its null state.
    this.userService.getCurrentUser().subscribe({ next: (u) => this.user.set(u), error: () => {} });
    this.archive.getVersions(this.lineageId()).subscribe({
      next: (versions) => {
        this.versions.set(versions);
        this.diffFrom = versions[0]?.versionNumber ?? 1;
        this.diffTo = versions[versions.length - 1]?.versionNumber ?? 1;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected compare(): void {
    this.diff.set(null);
    this.archive
      .getDiff(this.lineageId(), this.diffFrom, this.diffTo)
      .subscribe((d) => this.diff.set(d));
  }

  protected display(value: unknown): string {
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

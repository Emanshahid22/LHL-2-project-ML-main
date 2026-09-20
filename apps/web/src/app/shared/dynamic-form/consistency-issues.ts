import { Component, computed, input } from '@angular/core';
import type { ValidationFinding } from '@mgs/shared';

/**
 * UC-05 Consistency Issues panel.
 *
 * Cross-field findings live here rather than in a field's inline error slot,
 * because the scope requires it — "Cross-field errors shown in a 'Consistency
 * Issues' panel below the form section, not inline" — and because a finding
 * about two fields has no single field to sit under.
 *
 * Three kinds of row, deliberately distinguishable:
 *  - an **error**: an impossible combination (a charge before its offence).
 *  - an **advisory**: unusual but legitimate (a statement after the first
 *    hearing, which is ordinary practice for a further statement).
 *  - a **suppressed** check: the comparison could not run because the case file
 *    was ambiguous. Reported so the silence is explained rather than mistaken
 *    for a pass.
 *
 * Colour: amber for advisory, Material's error token for errors. Red stays
 * reserved for UC-07 sensitive material.
 */
@Component({
  selector: 'app-consistency-issues',
  template: `
    @if (findings().length > 0) {
      <section class="consistency" role="status" data-testid="consistency-issues">
        <h3 class="consistency-title">
          Consistency Issues
          <span class="count" data-testid="consistency-count">{{ findings().length }}</span>
        </h3>

        <ul class="issue-list">
          @for (finding of ordered(); track finding.fieldId + finding.message) {
            <li
              class="issue"
              [class.is-error]="!finding.suppressed && finding.severity === 'error'"
              [class.is-advisory]="!finding.suppressed && finding.severity === 'advisory'"
              [class.is-suppressed]="finding.suppressed"
              data-testid="consistency-issue"
              [attr.data-issue-field]="finding.fieldId"
              [attr.data-issue-related]="finding.relatedFieldId ?? null"
              [attr.data-severity]="finding.suppressed ? 'suppressed' : finding.severity"
            >
              <span class="issue-badge" aria-hidden="true">{{ badge(finding) }}</span>
              <span class="issue-text">{{ finding.message }}</span>
            </li>
          }
        </ul>

        @if (unverified()) {
          <!-- A clean panel is not sign-off. Most templates are unverified, and
               this is exactly where a user would over-read an absence. -->
          <p class="consistency-caveat" data-testid="consistency-caveat">
            These checks test the values against our rules, not the rules against the real form. This
            template has not been confirmed by a practitioner, so passing them is not sign-off.
          </p>
        }
      </section>
    }
  `,
  styles: `
    .consistency {
      margin-top: 16px;
      padding: 14px 16px;
      border: 1px solid var(--mg-border);
      border-left: 3px solid var(--mg-amber-500);
      border-radius: 10px;
      background: var(--mg-surface);
    }
    .consistency-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px;
      font-size: 0.95rem;
      font-weight: 600;
    }
    .count {
      display: inline-block;
      min-width: 20px;
      padding: 0 6px;
      border-radius: 10px;
      background: var(--mg-amber-050);
      color: var(--mg-amber-700);
      font-size: 0.75rem;
      font-weight: 700;
      text-align: center;
    }
    .issue-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .issue {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .issue-badge {
      flex: none;
      min-width: 4.6rem;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.66rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: center;
    }
    .is-error .issue-badge {
      background: var(--mat-sys-error-container, #f9dedc);
      color: var(--mat-sys-on-error-container, #410e0b);
    }
    .is-advisory .issue-badge {
      background: var(--mg-amber-050);
      color: var(--mg-amber-700);
    }
    .is-suppressed .issue-badge {
      background: var(--mg-surface-sunken);
      color: var(--mg-ink-500);
    }
    .is-suppressed .issue-text {
      color: var(--mg-ink-500);
    }
    .consistency-caveat {
      margin: 10px 0 0;
      font-size: 0.75rem;
      color: var(--mg-ink-500);
    }
  `,
})
export class ConsistencyIssues {
  readonly findings = input<ValidationFinding[]>([]);
  /** True when the template's field set is not practitioner-verified. */
  readonly unverified = input(false);

  /** Errors first, then advisories, then checks that could not run. */
  protected readonly ordered = computed(() => {
    const rank = (f: ValidationFinding) => (f.suppressed ? 2 : f.severity === 'error' ? 0 : 1);
    return [...this.findings()].sort((a, b) => rank(a) - rank(b));
  });

  protected badge(finding: ValidationFinding): string {
    if (finding.suppressed) return 'Not checked';
    return finding.severity === 'error' ? 'Error' : 'Check';
  }
}

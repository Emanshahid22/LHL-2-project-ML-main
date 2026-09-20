import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  ADVISORY_REASON_MAX_CHARS,
  AdvisoryAcknowledgement,
  QUALITY_CHECK_TITLES,
  QualityCheckResult,
  QualityIssue,
  QualityReport,
} from '@mgs/shared';

/**
 * UC-08: the review checklist — the quality report as a solicitor works it.
 *
 * Issues are grouped BLOCKING / ADVISORY / COULD NOT COMPLETE. Blocking rows
 * carry no acknowledgement control of any kind: the distinction from advisory
 * handling is structural, not a disabled button (LER-1148). Advisory rows take
 * a required free-text reason (LER-1149/1106); the reasons travel with the
 * finalise request and are audited verbatim server-side, which also re-runs
 * the whole engine — this panel gates the BUTTON, the API gates the act.
 */
@Component({
  selector: 'app-review-panel',
  imports: [MatButtonModule],
  templateUrl: './review-panel.html',
  styleUrl: './review-panel.scss',
})
export class ReviewPanel {
  readonly report = input.required<QualityReport>();
  readonly finalising = input(false);
  readonly finaliseError = input<string | null>(null);
  readonly jump = output<QualityIssue>();
  readonly finalise = output<AdvisoryAcknowledgement[]>();
  readonly rerun = output<void>();

  protected readonly titles = QUALITY_CHECK_TITLES;
  protected readonly reasonMax = ADVISORY_REASON_MAX_CHARS;

  /** Reasons keyed by issue id. Reset by a fresh report on purpose (Q7): a
   *  reason given for last week's finding must not silently cover today's. */
  protected readonly reasons = signal<Record<string, string>>({});

  protected readonly blocking = computed(() =>
    this.report().checks.flatMap((c) => c.issues.filter((i) => i.severity === 'blocking')),
  );
  protected readonly advisory = computed(() =>
    this.report().checks.flatMap((c) => c.issues.filter((i) => i.severity === 'advisory')),
  );
  protected readonly incomplete = computed(() =>
    this.report().checks.filter((c) => c.status === 'incomplete'),
  );

  protected readonly clean = computed(
    () =>
      this.blocking().length === 0 &&
      this.advisory().length === 0 &&
      this.incomplete().length === 0,
  );

  /** The button's half of the gate; the server re-checks regardless. */
  protected readonly canFinalise = computed(
    () =>
      this.report().readyToFinalise &&
      this.advisory().every((i) => this.reasonFor(i.id).trim().length > 0),
  );

  protected reasonFor(issueId: string): string {
    return this.reasons()[issueId] ?? '';
  }

  protected setReason(issueId: string, value: string): void {
    this.reasons.set({ ...this.reasons(), [issueId]: value });
  }

  protected onFinalise(): void {
    if (!this.canFinalise()) return;
    this.finalise.emit(
      this.advisory().map((i) => ({ issueId: i.id, reason: this.reasonFor(i.id).trim() })),
    );
  }

  protected checkStatusWord(check: QualityCheckResult): string {
    return check.status === 'clean'
      ? 'clean'
      : check.status === 'issues'
        ? `${check.issues.length} issue${check.issues.length === 1 ? '' : 's'}`
        : 'could not complete';
  }
}

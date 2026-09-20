import { Injectable, signal } from '@angular/core';

/**
 * UC-06 session state for the Legal Language Assistant.
 *
 * Everything here lasts for the session and no longer, which is what the scope
 * specifies in both places it mentions state: dismissed suggestions "do not
 * re-appear for that session", and the assistance toggle "persists for the
 * duration of the session only — resets to enabled on next session".
 *
 * Deliberately NOT persisted to the draft. A dismissal saved onto a draft would
 * silently hide a prompt from a colleague who opens the same case later and
 * never made that decision — and they would have no way of knowing a prompt had
 * been suppressed.
 *
 * It lives in a root service rather than in the component so the state survives
 * navigating between drafts and MG11's wizard steps, both of which destroy and
 * rebuild the narrative component.
 */
@Injectable({ providedIn: 'root' })
export class AssistantSession {
  /**
   * The scope's panel toggle. Off hides every suggestion and clears the informal
   * highlights; UC-03's hearsay and opinion flags are unaffected, because those
   * are not language assistance and switching this off must not quietly remove a
   * UC-03 behaviour the user never asked about.
   */
  readonly enabled = signal(true);

  /**
   * null = the user has not touched the panel, so it opens when a narrative takes
   * focus (the scope: "appears when a narrative field is focused"). Once they
   * collapse it, focus no longer reopens it — a user who closed it meant it —
   * and it stays that way until they open it again.
   */
  readonly panelOpen = signal<boolean | null>(null);

  private readonly dismissedIds = signal<ReadonlySet<string>>(new Set());

  isDismissed(promptId: string): boolean {
    return this.dismissedIds().has(promptId);
  }

  dismiss(promptId: string): void {
    const next = new Set(this.dismissedIds());
    next.add(promptId);
    this.dismissedIds.set(next);
  }

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
  }

  setPanelOpen(open: boolean): void {
    this.panelOpen.set(open);
  }
}

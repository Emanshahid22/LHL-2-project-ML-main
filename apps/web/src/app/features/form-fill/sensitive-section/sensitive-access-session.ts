import { Injectable, signal } from '@angular/core';

/**
 * UC-07 step-up state (LER-1251): which draft's sensitive section this
 * rendering context has confirmed, and the confirmation id the save path must
 * carry.
 *
 * MEMORY ONLY — deliberately never localStorage, sessionStorage or a cookie.
 * Persisting the confirmation anywhere would silently convert "acknowledged on
 * each access" into "acknowledged once, ever". A reload, a new tab, or
 * navigating away and back (the page resets this on load) all start locked
 * again, and each fresh confirmation is a new persisted row server-side.
 */
@Injectable({ providedIn: 'root' })
export class SensitiveAccessSession {
  private readonly state = signal<{ draftId: string; confirmationId: string } | null>(null);

  /** Called by the form page on every load — the boundary of one "access". */
  reset(): void {
    this.state.set(null);
  }

  unlock(draftId: string, confirmationId: string): void {
    this.state.set({ draftId, confirmationId });
  }

  isUnlocked(draftId: string): boolean {
    return this.state()?.draftId === draftId;
  }

  /** The id the autosave PATCH carries while the section is unlocked. */
  confirmationIdFor(draftId: string): string | null {
    const s = this.state();
    return s && s.draftId === draftId ? s.confirmationId : null;
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import type {
  AssistancePrompt,
  LanguageInsertRequest,
  LanguagePromptsResponse,
} from '@mgs/shared';
import { sanitiseAssistancePrompts } from '@mgs/shared';

/** What the panel needs to know after asking for prompts. */
export interface RemoteAssistance {
  prompts: AssistancePrompt[];
  /** True when a service is configured but did not answer usefully. */
  degraded: boolean;
}

const NOTHING: RemoteAssistance = { prompts: [], degraded: false };

/**
 * UC-06 client boundary to the optional assistance service.
 *
 * Two calls and no state beyond one latch:
 *
 *  - `prompts()` asks the API's proxy for extra prompts. The default deployment
 *    has no service configured, so the first answer says so and the latch stops
 *    every later call — a narrative being typed must not produce a request per
 *    debounce for a feature that is switched off.
 *  - `recordInsert()` reports an insertion the user made, for the audit trail.
 *
 * Nothing here can change a draft. The narrative is written by the control the
 * user is typing in, and only from the Insert handler.
 *
 * Every failure resolves to silence: the scope requires the panel to degrade
 * "with no errors surfaced to user", and that includes the console, so errors
 * are swallowed here rather than rethrown for a component to handle.
 */
@Injectable({ providedIn: 'root' })
export class LanguageAssistanceService {
  private readonly http = inject(HttpClient);

  /**
   * Set once the API says no service is configured. Not a cache of results —
   * only of the fact that there is nothing to ask.
   */
  private readonly unconfigured = signal(false);

  prompts(text: string): Observable<RemoteAssistance> {
    if (this.unconfigured() || text.trim() === '') return of(NOTHING);
    return this.http.post<LanguagePromptsResponse>('/api/language/prompts', { text }).pipe(
      tap((res) => {
        if (res?.enabled === false) this.unconfigured.set(true);
      }),
      map((res) => ({
        // Validated a second time on arrival. The API validates what the service
        // returned, and the browser does not assume the API is the only writer of
        // this response — an unattributable proposal loses its wording either way.
        prompts: sanitiseAssistancePrompts(res?.prompts),
        degraded: res?.degraded === true,
      })),
      // A failed request is treated exactly as a failed service: quiet, and
      // reported as degraded so the panel can say so in its own words.
      catchError(() => of({ prompts: [], degraded: true })),
    );
  }

  /**
   * Records an accepted suggestion. Fire-and-forget by design: the insertion is
   * the user's and it stands whether or not the audit write succeeds — losing a
   * user's edit because a log line failed would be indefensible.
   */
  recordInsert(draftId: string | null, request: LanguageInsertRequest): void {
    if (!draftId) return;
    this.http
      .post<void>(`/api/drafts/${encodeURIComponent(draftId)}/language-insert`, request)
      .pipe(catchError(() => of(void 0)))
      .subscribe();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { sanitiseAssistancePrompts, type AssistancePrompt } from '@mgs/shared';

/**
 * The one-way boundary to an external language-assistance service (UC-06).
 *
 * Deliberately the whole of this module's power: text goes out, candidate
 * prompts come back, and there is nothing else here. No Prisma client, no
 * DraftsService, no route that mutates a draft — the only code that writes a
 * narrative is the Angular control, driven by a user pressing Insert. A
 * source-level test asserts that absence, so an accidental future write path
 * fails the build rather than shipping.
 *
 * Unconfigured is the default and it is a WORKING default: with
 * `LANGUAGE_ASSIST_URL` unset nothing is called, no narrative text leaves the
 * deployment, and the panel runs on the in-process rules in libs/shared. That
 * matters because narrative text is a witness's account of a criminal matter —
 * whether it may be sent to a hosted model at all is a decision-maker question
 * (docs/usecases/uc-06/open-questions.md Q6), not an implementation choice. A
 * staging instance behind DemoAuthGuard must never be pointed at a real model
 * with real statements in it, which is why configuring one logs a warning.
 */

/** Narrative text longer than this is truncated rather than rejected. */
const MAX_TEXT_CHARS = 20_000;
/** A slow assistant is worse than none: the panel is advisory. */
const TIMEOUT_MS = 2_500;
/** A response bigger than this is treated as a failure, not parsed. */
const MAX_RESPONSE_BYTES = 64 * 1024;

export interface AssistanceResult {
  prompts: AssistancePrompt[];
  /** False when no service is configured. */
  enabled: boolean;
  /** True when a service is configured but did not answer usefully. */
  degraded: boolean;
}

@Injectable()
export class LanguageAssistClient {
  private readonly logger = new Logger(LanguageAssistClient.name);
  private readonly url = process.env.LANGUAGE_ASSIST_URL?.trim() ?? '';

  constructor() {
    if (this.url !== '') {
      this.logger.warn(
        `Language assistance service configured (${this.url}) — narrative text WILL leave this deployment. ` +
          'Never point a demo or staging instance at a real model with real witness statements.',
      );
    }
  }

  get enabled(): boolean {
    return this.url !== '';
  }

  /**
   * Candidate prompts for a narrative.
   *
   * Never throws and never reports a failure upward as an error: a timeout, a
   * 5xx, an oversized body and malformed JSON all resolve to an empty list with
   * `degraded: true`, because the scope requires the panel to degrade without
   * surfacing anything to the user. No retries — a failing assistant must not
   * amplify into load while somebody is typing.
   */
  async prompts(text: string): Promise<AssistanceResult> {
    if (!this.enabled) return { prompts: [], enabled: false, degraded: false };

    const body = JSON.stringify({ text: text.slice(0, MAX_TEXT_CHARS) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Language assistance service answered ${res.status}`);
        return { prompts: [], enabled: true, degraded: true };
      }
      const raw = await res.text();
      if (raw.length > MAX_RESPONSE_BYTES) {
        this.logger.warn('Language assistance response exceeded the size cap — discarded');
        return { prompts: [], enabled: true, degraded: true };
      }
      // Everything past this point is UNTRUSTED DATA: validated against the
      // prompt shape, with any wording it cannot attribute stripped out.
      const parsed: unknown = JSON.parse(raw);
      const prompts = sanitiseAssistancePrompts(
        parsed !== null && typeof parsed === 'object' && 'prompts' in parsed
          ? (parsed as { prompts: unknown }).prompts
          : parsed,
      );
      return { prompts, enabled: true, degraded: false };
    } catch (err) {
      this.logger.warn(`Language assistance service unavailable: ${(err as Error).message}`);
      return { prompts: [], enabled: true, degraded: true };
    } finally {
      clearTimeout(timer);
    }
  }
}

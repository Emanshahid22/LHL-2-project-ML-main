import { Component, computed, inject, input, output } from '@angular/core';
import type { AssistanceKind, AssistancePrompt } from '@mgs/shared';
import { AssistantSession } from './assistant-session';

/**
 * UC-06 Legal Language Assistant panel.
 *
 * A collapsible panel beside a narrative field, listing three kinds of prompt —
 * informal-language flags, standard phrase suggestions and completeness hints —
 * each with a Dismiss and, where the wording can be attributed, an Insert.
 *
 * Three properties matter more than the rendering:
 *
 *  - **It proposes nothing it cannot attribute.** A prompt reaches this component
 *    with `insertText` already stripped unless its provenance is 'documented'
 *    with a source (`canProposeVerbatim` in libs/shared). This component renders
 *    an Insert button only when `insertText` survived, so an unattributable
 *    prompt can still observe but has nothing to press.
 *  - **It never writes anything.** Insert is an output. The narrative is written
 *    by the component that owns the textarea, in one place, from a user action.
 *  - **It never steals focus.** New prompts are announced through a polite live
 *    region; a panel that grabbed focus mid-sentence would be worse than none.
 *
 * Colour: amber, the same advisory register UC-03 and UC-05 use. Red stays
 * reserved for UC-07 sensitive material.
 */
@Component({
  selector: 'app-language-assistant',
  imports: [],
  templateUrl: './language-assistant.html',
  styleUrl: './language-assistant.scss',
})
export class LanguageAssistant {
  /** Prompts for the current narrative, already provenance-gated. */
  readonly prompts = input<AssistancePrompt[]>([]);
  /** The narrative field this panel belongs to — used for unique element ids. */
  readonly fieldId = input.required<string>();
  /**
   * False when the narrative has never been focused, so there is no cursor to
   * insert at. Insert is disabled rather than guessing position 0 — an insertion
   * at a place the user never put the caret is an edit they did not ask for.
   */
  readonly canInsert = input(false);
  /** True when an assistance service is configured but did not answer. */
  readonly degraded = input(false);
  /** Whether the panel body should be open (the narrative has been focused). */
  readonly focused = input(false);

  readonly insert = output<AssistancePrompt>();

  protected readonly session = inject(AssistantSession);

  /**
   * Open when the user has said so; otherwise open once the narrative has been
   * focused, which is what the scope asks for. Once they collapse it, focus no
   * longer reopens it.
   */
  protected readonly open = computed(() => this.session.panelOpen() ?? this.focused());

  /** Dismissal is by prompt id and lasts the session — see AssistantSession. */
  protected readonly visiblePrompts = computed(() =>
    this.prompts().filter((p) => !this.session.isDismissed(p.id)),
  );

  protected readonly headingId = computed(() => `assistant-heading-${this.fieldId()}`);

  protected toggle(): void {
    this.session.setPanelOpen(!this.open());
  }

  protected setEnabled(enabled: boolean): void {
    this.session.setEnabled(enabled);
  }

  protected dismiss(prompt: AssistancePrompt): void {
    this.session.dismiss(prompt.id);
  }

  protected onInsert(prompt: AssistancePrompt): void {
    if (!prompt.insertText || !this.canInsert()) return;
    this.insert.emit(prompt);
  }

  /**
   * Clicking Insert must not move focus out of the narrative, so the caret stays
   * where the user put it and stays visible. The click still fires; only the
   * focus change is suppressed. Keyboard activation is unaffected — a textarea
   * keeps its selection after losing focus, so tabbing to Insert still inserts
   * in the right place.
   */
  protected keepFocus(event: MouseEvent): void {
    event.preventDefault();
  }

  protected badge(kind: AssistanceKind): string {
    switch (kind) {
      case 'informal':
        return 'Informal';
      case 'phrase':
        return 'Phrasing';
      default:
        return 'Completeness';
    }
  }
}

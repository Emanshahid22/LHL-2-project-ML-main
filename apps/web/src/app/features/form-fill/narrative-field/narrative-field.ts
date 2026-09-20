import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, startWith, switchMap } from 'rxjs';
import {
  ASSISTANCE_PATTERNS,
  NARRATIVE_PATTERNS,
  assistancePrompts,
  detectNarrativeFlags,
  insertAtCursor,
  segmentNarrative,
  type AssistancePrompt,
  type FormFieldDefinition,
  type NarrativeFlag,
  type NarrativePattern,
  type NarrativeSegment,
} from '@mgs/shared';
import { LanguageAssistanceService } from '../../../core/services/language-assistance.service';
import { AssistantSession } from '../language-assistant/assistant-session';
import { LanguageAssistant } from '../language-assistant/language-assistant';

/** Scope requires flagging to keep up with typing without fighting it. */
const FLAG_DEBOUNCE_MS = 300;

/**
 * Statement narrative: UC-03's flagged textarea, plus UC-06's assistant.
 *
 * A plain textarea cannot style ranges of its own text, so flagged phrases are
 * drawn by a backdrop div sitting exactly behind a transparent-background
 * textarea, rendering the same string with <mark> spans. The two must share
 * every metric that affects wrapping (font, size, line-height, padding, width)
 * and their scroll positions are kept in sync, or the marks drift off the words.
 *
 * Flagging is advisory: if detection throws, the narrative stays fully editable
 * and a small notice replaces the flags.
 *
 * UC-06 adds the Legal Language Assistant beside it. One rule governs this file:
 * **the control is written in exactly one place, `insertSuggestion`, and only
 * from a user pressing Insert.** No debounce, no normalisation, no auto-apply.
 * A source-level test asserts that single write site, because a behavioural test
 * proves today's build while the structural one protects the guarantee from the
 * next refactor.
 *
 * The component is reached two ways and is not forked for either: the MG11
 * wizard passes it the narrative control explicitly, and the shared renderer
 * picks it up for any field a template declares `narrative: true` (MG5's four
 * prose fields). Before UC-06 it existed only inside the wizard, so MG5 had no
 * highlighting at all.
 */
@Component({
  selector: 'app-narrative-field',
  imports: [ReactiveFormsModule, MatTooltipModule, LanguageAssistant],
  templateUrl: './narrative-field.html',
  styleUrl: './narrative-field.scss',
})
export class NarrativeField {
  readonly control = input.required<FormControl>();
  readonly field = input.required<FormFieldDefinition>();
  /**
   * The draft this narrative belongs to, so an insertion can be recorded in the
   * audit trail. Null (no draft context) simply means nothing is recorded — an
   * insertion the user made is never withheld because logging is unavailable.
   */
  readonly draftId = input<string | null>(null);

  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
  private readonly backdrop = viewChild<ElementRef<HTMLDivElement>>('backdrop');
  private readonly destroyRef = inject(DestroyRef);
  private readonly assistance = inject(LanguageAssistanceService);
  protected readonly session = inject(AssistantSession);

  /** Debounced copy of the narrative — what flagging runs against. */
  private readonly debouncedText = signal('');
  /** Set when the detection module throws, so the UI can degrade honestly. */
  protected readonly detectionFailed = signal(false);

  /** Live, undebounced so the counter tracks typing. */
  protected readonly liveText = signal('');

  /**
   * UC-06: whether the narrative has ever held the caret. Drives two things —
   * the panel opening on focus (the scope's trigger) and Insert being disabled
   * until there is a cursor position to insert at.
   */
  private readonly focusedOnce = signal(false);
  /** Prompts contributed by an external assistance service, if one is configured. */
  private readonly remotePrompts = signal<AssistancePrompt[]>([]);
  /** True when a service is configured but did not answer usefully. */
  protected readonly serviceDegraded = signal(false);

  protected readonly wordCount = computed(() => {
    const trimmed = this.liveText().trim();
    return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  });

  /**
   * UC-03's hearsay and opinion patterns always; UC-06's informal patterns only
   * while assistance is enabled, because the scope's toggle says informal flags
   * are cleared when the user turns assistance off. Turning it off must NOT
   * remove UC-03's flags — those are not language assistance, and silently
   * dropping a delivered behaviour through an unrelated toggle would be a bug.
   */
  private readonly patterns = computed<readonly NarrativePattern[]>(() =>
    this.session.enabled() ? ASSISTANCE_PATTERNS : NARRATIVE_PATTERNS,
  );

  protected readonly flags = computed<NarrativeFlag[]>(() => {
    try {
      const flags = detectNarrativeFlags(this.debouncedText(), this.patterns());
      // Clearing here (rather than on success only) lets it recover.
      if (this.detectionFailed()) this.detectionFailed.set(false);
      return flags;
    } catch {
      this.detectionFailed.set(true);
      return [];
    }
  });

  protected readonly segments = computed<NarrativeSegment[]>(() => {
    if (this.detectionFailed()) return [{ text: this.debouncedText(), flag: null }];
    try {
      return segmentNarrative(this.debouncedText(), this.flags());
    } catch {
      this.detectionFailed.set(true);
      return [{ text: this.debouncedText(), flag: null }];
    }
  });

  protected readonly hearsayCount = computed(
    () => this.flags().filter((f) => f.kind === 'hearsay').length,
  );
  protected readonly opinionCount = computed(
    () => this.flags().filter((f) => f.kind === 'opinion').length,
  );
  protected readonly informalCount = computed(
    () => this.flags().filter((f) => f.kind === 'informal').length,
  );

  /**
   * Every prompt for this narrative: the in-process rules from libs/shared plus
   * anything a configured service added. Both have already passed the proposal
   * gate, so a prompt here either cites a source for its wording or carries no
   * wording at all.
   */
  protected readonly prompts = computed<AssistancePrompt[]>(() => {
    if (!this.session.enabled()) return [];
    try {
      return [...assistancePrompts(this.debouncedText()), ...this.remotePrompts()];
    } catch {
      // Prompting is advisory. A failure here shows an empty panel, never an error.
      return [];
    }
  });

  protected readonly panelFocused = computed(() => this.focusedOnce());

  constructor() {
    // input() values are not available in the field initialiser, so subscribe
    // once the control exists.
    queueMicrotask(() => {
      const control = this.control();
      const initial = typeof control.value === 'string' ? control.value : '';
      this.liveText.set(initial);
      this.debouncedText.set(initial);

      control.valueChanges
        .pipe(startWith(control.value), takeUntilDestroyed(this.destroyRef))
        .subscribe((value) => this.liveText.set(typeof value === 'string' ? value : ''));

      control.valueChanges
        .pipe(
          startWith(control.value),
          debounceTime(FLAG_DEBOUNCE_MS),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((value) => this.debouncedText.set(typeof value === 'string' ? value : ''));

      // The optional service, on the same debounce as flagging so typing cannot
      // amplify into calls. switchMap so a slow answer never overwrites a newer
      // one. The service latches itself off after the first "not configured"
      // reply, which is the default deployment, so this costs one request.
      control.valueChanges
        .pipe(
          startWith(control.value),
          debounceTime(FLAG_DEBOUNCE_MS),
          switchMap((value) =>
            this.assistance.prompts(typeof value === 'string' ? value : ''),
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((result) => {
          this.remotePrompts.set(result.prompts);
          this.serviceDegraded.set(result.degraded);
        });
    });
  }

  /**
   * Clicking a flagged phrase must still place the caret. The marks sit above
   * the textarea to receive hover, so forward the click: put the caret at the
   * start of the phrase the user aimed at.
   */
  protected focusAt(index: number, event: MouseEvent): void {
    const input = this.textarea()?.nativeElement;
    if (!input) return;
    event.preventDefault();
    input.focus();
    input.setSelectionRange(index, index);
    this.focusedOnce.set(true);
  }

  /** Keeps the marks aligned while the textarea scrolls. */
  protected onScroll(): void {
    const source = this.textarea()?.nativeElement;
    const target = this.backdrop()?.nativeElement;
    if (!source || !target) return;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
  }

  /** UC-06: the scope's trigger for the panel — the narrative taking focus. */
  protected onNarrativeFocus(): void {
    this.focusedOnce.set(true);
  }

  /**
   * UC-06: insert a suggestion at the cursor.
   *
   * THE ONLY PLACE THIS COMPONENT WRITES THE NARRATIVE. If a second write path
   * is ever added, the "never auto-applied" guarantee is only as strong as the
   * next refactor — which is why a test asserts this is the sole `setValue` here.
   *
   * A textarea keeps its selection after losing focus, so the offsets are read at
   * insert time and are still the ones the user last placed, whether they clicked
   * Insert or tabbed to it.
   */
  protected insertSuggestion(prompt: AssistancePrompt): void {
    const input = this.textarea()?.nativeElement;
    const wording = prompt.insertText;
    if (!input || !wording || !this.focusedOnce()) return;

    const control = this.control();
    const current = typeof control.value === 'string' ? control.value : '';
    const result = insertAtCursor(current, wording, input.selectionStart, input.selectionEnd);

    control.setValue(result.text);
    control.markAsDirty();

    // Leave the caret after the inserted wording so the user can keep typing —
    // the scope's "user can then edit". Deferred because Angular writes the new
    // value into the element after this handler returns, which would otherwise
    // reset the selection to the end.
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(result.caret, result.caret);
    });

    this.assistance.recordInsert(this.draftId(), {
      fieldId: this.field().id,
      promptId: prompt.id,
      kind: prompt.kind,
      suggestionText: wording,
    });
  }
}

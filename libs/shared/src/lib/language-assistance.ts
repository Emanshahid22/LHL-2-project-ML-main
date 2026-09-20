/**
 * Legal language assistance — UC-06.
 *
 * Pure and framework-free: the browser produces the prompts as the user types,
 * the API validates anything an external service returns, and the tests use the
 * same functions. There is no second definition of what the assistant says.
 *
 * The rule this module exists to enforce
 * -------------------------------------
 * A suggestion is drafting advice on a court document. If the user presses
 * Insert, the wording becomes part of a witness's signed statement. That is a
 * worse failure than an invented form field: a missing field is visibly empty,
 * while invented wording reads as authoritative.
 *
 * So a prompt may carry `insertText` ONLY when its provenance is 'documented'
 * AND it cites a source — `canProposeVerbatim()`. Everything else may OBSERVE
 * ("this reads informally", "no time is recorded") but may not PROPOSE wording.
 * `template-conformance` fails the build on the same condition, so the mistake
 * cannot reach CI unnoticed. This is UC-05's severity-follows-provenance rule
 * adapted to a harder problem: in UC-05 an unsourced rule was downgraded to
 * advisory, whereas here everything is already advisory, so the gate has to be
 * on proposing wording at all.
 *
 * Consequently `STANDARD_PHRASES` ships EMPTY: the scope asks for standard
 * phrasing for common evidential descriptions and supplies none, and none of the
 * sourced material behind this project states any. The shape, the gate and the
 * tests are here so a practitioner can fill it in a change that adds data and no
 * code. See docs/usecases/uc-06/open-questions.md Q1.
 */
import { FieldProvenance } from './form-template.types';
import { NARRATIVE_PATTERNS, NarrativeFlag, NarrativePattern, detectNarrativeFlags } from './narrative-flags';

/** The three sources of prompt the scope names, in the order it names them. */
export type AssistanceKind = 'informal' | 'phrase' | 'completeness';

/** One thing the assistant has to say about a narrative. */
export interface AssistancePrompt {
  /**
   * Stable for as long as the cause persists, so dismissal and the audit trail
   * can name it. Derived from the phrase or the rule, never from a character
   * offset: typing earlier in the narrative would otherwise resurrect a prompt
   * the user had already dismissed.
   */
  id: string;
  kind: AssistanceKind;
  /** What the panel says. Always safe to show. */
  message: string;
  /**
   * Wording the user may insert. Present only when `canProposeVerbatim()` is
   * true of the prompt's provenance and source.
   */
  insertText?: string;
  provenance: FieldProvenance;
  /** A citation. Required before `insertText` may be offered. */
  source?: string;
  /** The matched range in the narrative, so a mark and its panel entry agree. */
  anchor?: { startIndex: number; endIndex: number };
}

/**
 * Informal-register patterns (UC-06).
 *
 * Kept separate from `NARRATIVE_PATTERNS` on purpose. UC-03's five hearsay and
 * opinion patterns feed the `hearsayFlagCount` audit metadata, so adding to that
 * list would silently change what the audit trail records for every MG11 saved
 * since UC-03. Callers that want all three kinds pass `ASSISTANCE_PATTERNS`.
 *
 * Every one of these OBSERVES and none PROPOSES. Informal register is visible in
 * the text itself, so saying "this reads informally" needs no external
 * authority — it is a statement about English. Saying "write this instead" is
 * drafting advice about a court document and needs a citation, and no source
 * behind this project supplies one. The explanations therefore say what to do
 * (describe what was observed) rather than dictating replacement wording.
 * See open-questions.md Q2 — answering it fills in `suggestion` per pattern with
 * no code change.
 */
export const INFORMAL_PATTERNS: readonly NarrativePattern[] = [
  {
    phrase: 'off his head',
    kind: 'informal',
    explanation:
      'Reads informally — describe what the witness actually observed (unsteadiness, slurred speech, smell of alcohol) rather than the conclusion drawn from it.',
  },
  {
    phrase: 'kicked off',
    kind: 'informal',
    explanation:
      'Reads informally — set out what happened and who did it, in the order it happened.',
  },
  {
    phrase: 'nicked',
    kind: 'informal',
    explanation:
      'Reads informally, and ambiguously: it can mean arrested or stolen. Say which, in formal terms.',
  },
  {
    phrase: 'a load of',
    kind: 'informal',
    explanation: 'Reads informally — give the number or quantity if it is known, or say it is not.',
  },
  {
    phrase: 'loads of',
    kind: 'informal',
    explanation: 'Reads informally — give the number or quantity if it is known, or say it is not.',
  },
  {
    phrase: 'sort of',
    kind: 'informal',
    explanation:
      'Reads informally and hedges the account — state what was observed, or say plainly that the witness cannot be certain.',
  },
  {
    phrase: 'a bit of a',
    kind: 'informal',
    explanation: 'Reads informally — describe what happened in plain, specific terms.',
  },
  {
    phrase: 'smashed up',
    kind: 'informal',
    explanation:
      'Reads informally — describe the damage that was seen, and to what, as precisely as the witness can.',
  },
  {
    phrase: 'mate',
    kind: 'informal',
    explanation:
      'Reads informally — name the person if known, or describe the relationship (for example a friend or colleague).',
  },
  {
    phrase: 'grabbed hold of',
    kind: 'informal',
    explanation:
      'Reads informally — say what was taken hold of, with which hand or arm, and for how long if known.',
  },
];

/**
 * Every pattern the highlight layer draws when assistance is enabled: UC-03's
 * hearsay and opinion set plus UC-06's informal set. The overlap rule in
 * `detectNarrativeFlags` then resolves across all three kinds in one pass.
 */
export const ASSISTANCE_PATTERNS: readonly NarrativePattern[] = [
  ...NARRATIVE_PATTERNS,
  ...INFORMAL_PATTERNS,
];

/**
 * A standard phrase for a common evidential description.
 *
 * `trigger` is a regex source (no flags, matched case-insensitively): the phrase
 * is offered only when the narrative contains something it applies to, so the
 * panel suggests rather than guesses.
 */
export interface StandardPhrase {
  id: string;
  trigger: string;
  /** What the panel says about the phrase. */
  message: string;
  /** The wording itself. Offered only if provenance + source permit it. */
  insertText: string;
  provenance: FieldProvenance;
  source?: string;
}

/**
 * SHIPS EMPTY, and that is the deliverable rather than a shortfall.
 *
 * The scope asks for "standard phrasing for common evidential descriptions" and
 * supplies no phrasing, no register guidance and no source. Writing plausible
 * courtroom wording here is the one thing this epic must not do, because it is
 * one button-press from becoming a witness's signed words.
 *
 * Adding an entry with a real citation makes it insertable immediately: the
 * gate, the panel and the tests are already in place, so filling this is a
 * data-only change. See open-questions.md Q1.
 */
export const STANDARD_PHRASES: readonly StandardPhrase[] = [];

/**
 * A completeness hint: something the account has not recorded.
 *
 * `absentPattern` is a regex source (no flags, matched case-insensitively). The
 * hint fires when the narrative does NOT match it — i.e. the pattern describes
 * what a recorded time, date, place or set of people looks like, and the hint is
 * the observation that none was found.
 *
 * Hints never carry wording to insert. "You have not recorded the time of the
 * incident" is an observation; inserting it into a statement would be nonsense.
 */
export interface CompletenessHint {
  id: string;
  message: string;
  absentPattern: string;
  provenance: FieldProvenance;
  source?: string;
}

/**
 * A narrative shorter than this is being started, not left incomplete, so no
 * hint fires. Without it the panel would fire four hints at "I saw a man",
 * which teaches users to ignore it — the same reasoning UC-04 applied to its
 * sparse-schedule advisory.
 */
export const MIN_HINT_WORDS = 6;

/**
 * The scope names exactly ONE completeness hint, so exactly one ships
 * `documented`, cited to the scope document, with its wording verbatim.
 *
 * The three siblings are our inference and say so. There is deliberately no
 * checklist of "required narrative content": no source behind this project
 * defines one, and a confident list of what a statement must contain would be
 * drafting doctrine we have no authority to assert. See open-questions.md Q3.
 */
export const COMPLETENESS_HINTS: readonly CompletenessHint[] = [
  {
    id: 'time-of-incident',
    message: 'You have not recorded the time of the incident',
    absentPattern:
      "(\\b\\d{1,2}[:.]\\d{2}\\b|\\b\\d{1,2}\\s?(am|pm)\\b|\\bmidday\\b|\\bmidnight\\b|\\bnoon\\b|o'?clock)",
    provenance: 'documented',
    source:
      'MGs Forms scope, UC-06 Legal Language Assistance, main flow: completeness hints (e.g., "You have not recorded the time of the incident") — https://lhl-agents.netlify.app/mg-forms-scope/',
  },
  {
    id: 'date-of-incident',
    message: 'No date appears in the account — consider when this happened',
    absentPattern:
      '(\\b\\d{1,2}\\s*[\\/-]\\s*\\d{1,2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b(mon|tues|wednes|thurs|fri|satur|sun)day\\b|\\b(january|february|march|april|may|june|july|august|september|october|november|december)\\b|\\byesterday\\b|\\bthat evening\\b|\\bthat morning\\b)',
    provenance: 'inference',
  },
  {
    id: 'place-of-incident',
    message: 'No place appears in the account — consider where this happened',
    absentPattern:
      '(\\b(street|road|avenue|lane|drive|close|square|park|station|shop|store|pub|bar|house|flat|junction|car park|address)\\b|\\boutside\\b|\\binside\\b)',
    provenance: 'inference',
  },
  {
    id: 'others-present',
    message: 'The account does not say who else was present',
    absentPattern:
      '(\\balone\\b|\\bwith me\\b|\\bpresent\\b|\\baccompanied\\b|\\bnobody else\\b|\\bno one else\\b|\\bwitness(es)?\\b|\\bmy (friend|colleague|partner|wife|husband|son|daughter|neighbour)\\b)',
    provenance: 'inference',
  },
];

/** Longest prompt text accepted from an external service. */
export const MAX_PROMPT_TEXT_CHARS = 400;
/** Most prompts accepted from an external service in one response. */
export const MAX_SERVICE_PROMPTS = 20;

/**
 * Whether a prompt is entitled to propose wording verbatim.
 *
 * Both halves are required: provenance 'documented' AND a non-empty source. A
 * documented claim with no citation is not documented, it is an assertion — the
 * same reading `severityFor()` takes in UC-05.
 */
export function canProposeVerbatim(prompt: {
  provenance?: FieldProvenance;
  source?: string;
}): boolean {
  const sourced = typeof prompt.source === 'string' && prompt.source.trim() !== '';
  return prompt.provenance === 'documented' && sourced;
}

/**
 * Applies the gate: returns the prompt with `insertText` intact if it may
 * propose, and with `insertText` REMOVED if it may not. The observation
 * survives; only the proposal is withdrawn.
 */
export function withProposalGate(prompt: AssistancePrompt): AssistancePrompt {
  if (prompt.insertText === undefined) return prompt;
  if (canProposeVerbatim(prompt)) return prompt;
  const { insertText: _stripped, ...rest } = prompt;
  return rest;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** Distinct informal flags, first occurrence winning, in text order. */
function informalPrompts(text: string): AssistancePrompt[] {
  const flags: NarrativeFlag[] = detectNarrativeFlags(text, INFORMAL_PATTERNS);
  const seen = new Set<string>();
  const prompts: AssistancePrompt[] = [];
  for (const flag of flags) {
    // Keyed by the phrase, not by position: dismissing "sort of" dismisses the
    // observation, and typing another paragraph must not bring it back.
    const key = flag.pattern.phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    prompts.push(
      withProposalGate({
        id: `informal:${key.replace(/\s+/g, '-')}`,
        kind: 'informal',
        message: `“${flag.phrase}” — ${flag.explanation}`,
        insertText: flag.pattern.suggestion,
        provenance: flag.pattern.suggestionProvenance ?? 'likely',
        source: flag.pattern.suggestionSource,
        anchor: { startIndex: flag.startIndex, endIndex: flag.endIndex },
      }),
    );
  }
  return prompts;
}

function phrasePrompts(text: string): AssistancePrompt[] {
  const prompts: AssistancePrompt[] = [];
  for (const phrase of STANDARD_PHRASES) {
    if (!new RegExp(phrase.trigger, 'i').test(text)) continue;
    prompts.push(
      withProposalGate({
        id: `phrase:${phrase.id}`,
        kind: 'phrase',
        message: phrase.message,
        insertText: phrase.insertText,
        provenance: phrase.provenance,
        source: phrase.source,
      }),
    );
  }
  return prompts;
}

function completenessPrompts(text: string): AssistancePrompt[] {
  if (wordCount(text) < MIN_HINT_WORDS) return [];
  const prompts: AssistancePrompt[] = [];
  for (const hint of COMPLETENESS_HINTS) {
    if (new RegExp(hint.absentPattern, 'i').test(text)) continue;
    prompts.push({
      id: `completeness:${hint.id}`,
      kind: 'completeness',
      message: hint.message,
      provenance: hint.provenance,
      source: hint.source,
    });
  }
  return prompts;
}

/**
 * Every in-process prompt for a narrative, in panel order: informal flags first
 * (they point at text the user can see), then standard phrases, then
 * completeness hints.
 *
 * An empty narrative produces nothing at all. An unstarted statement is not an
 * incomplete one.
 */
export function assistancePrompts(text: unknown): AssistancePrompt[] {
  if (typeof text !== 'string' || text.trim() === '') return [];
  return [...informalPrompts(text), ...phrasePrompts(text), ...completenessPrompts(text)];
}

function trimmedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Wording meant to be spliced into prose, kept byte-for-byte apart from control
 * characters.
 *
 * Deliberately NOT trimmed, unlike display text: a leading or trailing space is
 * part of the proposal, and eating it produces "in full.outside the shop" — the
 * kind of defect that makes a solicitor stop trusting the feature. Control
 * characters are stripped because nothing legitimate needs them in a witness
 * statement and they can be used to hide text from a reader.
 */
function insertableString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (cleaned.trim() === '' || cleaned.length > max) return null;
  return cleaned;
}

const KINDS: ReadonlySet<string> = new Set<AssistanceKind>(['informal', 'phrase', 'completeness']);
const PROVENANCES: ReadonlySet<string> = new Set<FieldProvenance>([
  'documented',
  'likely',
  'inference',
]);

/**
 * Validates one prompt from an external assistance service.
 *
 * Everything the service returns is UNTRUSTED DATA, never markup to render and
 * never wording to trust. A malformed prompt is dropped rather than repaired,
 * and a prompt that proposes wording it cannot attribute keeps its observation
 * and loses the proposal. Returns null when the value cannot be a prompt.
 */
export function sanitiseAssistancePrompt(value: unknown): AssistancePrompt | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const id = trimmedString(raw['id'], 120);
  const message = trimmedString(raw['message'], MAX_PROMPT_TEXT_CHARS);
  const kind = typeof raw['kind'] === 'string' && KINDS.has(raw['kind']) ? raw['kind'] : null;
  if (!id || !message || !kind) return null;

  const provenance =
    typeof raw['provenance'] === 'string' && PROVENANCES.has(raw['provenance'])
      ? (raw['provenance'] as FieldProvenance)
      : 'inference';
  const source = trimmedString(raw['source'], MAX_PROMPT_TEXT_CHARS) ?? undefined;
  const insertText = insertableString(raw['insertText'], MAX_PROMPT_TEXT_CHARS) ?? undefined;

  const anchorRaw = raw['anchor'];
  let anchor: AssistancePrompt['anchor'];
  if (anchorRaw !== null && typeof anchorRaw === 'object' && !Array.isArray(anchorRaw)) {
    const a = anchorRaw as Record<string, unknown>;
    const start = a['startIndex'];
    const end = a['endIndex'];
    if (
      typeof start === 'number' &&
      typeof end === 'number' &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      end > start
    ) {
      anchor = { startIndex: start, endIndex: end };
    }
  }

  // The prefix marks where a prompt came from, so a dismissal or an audit row
  // cannot be confused with an in-process one carrying the same id.
  return withProposalGate({
    id: `service:${id}`,
    kind: kind as AssistanceKind,
    message,
    insertText,
    provenance,
    source,
    anchor,
  });
}

/** Validates a service response, dropping what is malformed and keeping the rest. */
export function sanitiseAssistancePrompts(value: unknown): AssistancePrompt[] {
  if (!Array.isArray(value)) return [];
  const prompts: AssistancePrompt[] = [];
  for (const entry of value.slice(0, MAX_SERVICE_PROMPTS)) {
    const prompt = sanitiseAssistancePrompt(entry);
    if (prompt) prompts.push(prompt);
  }
  return prompts;
}

/** The result of an insertion: the new narrative and where the caret goes. */
export interface CursorInsertion {
  text: string;
  /** Immediately after the inserted wording, so the user can keep typing. */
  caret: number;
}

/**
 * Splices `insertText` into `text` at the cursor.
 *
 * At the cursor, not at the end — the scope says "inserts the suggestion at the
 * cursor position". A non-empty selection is replaced, because that is what a
 * text editor does. Out-of-range offsets are clamped rather than trusted, since
 * they come from the DOM.
 */
export function insertAtCursor(
  text: string,
  insertText: string,
  selectionStart: number,
  selectionEnd: number = selectionStart,
): CursorInsertion {
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  return {
    text: text.slice(0, start) + insertText + text.slice(end),
    caret: start + insertText.length,
  };
}

/** What the client reports after an insertion, and what the audit row records. */
export interface LanguageInsertRequest {
  fieldId: string;
  promptId: string;
  kind: AssistanceKind;
  /**
   * The wording that was inserted.
   *
   * The scope's post-condition is explicit: "All Insert actions logged in the
   * form audit trail with the suggestion text." This is the assistant's own
   * wording, not the witness's — the narrative itself is never sent here and
   * never recorded. See open-questions.md Q7.
   */
  suggestionText: string;
}

/** Longest suggestion text the insert endpoint will record. */
export const MAX_SUGGESTION_AUDIT_CHARS = 500;

/** True when `value` is a well-formed insert report. Used by the API (422 otherwise). */
export function isLanguageInsertRequest(value: unknown): value is LanguageInsertRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return (
    trimmedString(raw['fieldId'], 120) !== null &&
    trimmedString(raw['promptId'], 200) !== null &&
    typeof raw['kind'] === 'string' &&
    KINDS.has(raw['kind']) &&
    insertableString(raw['suggestionText'], MAX_SUGGESTION_AUDIT_CHARS) !== null
  );
}

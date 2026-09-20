/**
 * Hearsay and opinion detection for witness statement narratives (UC-03).
 *
 * Framework-free and pure so the same detection runs in the browser as the user
 * types and in the API when a draft is saved (for the audit trail). Flags are
 * advisory only — nothing in the system blocks on them.
 *
 * UC-06 extends this file rather than replacing it: a third kind (`informal`),
 * an optional `suggestion` on a pattern, and an optional pattern list on
 * `detectNarrativeFlags`. The default pattern list is unchanged, so UC-03's five
 * patterns and the `hearsayFlagCount` audit metadata behave exactly as before —
 * the informal patterns live in `language-assistance.ts` and are passed in
 * explicitly by the caller that wants them.
 */

/**
 * `hearsay` and `opinion` are UC-03. `informal` is UC-06: wording that is not
 * wrong about the facts but reads wrongly for a court document.
 */
export type NarrativeFlagKind = 'hearsay' | 'opinion' | 'informal';

/** A pattern to look for. Kept as data so the list can grow without code change. */
export interface NarrativePattern {
  /** Matched case-insensitively and only at word boundaries. */
  phrase: string;
  kind: NarrativeFlagKind;
  /** Shown to the user on hover; says what to do, not just what is wrong. */
  explanation: string;
  /**
   * UC-06: a formal alternative the user may insert in place of the phrase.
   *
   * Optional, and empty on every pattern this project ships. Proposing wording
   * for a witness statement is drafting advice, so it is gated on attribution:
   * `canProposeVerbatim` in language-assistance.ts requires provenance
   * 'documented' AND a source before an alternative may be offered, and the
   * conformance gate fails a pattern that carries one without a citation.
   */
  suggestion?: string;
  /** Evidence for `suggestion` — a citation a reader can follow. */
  suggestionSource?: string;
  /** How well-founded `suggestion` is. Absent counts as 'inference'. */
  suggestionProvenance?: 'documented' | 'likely' | 'inference';
}

/** One occurrence of a pattern in a narrative. */
export interface NarrativeFlag {
  /** The text as it actually appears, preserving the author's casing. */
  phrase: string;
  startIndex: number;
  /** Exclusive. */
  endIndex: number;
  kind: NarrativeFlagKind;
  explanation: string;
  /** The pattern that matched, so a caller can reach its (optional) suggestion. */
  pattern: NarrativePattern;
}

/**
 * The patterns required by the UC-03 scope. Order is irrelevant — matches are
 * returned in the order they occur in the text.
 */
export const NARRATIVE_PATTERNS: readonly NarrativePattern[] = [
  {
    phrase: 'I was told that',
    kind: 'hearsay',
    explanation:
      'May be hearsay — consider stating what the witness directly observed, and who said what to whom.',
  },
  {
    phrase: 'I heard that',
    kind: 'hearsay',
    explanation:
      'May be hearsay — "I heard that" reports another person’s account. Record what the witness themselves perceived.',
  },
  {
    phrase: 'In my opinion',
    kind: 'opinion',
    explanation:
      'Reads as opinion — a witness of fact should describe what they saw, heard or did rather than draw conclusions.',
  },
  {
    phrase: 'I think',
    kind: 'opinion',
    explanation:
      'Reads as opinion or uncertainty — state the facts observed, or say plainly that the witness cannot recall.',
  },
  {
    phrase: 'In my view',
    kind: 'opinion',
    explanation:
      'Reads as opinion — a witness of fact should describe what they saw, heard or did rather than draw conclusions.',
  },
];

/** Escapes regex metacharacters so phrases are matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a word-boundary-aware, case-insensitive matcher for a phrase.
 * Internal runs of whitespace match any whitespace, so "I  was told  that"
 * across a line break is still found.
 */
function matcherFor(phrase: string): RegExp {
  const body = phrase.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  return new RegExp(`\\b${body}\\b`, 'gi');
}

type Matcher = { pattern: NarrativePattern; regex: RegExp };

/**
 * Compiled matchers per pattern list, keyed by the list itself.
 *
 * The matchers are stateful (`g`), so they are reset before every scan. Caching
 * by list identity keeps the UC-03 cost exactly what it was while letting UC-06
 * pass a longer list (hearsay + opinion + informal) without recompiling five
 * regexes on every keystroke.
 */
const MATCHER_CACHE = new WeakMap<readonly NarrativePattern[], ReadonlyArray<Matcher>>();

function matchersFor(patterns: readonly NarrativePattern[]): ReadonlyArray<Matcher> {
  const cached = MATCHER_CACHE.get(patterns);
  if (cached) return cached;
  const built = patterns.map((pattern) => ({ pattern, regex: matcherFor(pattern.phrase) }));
  MATCHER_CACHE.set(patterns, built);
  return built;
}

/**
 * Finds every flagged phrase in `text`, ordered by position.
 * Overlapping matches are resolved in favour of the earlier, longer match, so
 * "In my opinion" is never also reported as a shorter nested phrase.
 *
 * `patterns` defaults to UC-03's hearsay and opinion set, which is what the API
 * counts for the audit trail. UC-06 passes a longer list for the highlight layer
 * so informal wording is marked in the same pass and the overlap rule applies
 * across all three kinds at once.
 */
export function detectNarrativeFlags(
  text: string,
  patterns: readonly NarrativePattern[] = NARRATIVE_PATTERNS,
): NarrativeFlag[] {
  if (typeof text !== 'string' || text.length === 0) return [];

  const found: NarrativeFlag[] = [];
  for (const { pattern, regex } of matchersFor(patterns)) {
    // Matchers are module-level and stateful (`g`), so reset before each scan.
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      found.push({
        phrase: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        kind: pattern.kind,
        explanation: pattern.explanation,
        pattern,
      });
      // Guard against a zero-length match looping forever.
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  found.sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex);

  const flags: NarrativeFlag[] = [];
  let consumedTo = -1;
  for (const flag of found) {
    if (flag.startIndex >= consumedTo) {
      flags.push(flag);
      consumedTo = flag.endIndex;
    }
  }
  return flags;
}

/** Distinct flagged phrases, lower-cased — what the audit trail records. */
export function distinctFlaggedPhrases(flags: NarrativeFlag[]): string[] {
  return [...new Set(flags.map((f) => f.phrase.toLowerCase().replace(/\s+/g, ' ')))].sort();
}

/** Splits a narrative into consecutive segments, flagged ones marked. */
export interface NarrativeSegment {
  text: string;
  flag: NarrativeFlag | null;
}

/**
 * Segments `text` for the highlight backdrop. Concatenating every segment's
 * text reproduces the input exactly — the backdrop must not alter the string or
 * it would stop lining up with the textarea.
 */
export function segmentNarrative(text: string, flags: NarrativeFlag[]): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];
  let cursor = 0;
  for (const flag of flags) {
    if (flag.startIndex > cursor) {
      segments.push({ text: text.slice(cursor, flag.startIndex), flag: null });
    }
    segments.push({ text: text.slice(flag.startIndex, flag.endIndex), flag });
    cursor = flag.endIndex;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), flag: null });
  }
  return segments;
}

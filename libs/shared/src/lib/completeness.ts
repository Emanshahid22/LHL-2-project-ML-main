/**
 * Schedule completeness check — UC-04.
 *
 * Compares how many items a schedule holds against what the case's complexity
 * would lead you to expect, and flags a schedule that looks implausibly sparse.
 * Advisory only: it never blocks saving, navigating or completing.
 *
 * Thresholds live here rather than at call sites so they are configurable in one
 * place, and so a new complexity band needs no change to the checking logic.
 */

/** Complexity bands a schedule can be assessed against. */
export type CaseComplexity = 'complex' | 'standard' | 'summary_only';

/** Minimum item count below which a schedule is considered sparse, per band. */
export const COMPLEXITY_THRESHOLDS: Record<CaseComplexity, { minItems: number }> = {
  // Scope: "Flags as sparse if a 'Complex' case has fewer than 5 unused material items".
  complex: { minItems: 5 },
  standard: { minItems: 3 },
  // Scope: "Lower threshold applied for summary-only matters".
  summary_only: { minItems: 1 },
};

/** Scope: the check "fires after 10+ items or when user attempts to finalise". */
export const COMPLETENESS_TRIGGER_ITEM_COUNT = 10;

export interface CompletenessResult {
  /** True when the schedule looks implausibly sparse for the complexity band. */
  sparse: boolean;
  /** The threshold applied, or null when no band was known. */
  threshold: number | null;
  /** The band used, or 'unknown' when none was chosen. */
  complexity: CaseComplexity | 'unknown';
  itemCount: number;
}

function isComplexity(value: unknown): value is CaseComplexity {
  return typeof value === 'string' && value in COMPLEXITY_THRESHOLDS;
}

/**
 * Evaluate a schedule. With no recognised complexity the check does not flag and
 * reports `unknown` — guessing a band would produce advice nobody can act on.
 */
export function checkCompleteness(input: {
  itemCount: number;
  complexity: unknown;
}): CompletenessResult {
  const { itemCount } = input;
  if (!isComplexity(input.complexity)) {
    return { sparse: false, threshold: null, complexity: 'unknown', itemCount };
  }
  const threshold = COMPLEXITY_THRESHOLDS[input.complexity].minItems;
  return {
    sparse: itemCount < threshold,
    threshold,
    complexity: input.complexity,
    itemCount,
  };
}

/**
 * Whether the check should run now.
 *
 * The scope says two things that a size-only trigger cannot both satisfy: the
 * check "fires after 10+ items", and it must fire "for 'Complex' cases with
 * fewer than 5 items" — which by definition never reach 10. So the trigger is
 * the union: the check runs once it has something to say.
 *
 *  - a finalisation attempt always runs it, empty schedule included, because
 *    that is precisely when an empty schedule is worth questioning;
 *  - a schedule at or past the trigger runs it even with no band known, on size
 *    alone;
 *  - a schedule with a known band runs it as soon as it holds one item, which is
 *    what makes the Complex-with-4 case observable.
 *
 * An untouched empty schedule with no finalisation attempt does not run it: not
 * yet started is a different thing from implausibly thin, and advising on a form
 * the user has not begun is noise that teaches them to ignore the advisory.
 */
export function shouldRunCompletenessCheck(input: {
  itemCount: number;
  complexity?: unknown;
  finalising?: boolean;
}): boolean {
  if (input.finalising === true) return true;
  if (input.itemCount >= COMPLETENESS_TRIGGER_ITEM_COUNT) return true;
  return isComplexity(input.complexity) && input.itemCount >= 1;
}

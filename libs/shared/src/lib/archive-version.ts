/**
 * UC-10: the version-minting rules and the field-level diff — the pure core
 * both the API and the tests call, so neither rule can fork.
 *
 * VERSION IDENTITY IS ROW-LEVEL, NOT CONTENT-LEVEL (Phase-1 review,
 * condition 1): these rules assign a number and label to EVERY successful
 * generation event; whether the stored bytes deduplicate against an earlier
 * version is the storage layer's business and never suppresses a mint. The
 * transactional write lives in the API; what lives here is everything a unit
 * test can pin without a database.
 *
 * The diff is INSIDE the UC-07 boundary (condition 4): for a caller without
 * the sensitive permission, both sides pass through `redactSensitiveValues`
 * BEFORE diffing — a removed key cannot appear as "changed from X to Y", so
 * a sensitive value cannot leak through comparison. For a permitted caller
 * the diff reports whether sensitive fields changed, so the API can record
 * the access (same audit family as every other UC-07 view).
 */

import { FormTemplate, GROUP_ROW_ID_KEY } from './form-template.types';
import { SENSITIVE_MATERIAL_FLAG_KEY } from './schedule';
import { redactSensitiveValues, sensitiveFieldIds } from './sensitive-material';

/** Scope flow step 7: "Original", "Amendment 1", "Amendment 2", … */
export function versionLabel(cycle: number): string {
  if (!Number.isInteger(cycle) || cycle < 0) {
    throw new Error(`versionLabel: cycle must be a non-negative integer, got ${cycle}`);
  }
  return cycle === 0 ? 'Original' : `Amendment ${cycle}`;
}

/**
 * Engine-assigned, monotonic per lineage (LER-1177). Max+1 rather than
 * count+1 on purpose: append-only history can in principle carry gaps (a
 * failed transaction retried), and a number must never be reissued.
 */
export function nextVersionNumber(existingNumbers: readonly number[]): number {
  let max = 0;
  for (const n of existingNumbers) {
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`nextVersionNumber: version numbers are positive integers, got ${n}`);
    }
    if (n > max) max = n;
  }
  return max + 1;
}

/** The one call the API makes at mint, so number and label cannot fork. */
export function planVersionMint(input: {
  existingNumbers: readonly number[];
  cycle: number;
}): { versionNumber: number; label: string } {
  return {
    versionNumber: nextVersionNumber(input.existingNumbers),
    label: versionLabel(input.cycle),
  };
}

/**
 * Whether a successful generation mints a version row. Row-level identity
 * (condition 1): the ONLY no-mint case is the same CURRENT draft re-serving
 * its own unchanged latest version — a plain re-download must not inflate
 * history, while a DIFFERENT draft (an amendment) minting byte-identical
 * content still gets its own row.
 */
export function shouldMintVersion(input: {
  latest: { draftId: string; contentHash: string } | null | undefined;
  draftId: string;
  contentHash: string;
}): boolean {
  const { latest } = input;
  if (!latest) return true;
  return !(latest.draftId === input.draftId && latest.contentHash === input.contentHash);
}

export type ValueDiffKind = 'added' | 'removed' | 'changed';

export interface ValueDiffEntry {
  fieldId: string;
  /** The template's label; falls back to the id for keys the current
   *  template no longer declares (template-version drift). */
  label: string;
  kind: ValueDiffKind;
  /** Absent (not null) on 'added'. */
  from?: unknown;
  /** Absent (not null) on 'removed'. */
  to?: unknown;
  /** True when the field is sensitive-declared — only ever true in a
   *  permitted caller's diff (redaction removes the keys otherwise). */
  sensitive: boolean;
}

export interface ArchivedValuesDiff {
  /** Template field order first, then unknown ids in stable sort order. */
  entries: ValueDiffEntry[];
  /**
   * True when a sensitive-declared field appears in the entries — the API's
   * cue to record the access for a permitted caller. Always false for an
   * unpermitted caller, whose sides were redacted before diffing.
   */
  containsSensitiveChanges: boolean;
}

/** Keys that are machine state, not form content — never diffed. */
const INTERNAL_KEYS = new Set<string>([SENSITIVE_MATERIAL_FLAG_KEY]);

/** Canonical serialisation: object keys sorted, group-row internal ids
 *  stripped — two rows with equal content but different `__id`s are equal. */
function canonical(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === GROUP_ROW_ID_KEY) continue;
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Empty-for-diff: absent, '', or an empty group — a field that moved
 *  between those states has nothing to show a reader. */
function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Field-level comparison of two version snapshots (LER-1183) under the
 * caller's UC-07 permission. `from`/`to` are `valuesSnapshotJson` objects.
 */
export function diffArchivedValues(
  template: FormTemplate,
  fromValues: Record<string, unknown>,
  toValues: Record<string, unknown>,
  opts: { sensitivePermitted: boolean },
): ArchivedValuesDiff {
  const from = opts.sensitivePermitted
    ? fromValues
    : redactSensitiveValues(template, fromValues);
  const to = opts.sensitivePermitted ? toValues : redactSensitiveValues(template, toValues);

  const sensitiveIds = new Set(sensitiveFieldIds(template));
  const labels = new Map(template.fields.map((f) => [f.id, f.label]));

  // Template order first, then ids only the snapshots know (drift), sorted.
  const known = template.fields.map((f) => f.id);
  const knownSet = new Set(known);
  const unknown = [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .filter((id) => !knownSet.has(id) && !INTERNAL_KEYS.has(id))
    .sort();

  const entries: ValueDiffEntry[] = [];
  for (const id of [...known, ...unknown]) {
    if (INTERNAL_KEYS.has(id)) continue;
    const before = from[id];
    const after = to[id];
    const beforeBlank = isBlank(before);
    const afterBlank = isBlank(after);
    if (beforeBlank && afterBlank) continue;
    const sensitive = sensitiveIds.has(id);
    const label = labels.get(id) ?? id;
    if (beforeBlank) {
      entries.push({ fieldId: id, label, kind: 'added', to: after, sensitive });
    } else if (afterBlank) {
      entries.push({ fieldId: id, label, kind: 'removed', from: before, sensitive });
    } else if (canonical(before) !== canonical(after)) {
      entries.push({ fieldId: id, label, kind: 'changed', from: before, to: after, sensitive });
    }
  }

  return {
    entries,
    containsSensitiveChanges: entries.some((e) => e.sensitive),
  };
}

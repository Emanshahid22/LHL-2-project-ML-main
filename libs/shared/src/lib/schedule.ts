/**
 * Repeating-group (schedule) helpers — UC-04.
 *
 * Pure and framework-free so the renderer, the API and the tests share one
 * definition of correctness. Nothing here knows or cares which form the schedule
 * belongs to: the MG6 designation is disputed, so the mechanics attach to a
 * field definition, never to a form code.
 */
import {
  FormFieldDefinition,
  GROUP_ROW_ID_KEY,
  GroupRow,
  isFieldValueComplete,
} from './form-template.types';

/**
 * Where the derived sensitivity flag is stored in a draft's values. Derived, not
 * user-editable, and recomputed on every change — it is removed when the last
 * sensitive row goes, because a flag that latches on over-reports.
 */
export const SENSITIVE_MATERIAL_FLAG_KEY = 'hasSensitiveMaterial';

/** A row annotated with the ordinal it should display. */
export interface NumberedRow {
  row: GroupRow;
  /** Position + 1. Computed here, never stored. */
  ordinal: number;
}

/** Coerces whatever is stored under a group field id into rows. */
export function asRows(value: unknown): GroupRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is GroupRow => typeof row === 'object' && row !== null);
}

/**
 * The displayed numbering. Because the ordinal is derived from position, the
 * sequence is contiguous by construction — there is no renumber operation to get
 * wrong, and no stored counter to drift.
 */
export function withOrdinals(rows: GroupRow[]): NumberedRow[] {
  return rows.map((row, index) => ({ row, ordinal: index + 1 }));
}

/** The ordinal a newly appended row will display. */
export function nextOrdinal(rows: GroupRow[]): number {
  return rows.length + 1;
}

export function rowId(row: GroupRow): string | undefined {
  const id = row[GROUP_ROW_ID_KEY];
  return typeof id === 'string' ? id : undefined;
}

/**
 * Row indexes whose value in `columnId` duplicates an earlier row's. Reported
 * per row so the UI can mark the offending cell rather than the whole form —
 * two items must never claim the same disclosure reference.
 */
export function findDuplicateReferences(rows: GroupRow[], columnId: string): number[] {
  const seen = new Map<string, number>();
  const duplicates: number[] = [];
  rows.forEach((row, index) => {
    const raw = row[columnId];
    if (typeof raw !== 'string') return;
    const key = raw.trim().toLowerCase();
    if (key === '') return;
    if (seen.has(key)) {
      duplicates.push(index);
    } else {
      seen.set(key, index);
    }
  });
  return duplicates;
}

/** True when any row carries the given value in the given column. */
export function anyRowHasValue(rows: GroupRow[], columnId: string, value: string): boolean {
  return rows.some((row) => row[columnId] === value);
}

/**
 * Whether the schedule contains a row the template counts as sensitive, per the
 * field's own `sensitivityFlag`. A field that declares none is never sensitive —
 * silence is not a default of "yes".
 */
export function hasSensitiveRow(field: FormFieldDefinition, value: unknown): boolean {
  const flag = field.sensitivityFlag;
  if (!flag) return false;
  return anyRowHasValue(asRows(value), flag.columnId, flag.whenValue);
}

/**
 * Reorder as a first-class move, not delete-and-re-add: the row object travels
 * whole, so its `__id` — and everything attached to it — survives. Out-of-range
 * indexes return the rows untouched rather than throwing, because a drag that
 * ends outside the table is a no-op, not an error.
 */
export function moveRow(rows: GroupRow[], from: number, to: number): GroupRow[] {
  if (from === to) return rows;
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * A group is complete only when it has at least one row and every required
 * column of every row is complete. `isFieldValueComplete` cannot do this on its
 * own — it never sees the column definitions.
 */
export function isGroupValueComplete(field: FormFieldDefinition, value: unknown): boolean {
  const rows = asRows(value);
  if (rows.length === 0) return false;
  const required = (field.columns ?? []).filter((c) => c.required);
  return rows.every((row) => required.every((c) => isFieldValueComplete(row[c.id])));
}

/**
 * Shape validation for a group value arriving from a client. Returns a reason
 * when the value must be rejected, or null when it is acceptable.
 *
 * Enforced server-side because the ids reach audit rows: a row without a stable
 * id, or two rows sharing one, would break the link between a decision and the
 * material it was made about.
 */
export function validateGroupValue(
  field: FormFieldDefinition,
  value: unknown,
): string | null {
  if (!Array.isArray(value)) {
    return `${field.id} must be an array of rows`;
  }
  const allowed = new Set([GROUP_ROW_ID_KEY, ...(field.columns ?? []).map((c) => c.id)]);
  const ids = new Set<string>();
  for (const [index, row] of value.entries()) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return `${field.id}[${index}] must be an object`;
    }
    const id = (row as GroupRow)[GROUP_ROW_ID_KEY];
    if (typeof id !== 'string' || id.trim() === '') {
      return `${field.id}[${index}] is missing ${GROUP_ROW_ID_KEY}`;
    }
    if (ids.has(id)) {
      return `${field.id} contains duplicate ${GROUP_ROW_ID_KEY} "${id}"`;
    }
    ids.add(id);
    for (const key of Object.keys(row as GroupRow)) {
      if (!allowed.has(key)) {
        return `${field.id}[${index}] has unknown column "${key}"`;
      }
    }
  }
  return null;
}

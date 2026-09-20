/**
 * UC-09: the document render model.
 *
 * One truth of what a form IS: the render model is built from the SAME
 * FormTemplate definitions and the SAME predicates the screen uses —
 * `isTemplateUnverified` for the draft band, `withDormantSensitiveSections` /
 * `redactSensitiveValues` / `isSensitiveSectionActive` for UC-07's boundary,
 * `isVulnerableWitness` for the MG11 marker, `extractExhibitRefs` /
 * `findInlineExhibitRefs` for exhibit linking. There is no second layout
 * system and no form-code special casing beyond what the templates already
 * declare; the PDF and DOCX binders are FORMATTERS of this model, never
 * interpreters of the template.
 *
 * Framework-free on purpose — the API binds it to print HTML and to OOXML,
 * and a future client-side preview could bind it too.
 */

import {
  FormFieldDefinition,
  FormTemplate,
  GroupRow,
  isTemplateUnverified,
} from './form-template.types';
import {
  MG11_DECLARATION,
  MG11_DECLARATION_FIELD_ID,
} from './mg11-declaration';
import { MG11_VULNERABLE_FLAG_KEY } from './mg11-witness';
import { extractExhibitRefs, findInlineExhibitRefs } from './quality-check';
import { asRows, withOrdinals } from './schedule';
import {
  isSensitiveSectionActive,
  redactSensitiveValues,
  SENSITIVE_PERMISSION_LEVEL,
  withDormantSensitiveSections,
} from './sensitive-material';

/**
 * The band stamped onto every page of a render whose template is not
 * practitioner-verified (rule 2 on paper). The predicate is
 * `isTemplateUnverified` — absent `verification` also earns the band, the
 * lesson of mgs/verification-banner-absent applied before the first PDF
 * ships rather than patched after.
 */
export const DRAFT_BAND_TEXT =
  'DRAFT — template not practitioner-verified. Not for filing or service.';

/**
 * The DOCX header wording — the scope's EXACT text (UC-09 flow step 8 /
 * DoD 4): the Word export is convenience output and must say so on every
 * page. Verbatim from the scope document; do not editorialise it.
 */
export const DOCX_DRAFT_HEADER_TEXT = 'Draft — not the authoritative version';

/** What a locked caller sees where MG6D would be: the level, never content. */
export const SENSITIVE_LOCKED_PLACEHOLDER =
  `Restricted section — requires "${SENSITIVE_PERMISSION_LEVEL}". ` +
  'Content withheld from this document.';

/** An active sensitive schedule with no rows still renders as a statement. */
export const SENSITIVE_EMPTY_STATEMENT =
  'Sensitive material schedule active — no items recorded yet.';

export type RenderBlockKind =
  | 'scalar'
  | 'narrative'
  | 'table'
  | 'declaration'
  | 'sensitiveLocked'
  | 'notice';

/** A run of narrative text, either plain or an in-document exhibit link. */
export interface NarrativeRun {
  text: string;
  /** Set when this run cites an exhibit that the same document defines or
   *  lists — the binder turns it into an internal link. A ref with no
   *  matching entry never gets a link: it stays a plain run. */
  linkTo?: string;
}

export interface RenderTableRow {
  ordinal: number;
  cells: string[];
  /** Anchor id when this row is an exhibit entry (link target). */
  anchorId?: string;
}

export interface RenderBlock {
  kind: RenderBlockKind;
  fieldId?: string;
  label?: string;
  /** Scalar display value / notice text / declaration text. */
  text?: string;
  /** Narrative prose as link-aware runs (kind: 'narrative'). */
  runs?: NarrativeRun[];
  /** Table columns + rows (kind: 'table'). */
  columns?: string[];
  rows?: RenderTableRow[];
  /** True when the field was left empty — binders render an empty box, never
   *  invent content (rule 1 on paper: absence stays visible). */
  empty?: boolean;
}

export interface RenderSection {
  title?: string;
  blocks: RenderBlock[];
  /** UC-07: this is the MG6D section — the binder gives it the red band, the
   *  ONLY red on the page (rule 6). */
  sensitive?: boolean;
}

export interface RenderModel {
  formCode: string;
  formName: string;
  templateVersion: number;
  /** isTemplateUnverified(template) — drives the per-page draft band. */
  unverified: boolean;
  /** Band text, or null for a verified template (none exists today). */
  draftBand: string | null;
  /** MG11 only: the persisted vulnerable-witness flag (UC-03 #4) — read from
   *  draft values, never re-derived at render time. */
  vulnerableWitness: boolean;
  sections: RenderSection[];
}

/** Anchor id for an exhibit entry — one convention for binder and tests. */
export function exhibitAnchorId(ref: string): string {
  return 'exhibit-' + ref.toUpperCase().replace(/[^A-Z0-9]/g, '-');
}

/**
 * MG11 page-count trio, part 1: is the pinned declaration's page-count
 * parenthetical present? The 2013 specimen reads "(consisting of … page(s)
 * …)"; our pinned wording does not carry it, and changing pinned wording is
 * LER-1200's practitioner call, not an implementation choice. So the
 * interpolation MECHANISM ships and stays dormant until the wording does.
 */
export const MG11_PAGE_COUNT_PATTERN =
  /\(consisting of\s+(?:___+|\d+)\s+pages?(\(s\))?\b[^)]*\)/i;

export function declarationPageCountActive(): boolean {
  return MG11_PAGE_COUNT_PATTERN.test(MG11_DECLARATION);
}

/**
 * Trio, part 2: interpolate the ACTUAL page count into declaration text that
 * carries the parenthetical. Called only when the mechanism is active; the
 * render pipeline is part 3 — it re-renders after interpolation and REFUSES
 * to emit a document whose declared count does not equal its actual count.
 */
export function withDeclaredPageCount(text: string, pageCount: number): string {
  return text.replace(MG11_PAGE_COUNT_PATTERN, (m) =>
    m.replace(/___+|\d+/, String(pageCount)),
  );
}

function displayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function scalarDisplay(field: FormFieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'checkbox') return value === true ? 'Yes' : 'No';
  if (field.type === 'date' && typeof value === 'string')
    return displayDate(value);
  if (field.type === 'select') {
    const opt = field.options?.find((o) => o.value === value);
    return opt ? opt.label : String(value);
  }
  return String(value);
}

function tableBlock(
  field: FormFieldDefinition,
  value: unknown,
  anchorRefs: Set<string>,
): RenderBlock {
  const columns = field.columns ?? [];
  const rows = withOrdinals(asRows(value)).map(({ row, ordinal }) => {
    const cells = columns.map((c) => scalarDisplay(c, (row as GroupRow)[c.id]));
    const block: RenderTableRow = { ordinal, cells };
    if (field.crossRef?.role === 'defines') {
      const [ref] = extractExhibitRefs(cells[0] ?? '');
      if (ref && anchorRefs.has(ref)) block.anchorId = exhibitAnchorId(ref);
    }
    return block;
  });
  return {
    kind: 'table',
    fieldId: field.id,
    label: field.label,
    columns: columns.map((c) => c.label),
    rows,
    empty: rows.length === 0,
  };
}

function narrativeRuns(text: string, anchorRefs: Set<string>): NarrativeRun[] {
  const runs: NarrativeRun[] = [];
  let cursor = 0;
  for (const { ref, index } of findInlineExhibitRefs(text)) {
    if (!anchorRefs.has(ref)) continue; // dangling ref: plain text, no link
    if (index > cursor) runs.push({ text: text.slice(cursor, index) });
    runs.push({ text: text.slice(index, index + ref.length), linkTo: exhibitAnchorId(ref) });
    cursor = index + ref.length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs.length ? runs : [{ text: '' }];
}

/**
 * The exhibit refs this document can LINK TO: whatever its own exhibit list
 * fields (crossRef `defines` — MG12's list of record — or `cites` — MG11's
 * "Exhibits referred to") actually contain, parsed by UC-08's line-leading
 * extractExhibitRefs. A PDF is one document, so links are in-document only;
 * cross-form navigation is UC-10's problem, not a hyperlink's.
 */
function exhibitAnchorRefs(
  template: FormTemplate,
  values: Record<string, unknown>,
): Set<string> {
  const refs = new Set<string>();
  for (const f of template.fields) {
    if (!f.crossRef || f.crossRef.vocabulary !== 'exhibitReference') continue;
    if (f.type === 'group') {
      const firstCol = f.columns?.[0]?.id;
      for (const row of asRows(values[f.id]))
        for (const r of extractExhibitRefs(firstCol ? row[firstCol] : ''))
          refs.add(r);
    } else {
      for (const r of extractExhibitRefs(values[f.id])) refs.add(r);
    }
  }
  return refs;
}

export interface BuildRenderModelOptions {
  /** Whether the requesting user holds UC-07's permission. When false the
   *  model is built from REDACTED values and the sensitive section becomes a
   *  locked placeholder — redaction happens BEFORE binding, so no binder can
   *  leak what the model never contained. */
  sensitivePermitted: boolean;
}

export function buildRenderModel(
  template: FormTemplate,
  rawValues: Record<string, unknown>,
  opts: BuildRenderModelOptions,
): RenderModel {
  // Absent-key normalisation first — the stored truth for most drafts is that
  // MG6D was never opened, and the engine's rule (dormant stays dormant,
  // active-with-absent-key means empty schedule) applies to paper unchanged.
  const normalised = withDormantSensitiveSections(template, rawValues);
  const sensitiveActive = isSensitiveSectionActive(template, normalised);
  const values = opts.sensitivePermitted
    ? normalised
    : redactSensitiveValues(template, normalised);

  const anchorRefs = exhibitAnchorRefs(template, values);
  const sections: RenderSection[] = [];
  let current: RenderSection = { blocks: [] };
  let currentIsSensitive = false;

  const push = () => {
    if (current.blocks.length || current.title) sections.push(current);
  };

  for (const field of template.fields) {
    if (field.section) {
      push();
      current = { title: field.section, blocks: [] };
      currentIsSensitive = false;
    }
    if (field.sensitive && !currentIsSensitive) {
      currentIsSensitive = true;
      if (!sensitiveActive) {
        // Dormant MG6D renders nothing at all — same as the screen.
        current = { blocks: [] };
        continue;
      }
      current.sensitive = true;
      if (!opts.sensitivePermitted) {
        current.blocks = [{ kind: 'sensitiveLocked', text: SENSITIVE_LOCKED_PLACEHOLDER }];
        // Swallow the section's remaining fields: the model never holds them.
        continue;
      }
    }
    if (field.sensitive && !opts.sensitivePermitted) continue;
    if (field.sensitive && !sensitiveActive) continue;

    if (field.id === MG11_DECLARATION_FIELD_ID) {
      // The declaration renders from the pinned constant, never from values —
      // the same server-owned-wording rule as the screen and the save guard.
      current.blocks.push({
        kind: 'declaration',
        fieldId: field.id,
        text: MG11_DECLARATION,
      });
      current.blocks.push({
        kind: 'scalar',
        fieldId: field.id,
        label: field.label,
        text: scalarDisplay(field, values[field.id]),
        empty: values[field.id] !== true,
      });
      continue;
    }
    if (field.id === MG11_VULNERABLE_FLAG_KEY) continue; // rendered as header marker

    if (field.type === 'group') {
      const block = tableBlock(field, values[field.id], anchorRefs);
      if (field.sensitive && block.empty) {
        current.blocks.push({ kind: 'notice', fieldId: field.id, text: SENSITIVE_EMPTY_STATEMENT });
      }
      current.blocks.push(block);
      continue;
    }
    if (field.crossRef?.vocabulary === 'exhibitReference' && field.type === 'textarea') {
      // An exhibit LIST field (MG11's "Exhibits referred to") renders one
      // line per entry, and a line that parses as a reference becomes a link
      // TARGET — this is where a narrative citation's hyperlink lands.
      const raw = typeof values[field.id] === 'string' ? (values[field.id] as string) : '';
      const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
      current.blocks.push({
        kind: 'table',
        fieldId: field.id,
        label: field.label,
        columns: [field.label],
        rows: lines.map((line, i) => {
          const [ref] = extractExhibitRefs(line);
          return {
            ordinal: i + 1,
            cells: [line.trim()],
            ...(ref ? { anchorId: exhibitAnchorId(ref) } : {}),
          };
        }),
        empty: lines.length === 0,
      });
      continue;
    }
    if (field.narrative) {
      const text = typeof values[field.id] === 'string' ? (values[field.id] as string) : '';
      current.blocks.push({
        kind: 'narrative',
        fieldId: field.id,
        label: field.label,
        runs: narrativeRuns(text, anchorRefs),
        empty: text === '',
      });
      continue;
    }
    const text = scalarDisplay(field, values[field.id]);
    current.blocks.push({
      kind: 'scalar',
      fieldId: field.id,
      label: field.label,
      text,
      empty: text === '',
    });
  }
  push();

  const unverified = isTemplateUnverified(template);
  return {
    formCode: template.code,
    formName: template.name,
    templateVersion: template.templateVersion,
    unverified,
    draftBand: unverified ? DRAFT_BAND_TEXT : null,
    // The flag is PERSISTED at save time (withDerivedFlags) precisely so the
    // render never re-derives vulnerability — read it, don't recompute it.
    vulnerableWitness:
      template.code === 'MG11' && values[MG11_VULNERABLE_FLAG_KEY] === true,
    sections,
  };
}

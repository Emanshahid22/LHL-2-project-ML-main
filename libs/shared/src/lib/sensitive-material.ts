/**
 * Sensitive material handling — UC-07.
 *
 * Pure and framework-free: the renderer, the API guard, the export endpoint and
 * the tests all consume these definitions, so what counts as "sensitive", what
 * the section says, and what an export may contain each exist exactly once.
 *
 * Two disciplines meet here:
 *  - Rule 1 (never invent a field) applied to WORDING: the handling
 *    instructions and the PII steps are product text on a legal-document
 *    surface, so every sentence carries its citation and anything that cannot
 *    be attributed is an open question, not a sentence
 *    (docs/usecases/uc-07/open-questions.md Q3).
 *  - The MG11-declaration discipline applied to INTEGRITY: the wording is
 *    server-owned, hash-pinned, and verified at API startup, so acknowledgement
 *    rows record exactly what was acknowledged and drift fails loudly.
 */
import { FormFieldDefinition, FormTemplate } from './form-template.types';
import { SENSITIVE_MATERIAL_FLAG_KEY, asRows } from './schedule';

/**
 * The one named permission this product knows. A boolean on the demo user, not
 * a role system: real RBAC arrives with real auth, and the name itself is a
 * practitioner call (open-questions Q2) — which is why it is a constant the
 * guard, the DTO and the locked-state copy all share.
 */
export const SENSITIVE_PERMISSION_LEVEL = 'Sensitive Material Access';

/** One attributable sentence: what it says, and where it is from. */
export interface SourcedSentence {
  text: string;
  source: string;
}

/**
 * The mandatory handling instructions, sentence by cited sentence. Rendered
 * read-only; no endpoint accepts instruction wording from a client. Anything a
 * real handling regime would add (storage, copying, marking) is deliberately
 * absent because no source we hold specifies it — open-questions Q3.
 */
export const SENSITIVE_HANDLING_INSTRUCTIONS: readonly SourcedSentence[] = [
  {
    text:
      'This schedule lists only relevant, sensitive unused material, in detail, with the location of each item and the reason it is considered to be sensitive.',
    source:
      "Manual of Guidance reference MG06D, 'Schedule of Relevant Sensitive Unused Material' — Home Office, 'Criminal casefiles: forms, standards, and file structure' (published 9 June 2026), forms table.",
  },
  {
    text: 'The material described here must not be disclosed to the defence.',
    source:
      "Home Office, 'Criminal casefiles: forms, standards, and file structure' v2.0 (9 June 2026): the MG6 series carries details of sensitive information that must not be disclosed to the defence. Recorded in docs/mg-form-research-findings.md § MG6.",
  },
  {
    text:
      'The prosecutor will record whether they agree that the material is sensitive, and whether a public interest immunity application to the court needs to be made.',
    source:
      "Manual of Guidance reference MG06D — Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
  },
];

/**
 * Shown after the instructions. Honesty is part of the wording: a practitioner
 * has not signed this off, and the reader is told so where they read it.
 */
export const SENSITIVE_HANDLING_NOTICE =
  'These instructions are assembled from the cited sources and have not been verified by a practitioner. Rules on storage, copying and marking are deliberately not stated here because no source this project holds specifies them — see docs/usecases/uc-07/open-questions.md (Q3).';

/**
 * The steps of the Public Interest Immunity process, as far as the sources we
 * hold state them. PII here is Public Interest Immunity — never personally
 * identifiable information; the collision is worth this sentence.
 */
export const PII_STEPS: readonly SourcedSentence[] = [
  {
    text:
      'List the relevant sensitive unused material on the sensitive schedule, in detail, and provide its location.',
    source:
      "Manual of Guidance reference MG06D — Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
  },
  {
    text: 'For each item, provide the reason it is considered to be sensitive.',
    source:
      "Manual of Guidance reference MG06D — Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
  },
  {
    text: 'The prosecutor records on the form whether they agree that the material is sensitive.',
    source:
      "Manual of Guidance reference MG06D — Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
  },
  {
    text:
      'The prosecutor records whether they need to make a public interest immunity application to the court.',
    source:
      "Manual of Guidance reference MG06D — Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
  },
];

/**
 * Where the panel's link points. The official index, labelled as the index:
 * the EXACT practice direction governing PII procedure is a practitioner call
 * (open-questions Q1), and a wrong specific citation on this surface would be
 * worse than a general one.
 */
export const PII_PRACTICE_DIRECTION = {
  label: 'Criminal Procedure Rules and Practice Directions (official index, gov.uk)',
  url: 'https://www.gov.uk/guidance/rules-and-practice-directions-2020',
} as const;

/** What an acknowledgement row is an acknowledgement OF. */
export type SensitiveAcknowledgementKind = 'HANDLING_INSTRUCTIONS' | 'PII_STEPS';

/**
 * Canonical strings for the two hash pins. Deterministic joins rather than
 * JSON.stringify so a formatting-only refactor of the arrays cannot silently
 * change the hash while leaving the wording identical.
 */
export function sensitiveHandlingCanonical(): string {
  return (
    SENSITIVE_HANDLING_INSTRUCTIONS.map((s) => `${s.text}\n${s.source}`).join('\n\n') +
    '\n\n' +
    SENSITIVE_HANDLING_NOTICE
  );
}

export function piiStepsCanonical(): string {
  return (
    PII_STEPS.map((s) => `${s.text}\n${s.source}`).join('\n\n') +
    '\n\n' +
    PII_PRACTICE_DIRECTION.label +
    '\n' +
    PII_PRACTICE_DIRECTION.url
  );
}

/**
 * SHA-256 pins of the canonical strings above (UTF-8). The API hashes the
 * constants on startup and refuses to boot on a mismatch — the MG11-declaration
 * discipline — and every acknowledgement row records the pin it acknowledged,
 * so a later wording change is distinguishable in the audit trail.
 *
 * Regenerate after an approved wording change with:
 *   node -e "const s=require('./libs/shared/dist/index.js');const c=require('crypto');
 *     console.log(c.createHash('sha256').update(s.sensitiveHandlingCanonical(),'utf8').digest('hex'));
 *     console.log(c.createHash('sha256').update(s.piiStepsCanonical(),'utf8').digest('hex'))"
 */
export const SENSITIVE_HANDLING_SHA256 =
  'baef4b8f2931d4c78616545ce9e0449de0a4921c517d80d7b67090a2433e5803';

export const PII_STEPS_SHA256 =
  '245c68fe96d3dbd6a901cd12c42bc80cc99d71e4d448de53b495ec82fe79339e';

/** The declared sensitive section of a template, in field order. */
export function sensitiveFieldIds(template: FormTemplate): string[] {
  return template.fields.filter((f) => f.sensitive === true).map((f) => f.id);
}

export function hasSensitiveSection(template: FormTemplate): boolean {
  return template.fields.some((f) => f.sensitive === true);
}

/**
 * Whether the section is active on STORED values — the server's view, derived
 * from the flag `withDerivedFlags()` recomputes on every save. The client's
 * live view recomputes `hasSensitiveRow` on the current form value instead, so
 * the section appears the moment a row is classified sensitive rather than a
 * save later.
 */
export function isSensitiveSectionActive(
  template: FormTemplate,
  values: Record<string, unknown>,
): boolean {
  return hasSensitiveSection(template) && values[SENSITIVE_MATERIAL_FLAG_KEY] === true;
}

/**
 * The values as a user WITHOUT the permission may see them: sensitive-declared
 * keys removed. Removal, not blanking — a blanked key still asserts the key
 * exists and would be stored back by the next save. The derived flag survives
 * on purpose: the locked user must know the section exists (and the locked
 * state renders because of it).
 */
export function redactSensitiveValues(
  template: FormTemplate,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const ids = new Set(sensitiveFieldIds(template));
  if (ids.size === 0) return values;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!ids.has(key)) redacted[key] = value;
  }
  return redacted;
}

/**
 * Sensitive-declared keys an update REQUEST asks to write. Presence is what
 * counts: a request carrying the key unchanged is still asking to write it,
 * and the guard judges the request, not a diff (open-questions D1).
 */
export function touchedSensitiveFieldIds(
  template: FormTemplate,
  values: Record<string, unknown>,
): string[] {
  return sensitiveFieldIds(template).filter((id) => id in values);
}

/** Request-shape guard for the confirmation endpoint (422 discipline). */
export function isSensitiveConfirmRequest(
  body: unknown,
): body is { kind: SensitiveAcknowledgementKind } {
  if (typeof body !== 'object' || body === null) return false;
  const kind = (body as { kind?: unknown }).kind;
  return kind === 'HANDLING_INSTRUCTIONS' || kind === 'PII_STEPS';
}

/**
 * UC-07's "mandatory section" as a validation finding: sensitive material is
 * recorded but the sensitive schedule is empty.
 *
 * Fires only when the sensitive group's key is PRESENT in the values — i.e. for
 * the server (which always sees the merged full values) and for a client whose
 * section is unlocked for editing. A locked or unconfirmed client lacks the key
 * AND the knowledge of what is stored under it, so a finding there would guess;
 * the section's own banner carries the "mandatory" message for those states.
 */
export function sensitiveScheduleFindings(
  template: FormTemplate,
  values: Record<string, unknown>,
): { fieldId: string; message: string }[] {
  const flagGroups = template.fields.filter((f) => f.type === 'group' && f.sensitivityFlag);
  if (flagGroups.length === 0) return [];
  const active = flagGroups.some((f) => {
    const flag = f.sensitivityFlag!;
    return asRows(values[f.id]).some((row) => row[flag.columnId] === flag.whenValue);
  });
  if (!active) return [];

  return template.fields
    .filter((f) => f.sensitive === true && f.type === 'group' && f.id in values)
    .filter((f) => asRows(values[f.id]).length === 0)
    .map((f) => ({
      fieldId: f.id,
      message:
        'Sensitive material is recorded on the schedule — the MG6D sensitive material schedule is mandatory and is still empty.',
    }));
}

/**
 * STORED values with never-opened sensitive sections normalised to emptiness.
 *
 * A draft whose MG6D was never unlocked simply has no key under the sensitive
 * group id — which, to any server-side judgement, is the same fact as an empty
 * mandatory schedule. `sensitiveScheduleFindings`' key-presence guard exists
 * for the EDITOR, whose pre-unlock and locked clients cannot know what is
 * stored and must not guess (open-questions D3); the server knows, so every
 * server-side consumer of stored values (the UC-08 review engine, the
 * DRAFT_SAVED validation counts) applies this first.
 *
 * The two surfaces may therefore legitimately differ: save-metadata counts can
 * exceed what a pre-unlock client displays, because the server is counting
 * stored truth and a locked client is honestly declining to guess at it.
 */
export function withDormantSensitiveSections(
  template: FormTemplate,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const dormant = template.fields.filter(
    (f) => f.sensitive === true && f.type === 'group' && !(f.id in values),
  );
  if (dormant.length === 0) return values;
  const normalised = { ...values };
  for (const field of dormant) normalised[field.id] = [];
  return normalised;
}

/** RFC 4180: quote when the cell needs it; double any quotes inside. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The non-sensitive schedule export (UC-07, LER-1134/DoD 4).
 *
 * One function both the API endpoint and the tests call, so the exclusion rule
 * cannot fork. Covers every group that declares a `sensitivityFlag` and is not
 * itself part of the sensitive section: rows whose flag column holds the flag
 * value are EXCLUDED, and sensitive-declared fields never appear at all — the
 * same declarations that drive activation drive the export, by construction.
 *
 * Returns null when the template has no such schedule — the endpoint turns
 * that into a 400 rather than shipping an empty file that looks like an
 * answer.
 */
export function buildNonSensitiveScheduleCsv(
  template: FormTemplate,
  values: Record<string, unknown>,
): { csv: string; includedRows: number; excludedSensitiveRows: number } | null {
  const groups = template.fields.filter(
    (f): f is FormFieldDefinition & { sensitivityFlag: NonNullable<FormFieldDefinition['sensitivityFlag']> } =>
      f.type === 'group' && f.sensitivityFlag !== undefined && f.sensitive !== true,
  );
  if (groups.length === 0) return null;

  const lines: string[] = [];
  let includedRows = 0;
  let excludedSensitiveRows = 0;

  for (const field of groups) {
    const columns = field.columns ?? [];
    const rows = asRows(values[field.id]);
    const included = rows.filter((row) => row[field.sensitivityFlag.columnId] !== field.sensitivityFlag.whenValue);
    excludedSensitiveRows += rows.length - included.length;
    includedRows += included.length;

    lines.push(csvCell(`${field.label} (non-sensitive items only)`));
    lines.push(['#', ...columns.map((c) => c.label)].map(csvCell).join(','));
    included.forEach((row, index) => {
      lines.push([String(index + 1), ...columns.map((c) => csvCell(row[c.id]))].join(','));
    });
    lines.push('');
  }

  return { csv: lines.join('\r\n'), includedRows, excludedSensitiveRows };
}

/**
 * Form review quality engine — UC-08.
 *
 * Pure and framework-free. Each check is a COMPOSITION of the primitives the
 * earlier use cases shipped (UC-01 completeness, UC-04 group completeness,
 * UC-05 declared date rules, UC-07 sensitive activation) — a rule implemented
 * twice is a rule that drifts, so nothing here re-states one.
 *
 * The engine asserts only what the product knows: cross-form participation is
 * a declared `crossRef` annotation plus the `mapsTo` case data the templates
 * already share, reference parsing follows the convention the printed forms'
 * own helpText documents, and a check that cannot run reports `incomplete`
 * rather than passing silently. Severity banding is recorded in
 * docs/usecases/uc-08/open-questions.md Q3.
 */
import {
  CaseSummaryDto,
} from './api.types';
import {
  FormFieldDefinition,
  FormTemplate,
  isFieldValueComplete,
} from './form-template.types';
import { asRows, hasSensitiveRow, isGroupValueComplete } from './schedule';
import {
  hasSensitiveSection,
  isSensitiveSectionActive,
  sensitiveScheduleFindings,
  withDormantSensitiveSections,
} from './sensitive-material';
import { crossFieldFindings, isConditionallyRequired } from './validation';

export type QualityCheckId = 'completeness' | 'dateLogic' | 'crossForm' | 'sensitiveHandling';

/** Human titles, shared by the checklist and the audit metadata. */
export const QUALITY_CHECK_TITLES: Record<QualityCheckId, string> = {
  completeness: 'Check 1 — Completeness',
  dateLogic: 'Check 2 — Date logic',
  crossForm: 'Check 3 — Cross-form references',
  sensitiveHandling: 'Check 4 — Sensitive material handling',
};

export type QualitySeverity = 'blocking' | 'advisory';

export interface QualityIssue {
  /** Stable identity (open-questions D3): `${checkId}:${kind}:${subject}` —
   *  the same draft state produces the same id, so an acknowledgement names
   *  exactly one finding and a changed form invalidates stale ones naturally. */
  id: string;
  checkId: QualityCheckId;
  severity: QualitySeverity;
  /** The affected field, when it is one field. Absent for form-level issues. */
  fieldId?: string;
  /** The affected field's label — or the section, for form-level issues and
   *  for fields the viewer may not see rendered (the UC-07 locked case). */
  subjectLabel: string;
  message: string;
}

export type QualityCheckStatus = 'clean' | 'issues' | 'incomplete';

export interface QualityCheckResult {
  checkId: QualityCheckId;
  status: QualityCheckStatus;
  issues: QualityIssue[];
  /** An honest aside on a clean result (e.g. "standalone form — nothing to
   *  compare against"). */
  note?: string;
  /** Only when `incomplete`: what the user should verify manually. */
  guidance?: string;
}

export interface QualityReport {
  checks: QualityCheckResult[];
  blocking: number;
  advisory: number;
  incomplete: number;
  /** No blocking issues AND every check completed. Advisories do not block
   *  readiness — they block FINALISATION until acknowledged with a reason. */
  readyToFinalise: boolean;
}

/**
 * Per-check time budget at the API layer (open-questions Q2). A check that
 * exceeds it reports `incomplete` — and an incomplete check BLOCKS
 * finalisation (Q5): a timeout must never become a bypass.
 */
export const QUALITY_CHECK_TIMEOUT_MS = 4000;

/** Matches UC-06's suggestion-audit cap; the reason is recorded verbatim. */
export const ADVISORY_REASON_MAX_CHARS = 500;

/** What Check 3 needs to know about one sibling draft of the same case. */
export interface SiblingDraftValues {
  draftId: string;
  formCode: string;
  values: Record<string, unknown>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Shape AND calendar truth (LER-1270): '2026-02-31' is a string in a date
 * costume, and the input layer already rejects it — the review engine must
 * agree, because the API accepts draft values from any client, not only the
 * datepicker. Round-tripping through Date catches impossible months and days
 * (leap years included) without any new dependency.
 */
export function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * The reference convention BOTH exhibit fields' helpText documents: "initials
 * and a sequence number, e.g. JS/1", one entry per line. Only a line's leading
 * token matching it is a reference; prose lines are ignored entirely — never
 * guessed at (open-questions D2).
 */
const EXHIBIT_REF = /^\s*([A-Za-z]{1,4}\/\d{1,4})\b/;

export function extractExhibitRefs(text: unknown): string[] {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const refs: string[] = [];
  for (const line of text.split('\n')) {
    const match = EXHIBIT_REF.exec(line);
    if (match) refs.push(match[1].toUpperCase());
  }
  return refs;
}

/**
 * UC-09: inline occurrences of the SAME convention, for hyperlinking a
 * narrative's citations to the exhibit entries (LER-1161/2381). One module,
 * one convention: this derives from EXHIBIT_REF's character rules — it never
 * defines a second grammar. Line-leading extraction (above) stays the rule
 * for LIST fields; inline matching exists only to place link anchors, and a
 * ref with no matching entry stays plain text.
 */
const EXHIBIT_REF_INLINE = /\b([A-Za-z]{1,4}\/\d{1,4})\b/g;

export function findInlineExhibitRefs(text: unknown): { ref: string; index: number }[] {
  if (typeof text !== 'string' || text === '') return [];
  const out: { ref: string; index: number }[] = [];
  for (const m of text.matchAll(EXHIBIT_REF_INLINE)) {
    out.push({ ref: m[1].toUpperCase(), index: m.index ?? 0 });
  }
  return out;
}

function labelOf(template: FormTemplate, fieldId: string): string {
  return template.fields.find((f) => f.id === fieldId)?.label ?? fieldId;
}

// ── Check 1 — completeness ───────────────────────────────────────────────────

/**
 * Every required field completed — statically required, conditionally required
 * (UC-05 `requiredWhen`, from the moment its trigger is set), required groups
 * (a schedule with an empty or half-filled row is not complete), and the MG6D
 * mandatory-while-active rule (UC-07). All blocking; the checklist renders the
 * group red, per the scope's own wording.
 */
export function checkRequiredCompleteness(
  template: FormTemplate,
  values: Record<string, unknown>,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const push = (kind: string, field: FormFieldDefinition, message: string) =>
    issues.push({
      id: `completeness:${kind}:${field.id}`,
      checkId: 'completeness',
      severity: 'blocking',
      fieldId: field.id,
      subjectLabel: field.label,
      message,
    });

  for (const field of template.fields) {
    const value = values[field.id];
    if (field.type === 'group') {
      if (field.required && !isGroupValueComplete(field, value)) {
        push(
          'required',
          field,
          `"${field.label}" needs at least one entry with every required column completed.`,
        );
      }
      continue;
    }
    if (field.required && !isFieldValueComplete(value)) {
      push('required', field, `"${field.label}" is required and has not been completed.`);
      continue;
    }
    if (!field.required && isConditionallyRequired(field, values) && !isFieldValueComplete(value)) {
      push(
        'required-when',
        field,
        `"${field.label}" is required because of another answer on this form, and has not been completed.`,
      );
    }
  }

  // UC-07: sensitive material recorded but the MG6D schedule empty. Review
  // sees STORED values, where a never-opened MG6D simply has no key at all —
  // the shared normalisation makes that read as the empty mandatory schedule
  // it is (see withDormantSensitiveSections for why the editor differs).
  for (const finding of sensitiveScheduleFindings(
    template,
    withDormantSensitiveSections(template, values),
  )) {
    issues.push({
      id: `completeness:sensitive-schedule:${finding.fieldId}`,
      checkId: 'completeness',
      severity: 'blocking',
      fieldId: finding.fieldId,
      subjectLabel: labelOf(template, finding.fieldId),
      message: finding.message,
    });
  }

  // LER-1272: the schedule EXISTING is not the schedule being COMPLETE. The
  // sensitive group is statically `required: false` (mandatory only while
  // active), so the loop above never reaches it — and the emptiness rule alone
  // let a row with blank required columns review clean. While the section is
  // active, an entry whose required columns are blank blocks, naming the
  // section and never its content — the empty-schedule error's wording
  // discipline.
  const sensitiveActive = template.fields.some(
    (f) => f.type === 'group' && f.sensitivityFlag !== undefined && f.sensitive !== true &&
      hasSensitiveRow(f, values[f.id]),
  );
  if (sensitiveActive) {
    for (const field of template.fields) {
      if (field.sensitive !== true || field.type !== 'group') continue;
      const rows = asRows(values[field.id]);
      if (rows.length > 0 && !isGroupValueComplete(field, rows)) {
        issues.push({
          id: `completeness:sensitive-incomplete:${field.id}`,
          checkId: 'completeness',
          severity: 'blocking',
          fieldId: field.id,
          subjectLabel: field.label,
          message: `"${field.label}" has an entry whose required columns are not yet completed — while sensitive material is recorded, the schedule must be completed in full.`,
        });
      }
    }
  }
  return issues;
}

// ── Check 2 — date logic ─────────────────────────────────────────────────────

/**
 * (a) Validity: a date that holds something other than a real ISO date —
 * including the IsoDateAdapter's `'invalid'` sentinel — is blocking.
 * (b) Sequence: the template's DECLARED `notBefore`/`notAfter` rules, via the
 * same `crossFieldFindings` the editor uses, each carrying its declared
 * severity. A suppressed comparison (ambiguous case data) surfaces as an
 * advisory note — never silence, never a failure. No rule is invented here,
 * and target dates carry no `noFutureDate` (the UC-04 lesson).
 */
export function checkDateLogic(
  template: FormTemplate,
  values: Record<string, unknown>,
  caseDto?: CaseSummaryDto | null,
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const checkDateValue = (field: FormFieldDefinition, value: unknown, where: string) => {
    if (typeof value !== 'string' || value.trim() === '') return;
    if (!isRealIsoDate(value)) {
      issues.push({
        id: `dateLogic:invalid:${where}`,
        checkId: 'dateLogic',
        severity: 'blocking',
        fieldId: field.id,
        subjectLabel: field.label,
        message: `"${field.label}" does not hold a real date.`,
      });
    }
  };

  for (const field of template.fields) {
    if (field.type === 'date') checkDateValue(field, values[field.id], field.id);
    if (field.type === 'group') {
      for (const column of field.columns ?? []) {
        if (column.type !== 'date') continue;
        const rows = Array.isArray(values[field.id]) ? (values[field.id] as unknown[]) : [];
        rows.forEach((row, index) => {
          if (typeof row === 'object' && row !== null) {
            checkDateValue(
              { ...column, label: `${field.label} — ${column.label}` },
              (row as Record<string, unknown>)[column.id],
              `${field.id}.${column.id}.${index}`,
            );
          }
        });
      }
    }
  }

  for (const finding of crossFieldFindings(template, values, caseDto)) {
    if (finding.kind !== 'order') continue;
    issues.push({
      id: `dateLogic:order:${finding.fieldId}:${finding.relatedFieldId ?? ''}`,
      checkId: 'dateLogic',
      severity: finding.suppressed ? 'advisory' : finding.severity === 'error' ? 'blocking' : 'advisory',
      fieldId: finding.fieldId,
      subjectLabel: labelOf(template, finding.fieldId),
      message: finding.suppressed
        ? `A date comparison could not run: ${finding.message}`
        : finding.message,
    });
  }
  return issues;
}

// ── Check 3 — cross-form references ──────────────────────────────────────────

/** The case data whose values must agree wherever they appear on a case's forms. */
const SHARED_CASE_DATA: readonly ('urn' | 'defendantName')[] = ['urn', 'defendantName'];

/**
 * Two comparisons, both on declared ground (open-questions D1/D2):
 *  - `mapsTo`-keyed equality: a case has ONE urn and ONE defendant, so
 *    divergent values across its forms are blocking.
 *  - exhibit references: tokens cited on `crossRef: cites` fields anywhere on
 *    the case must appear among the case's `crossRef: defines` tokens; a
 *    citation with no definition is advisory (the exhibit list may simply not
 *    be compiled yet — DoD 4 asks that it is flagged).
 *
 * `siblings === null` means the draft is standalone: the check is clean with
 * an honest note, because "nothing to compare" is not "consistent".
 */
export function checkCrossForm(
  template: FormTemplate,
  values: Record<string, unknown>,
  siblings: SiblingDraftValues[] | null,
  getTemplate: (formCode: string) => FormTemplate | undefined,
): { issues: QualityIssue[]; note?: string } {
  if (siblings === null) {
    return { issues: [], note: 'Standalone form — no other forms on a case to compare against.' };
  }

  const issues: QualityIssue[] = [];
  const all: { formCode: string; template: FormTemplate; values: Record<string, unknown> }[] = [
    { formCode: template.code, template, values },
    ...siblings.flatMap((s) => {
      const t = getTemplate(s.formCode);
      return t ? [{ formCode: s.formCode, template: t, values: s.values }] : [];
    }),
  ];

  // (a) mapsTo equality across the case's forms.
  for (const path of SHARED_CASE_DATA) {
    const seen = new Map<string, { display: string; forms: Set<string> }>();
    for (const entry of all) {
      for (const field of entry.template.fields) {
        if (field.mapsTo !== path) continue;
        const raw = entry.values[field.id];
        if (typeof raw !== 'string' || raw.trim() === '') continue;
        const key = raw.trim().toUpperCase();
        const bucket = seen.get(key) ?? { display: raw.trim(), forms: new Set<string>() };
        bucket.forms.add(entry.formCode);
        seen.set(key, bucket);
      }
    }
    if (seen.size > 1) {
      const ownField = template.fields.find((f) => f.mapsTo === path);
      const renderings = [...seen.values()]
        .map((v) => `"${v.display}" (${[...v.forms].join(', ')})`)
        .join(' vs ');
      issues.push({
        id: `crossForm:mapsTo:${path}`,
        checkId: 'crossForm',
        severity: 'blocking',
        fieldId: ownField?.id,
        subjectLabel: ownField?.label ?? path,
        message: `This case's forms disagree about ${path === 'urn' ? 'the URN' : "the defendant's name"}: ${renderings}. One case carries one value.`,
      });
    }
  }

  // (b) exhibit citations vs the case's exhibit list(s).
  const defined = new Set<string>();
  for (const entry of all) {
    for (const field of entry.template.fields) {
      if (field.crossRef?.vocabulary === 'exhibitReference' && field.crossRef.role === 'defines') {
        for (const ref of extractExhibitRefs(entry.values[field.id])) defined.add(ref);
      }
    }
  }
  for (const entry of all) {
    for (const field of entry.template.fields) {
      if (field.crossRef?.vocabulary !== 'exhibitReference' || field.crossRef.role !== 'cites') {
        continue;
      }
      for (const ref of extractExhibitRefs(entry.values[field.id])) {
        if (defined.has(ref)) continue;
        const onThisDraft = entry.formCode === template.code;
        issues.push({
          id: `crossForm:exhibit:${ref}`,
          checkId: 'crossForm',
          severity: 'advisory',
          fieldId: onThisDraft ? field.id : undefined,
          subjectLabel: onThisDraft ? field.label : `${entry.formCode} — ${field.label}`,
          message: `Exhibit "${ref}" is referred to${onThisDraft ? '' : ` on ${entry.formCode}`} but no exhibit list on this case carries it.`,
        });
      }
    }
  }
  return { issues };
}

// ── Check 4 — sensitive material handling ────────────────────────────────────

/**
 * UC-07 reaching the end of the form's life: an ACTIVE sensitive section needs
 * at least one recorded HANDLING_INSTRUCTIONS acknowledgement for this draft.
 * The acknowledgement state is a database fact, so the caller supplies it; the
 * engine stays pure. The finding names the SECTION, never its content —
 * redaction is not weakened by review (open-questions F4).
 */
export function checkSensitiveHandling(
  template: FormTemplate,
  values: Record<string, unknown>,
  handlingConfirmed: boolean,
): QualityIssue[] {
  if (!hasSensitiveSection(template) || !isSensitiveSectionActive(template, values)) return [];
  if (handlingConfirmed) return [];
  const section =
    template.fields.find((f) => f.sensitive === true)?.section ?? 'Sensitive material section';
  return [
    {
      id: 'sensitiveHandling:unconfirmed:form',
      checkId: 'sensitiveHandling',
      severity: 'blocking',
      subjectLabel: section,
      message:
        'Sensitive material is present but the handling instructions have never been confirmed for this form. A colleague with Sensitive Material Access must open the section and confirm them.',
    },
  ];
}

// ── Assembly ─────────────────────────────────────────────────────────────────

export function assembleReport(checks: QualityCheckResult[]): QualityReport {
  const issues = checks.flatMap((c) => c.issues);
  const blocking = issues.filter((i) => i.severity === 'blocking').length;
  const advisory = issues.filter((i) => i.severity === 'advisory').length;
  const incomplete = checks.filter((c) => c.status === 'incomplete').length;
  return { checks, blocking, advisory, incomplete, readyToFinalise: blocking === 0 && incomplete === 0 };
}

/** All advisories in a report, by id — what finalisation must see acknowledged. */
export function advisoriesOf(report: QualityReport): QualityIssue[] {
  return report.checks.flatMap((c) => c.issues).filter((i) => i.severity === 'advisory');
}

export interface AdvisoryAcknowledgement {
  issueId: string;
  /** The user's own words, recorded verbatim in the audit trail (LER-1106). */
  reason: string;
}

/** Shape guard for the finalise request body (422 discipline). */
export function isFinaliseRequest(
  body: unknown,
): body is { advisoryAcknowledgements?: AdvisoryAcknowledgement[] } {
  if (typeof body !== 'object' || body === null) return false;
  const acks = (body as { advisoryAcknowledgements?: unknown }).advisoryAcknowledgements;
  if (acks === undefined) return true;
  if (!Array.isArray(acks)) return false;
  return acks.every(
    (a) =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as AdvisoryAcknowledgement).issueId === 'string' &&
      typeof (a as AdvisoryAcknowledgement).reason === 'string',
  );
}

/**
 * The advisories a finalise request has NOT validly acknowledged: no matching
 * acknowledgement, an empty/whitespace reason, or one over the cap. A
 * reasonless override is not an override (LER-1106).
 */
export function unacknowledgedAdvisories(
  report: QualityReport,
  acks: readonly AdvisoryAcknowledgement[],
): QualityIssue[] {
  const valid = new Set(
    acks
      .filter(
        (a) => a.reason.trim().length > 0 && a.reason.length <= ADVISORY_REASON_MAX_CHARS,
      )
      .map((a) => a.issueId),
  );
  return advisoriesOf(report).filter((issue) => !valid.has(issue.id));
}

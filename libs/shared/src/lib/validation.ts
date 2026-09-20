/**
 * Field validation — UC-05.
 *
 * Pure and framework-free, because the browser and the API must reach the same
 * verdict. The renderer displays these findings and the API records them from
 * the same functions; there is no second definition of validity anywhere.
 *
 * The rule this module exists to enforce
 * -------------------------------------
 * A criminal case file carries references — URN, ASN, custody number, collar
 * number, CPS reference — whose exact character formats this project has NOT
 * sourced. The research evidences that the BOXES exist; it never states their
 * formats. A rule that rejects a valid URN is worse than no rule, because it
 * teaches a solicitor to work around the product on a document that goes to
 * court.
 *
 * So: a format may be `error` severity ONLY if its provenance is 'documented'
 * AND it carries a citation. Everything else is forced to 'advisory' by
 * `severityFor()`, whatever a template asks for. `template-conformance` fails
 * the build on the same condition, so the mistake cannot reach CI unnoticed.
 */
import { CaseSummaryDto } from './api.types';
import { sensitiveScheduleFindings } from './sensitive-material';
import { resolveCaseField } from './autofill';
import {
  FieldDateOrder,
  FieldFormatDefinition,
  FieldFormatName,
  FormFieldDefinition,
  FormTemplate,
  ValidationSeverity,
  isFieldValueComplete,
} from './form-template.types';

/**
 * The format registry.
 *
 * Two groups, and the difference between them is the whole point of the module:
 *
 *  - `telephone` and `email` describe generic contact notation. Both have a real
 *    published specification to cite, and both are permissive shape checks
 *    rather than claims about a UK numbering plan — so both may be `error`.
 *  - everything else is a case-file reference whose format is NOT sourced. Their
 *    patterns encode the shape of the only examples available (the MG1 URN
 *    placeholder, the scope's own "e.g." for the CPS reference), which is
 *    `inference`, so `severityFor` forces them to `advisory`.
 *
 * Patterns are anchored and length-bounded with no nested unbounded quantifier:
 * the same expression runs in the API, so a catastrophic-backtracking case would
 * be a server-side denial of service rather than a slow page.
 */
export const FIELD_FORMATS: Record<FieldFormatName, FieldFormatDefinition> = {
  telephone: {
    pattern: '^[0-9+()\\s-]{7,20}$',
    hint: 'Enter a valid telephone number',
    example: '020 7946 0123',
    provenance: 'documented',
    source:
      'ITU-T E.123 (notation for national and international telephone numbers). A permissive character and length check, not a UK numbering-plan check.',
  },
  email: {
    pattern: '^[^@\\s]{1,64}@[^@\\s.]{1,63}(\\.[^@\\s.]{1,63}){1,4}$',
    hint: 'Enter a valid email address',
    example: 'j.smith@police.uk',
    provenance: 'documented',
    source: 'RFC 5322 §3.4.1 addr-spec. A shape check only — deliverability is not asserted.',
  },
  postcode: {
    // Advisory on purpose: the UK format is widely published but was not sourced
    // for this project, and BFPO/overseas addresses may appear on these forms.
    pattern: '^[A-Za-z]{1,2}[0-9][A-Za-z0-9]?\\s?[0-9][A-Za-z]{2}$',
    hint: 'This does not look like a UK postcode — check it before relying on it',
    example: 'SE1 9AA',
    provenance: 'likely',
  },
  urn: {
    // Shape taken from the only example in the corpus: MG1's placeholder
    // "01AB0123456/24". No source states the real format. See open question Q1.
    pattern: '^[0-9]{2}[A-Za-z]{2}[0-9]{6,8}/[0-9]{2}$',
    hint: 'Unverified format — a URN usually reads like 01AB0123456/24. Check it against the case papers.',
    example: '01AB0123456/24',
    provenance: 'inference',
  },
  asn: {
    hint: 'Unverified format — check the Arrest/Summons Number against the custody record.',
    pattern: '^[0-9A-Za-z/-]{6,24}$',
    example: '01/AB/01234/24',
    provenance: 'inference',
  },
  custodyNumber: {
    hint: 'Unverified format — custody numbering varies by force. Check it against the custody record.',
    pattern: '^[0-9A-Za-z/-]{4,24}$',
    example: 'CU/12345/24',
    provenance: 'inference',
  },
  collarNumber: {
    // Referenced by NO field. Collar numbers live inside composite free-text
    // officer boxes ("name, rank and collar number"), and a pattern over such a
    // box would reject correct input. See open question F2 and Q4.
    hint: 'Unverified format — collar numbering is force-specific and this force is not known.',
    pattern: '^[0-9A-Za-z]{2,10}$',
    // The number alone. "PC 1234" is a rank plus a number, which is what the
    // composite officer boxes hold — and why none of them carries this format.
    example: '1234',
    provenance: 'inference',
  },
  cpsReference: {
    // Referenced by NO field: no template declares a CPS reference box. The
    // shape is the scope document's own "e.g. XX/XX/XXXXXX/XX". See F1 and Q5.
    hint: 'Unverified format — check the CPS reference against the correspondence.',
    pattern: '^[0-9A-Za-z]{2}/[0-9A-Za-z]{2}/[0-9A-Za-z]{6}/[0-9A-Za-z]{2}$',
    example: '01/AB/123456/24',
    provenance: 'inference',
  },
};

/**
 * The severity a format is ENTITLED to, regardless of what a template requests.
 *
 * `error` requires both halves: provenance 'documented' AND a non-empty source.
 * A documented claim with no citation is not documented, it is an assertion.
 */
export function severityFor(format: FieldFormatDefinition | undefined): ValidationSeverity {
  if (!format) return 'advisory';
  const sourced = typeof format.source === 'string' && format.source.trim() !== '';
  return format.provenance === 'documented' && sourced ? 'error' : 'advisory';
}

/** The registry entry a field's `format` names, or undefined. */
export function formatFor(field: FormFieldDefinition): FieldFormatDefinition | undefined {
  const name = field.validation?.format;
  return name ? FIELD_FORMATS[name] : undefined;
}

/**
 * The severity a field's format rule actually carries: the template's request,
 * capped at what the format's provenance permits. A template asking for `error`
 * on an unsourced format gets `advisory` — silently at runtime, loudly in CI.
 */
export function effectiveSeverity(field: FormFieldDefinition): ValidationSeverity {
  const permitted = severityFor(formatFor(field));
  const requested = field.validation?.severity;
  if (permitted === 'advisory') return 'advisory';
  return requested ?? 'error';
}

/** True when this field's format rule should become a hard control validator. */
export function isBlockingFormat(field: FormFieldDefinition): boolean {
  return formatFor(field) !== undefined && effectiveSeverity(field) === 'error';
}

export type ValidationFindingKind = 'format' | 'order' | 'required-when' | 'sensitive-schedule';

/** One thing wrong, or one check that could not run. */
export interface ValidationFinding {
  kind: ValidationFindingKind;
  severity: ValidationSeverity;
  /** The field the finding is about. */
  fieldId: string;
  /** For an ordering finding, the other operand — a field id or `case:<path>`. */
  relatedFieldId?: string;
  message: string;
  /**
   * Set when the check could not run rather than failed: the case datum was
   * ambiguous, so the comparison was SUPPRESSED. A suppressed finding is never
   * an error and never invalidates anything — it explains a silence.
   */
  suppressed?: boolean;
}

/** Values a rule can compare: ISO dates and HH:MM times both sort as strings. */
function comparable(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** The format finding for one field, if its value fails its format. */
export function validateFieldFormat(
  field: FormFieldDefinition,
  value: unknown,
): ValidationFinding | null {
  const format = formatFor(field);
  if (!format) return null;
  const text = comparable(value);
  // An empty value is `required`'s business, not the format's.
  if (text === null) return null;
  if (new RegExp(format.pattern).test(text)) return null;
  return {
    kind: 'format',
    severity: effectiveSeverity(field),
    fieldId: field.id,
    message: format.hint,
  };
}

/**
 * A field made required by another field's value, and still empty.
 *
 * `labelFor` turns field ids into the labels a user actually sees; without it a
 * message would read "because underminesCase is yes", which is a variable name,
 * not English.
 */
export function validateRequiredWhen(
  field: FormFieldDefinition,
  values: Record<string, unknown>,
  labelFor: (fieldId: string) => string = (id) => id,
): ValidationFinding | null {
  const rule = field.validation?.requiredWhen;
  if (!rule) return null;
  if (values[rule.fieldId] !== rule.equals) return null;
  if (isFieldValueComplete(values[field.id])) return null;
  return {
    kind: 'required-when',
    severity: 'error',
    fieldId: field.id,
    relatedFieldId: rule.fieldId,
    message: `“${labelFor(field.id)}” is required because “${labelFor(rule.fieldId)}” is “${rule.equals}”.`,
  };
}

/** True when a `requiredWhen` rule is currently active. */
export function isConditionallyRequired(
  field: FormFieldDefinition,
  values: Record<string, unknown>,
): boolean {
  const rule = field.validation?.requiredWhen;
  return !!rule && values[rule.fieldId] === rule.equals;
}

/**
 * Resolves an ordering rule's other operand.
 *
 * Three outcomes, and the middle one is the point: a case datum the case cannot
 * supply unambiguously produces `suppressed`, never a value. UC-02 returns
 * `ambiguous` for a case with two offence dates; picking one of them to compare
 * against would produce a confident wrong answer, which is worse than silence.
 */
function resolveOperand(
  order: FieldDateOrder,
  values: Record<string, unknown>,
  caseDto: CaseSummaryDto | null | undefined,
  labelFor: (fieldId: string) => string,
): { kind: 'value'; value: string; label: string } | { kind: 'suppressed'; reason: string } | null {
  if (order.fieldId) {
    const value = comparable(values[order.fieldId]);
    return value === null ? null : { kind: 'value', value, label: labelFor(order.fieldId) };
  }
  if (!order.casePath) return null;
  // No case linked: nothing to compare against, and nothing to explain.
  if (!caseDto) return null;
  const resolved = resolveCaseField(order.casePath, caseDto);
  if (resolved.kind === 'value') {
    return { kind: 'value', value: resolved.value, label: `the case file’s ${order.casePath}` };
  }
  if (resolved.kind === 'ambiguous') {
    return { kind: 'suppressed', reason: resolved.reason };
  }
  // no_data — the case simply lacks it. Silent, like an empty sibling field.
  return null;
}

function orderFinding(
  field: FormFieldDefinition,
  order: FieldDateOrder,
  direction: 'notBefore' | 'notAfter',
  values: Record<string, unknown>,
  caseDto: CaseSummaryDto | null | undefined,
  labelFor: (fieldId: string) => string,
): ValidationFinding | null {
  const own = comparable(values[field.id]);
  if (own === null) return null; // half a pair produces nothing
  const other = resolveOperand(order, values, caseDto, labelFor);
  if (!other) return null;

  if (other.kind === 'suppressed') {
    return {
      kind: 'order',
      severity: 'advisory',
      suppressed: true,
      fieldId: field.id,
      relatedFieldId: order.casePath ? `case:${order.casePath}` : order.fieldId,
      message: `“${field.label}” could not be checked against the case file: ${other.reason}.`,
    };
  }

  const fails =
    direction === 'notBefore'
      ? order.strict
        ? own <= other.value
        : own < other.value
      : order.strict
        ? own >= other.value
        : own > other.value;
  if (!fails) return null;

  const relation =
    direction === 'notBefore'
      ? order.strict
        ? 'must be after'
        : 'cannot be earlier than'
      : order.strict
        ? 'must be before'
        : 'cannot be later than';
  return {
    kind: 'order',
    severity: order.severity ?? 'error',
    fieldId: field.id,
    // LER-1271: the interface documents relatedFieldId as "a field id or
    // case:<path>", and the suppressed branch honours that — this branch now
    // does too. The human label belongs to the MESSAGE. Downstream, the review
    // engine derives acknowledgement-bearing issue ids from this value, so a
    // mutable display label here would key a legal audit trail on copy edits.
    relatedFieldId: order.casePath ? `case:${order.casePath}` : order.fieldId,
    message: order.message ?? `“${field.label}” ${relation} ${other.label}.`,
  };
}

/**
 * Every cross-field finding for a template's current values.
 *
 * Cross-field rules fire only when both operands have values — the scope's
 * "cross-field checks run when a second dependent field is completed".
 */
export function crossFieldFindings(
  template: FormTemplate,
  values: Record<string, unknown>,
  caseDto?: CaseSummaryDto | null,
): ValidationFinding[] {
  const labels = new Map(template.fields.map((f) => [f.id, f.label]));
  const labelFor = (id: string) => labels.get(id) ?? id;
  const findings: ValidationFinding[] = [];
  for (const field of template.fields) {
    const v = field.validation;
    if (!v) continue;
    if (v.notBefore) {
      const f = orderFinding(field, v.notBefore, 'notBefore', values, caseDto, labelFor);
      if (f) findings.push(f);
    }
    if (v.notAfter) {
      const f = orderFinding(field, v.notAfter, 'notAfter', values, caseDto, labelFor);
      if (f) findings.push(f);
    }
    const conditional = validateRequiredWhen(field, values, labelFor);
    if (conditional) findings.push(conditional);
  }
  // UC-07: the mandatory MG6D section. Error severity because completion is a
  // scope post-condition, not a style preference; still advisory in EFFECT like
  // every finding here — it never blocks a save (a draft is allowed to be
  // incomplete; that is what a draft is).
  for (const f of sensitiveScheduleFindings(template, values)) {
    findings.push({
      kind: 'sensitive-schedule',
      severity: 'error',
      fieldId: f.fieldId,
      message: f.message,
    });
  }
  return findings;
}

/** Every single-field format finding for a template's current values. */
export function formatFindings(
  template: FormTemplate,
  values: Record<string, unknown>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const field of template.fields) {
    const finding = validateFieldFormat(field, values[field.id]);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Everything wrong with a set of values, in one call.
 *
 * This is the single definition of validity: the renderer displays what this
 * returns, the API records what this returns, and a future finalise path will
 * refuse on what this returns. Ordering is stable — formats in template order,
 * then cross-field findings in template order — so two callers listing findings
 * cannot disagree about their order either.
 */
export function validateForm(
  template: FormTemplate,
  values: Record<string, unknown>,
  caseDto?: CaseSummaryDto | null,
): ValidationFinding[] {
  return [...formatFindings(template, values), ...crossFieldFindings(template, values, caseDto)];
}

/** Counts for the audit trail: what was outstanding, without the values. */
export function countFindings(findings: ValidationFinding[]): {
  validationErrorCount: number;
  validationAdvisoryCount: number;
  validationSuppressedCount: number;
} {
  return {
    validationErrorCount: findings.filter((f) => !f.suppressed && f.severity === 'error').length,
    validationAdvisoryCount: findings.filter((f) => !f.suppressed && f.severity === 'advisory')
      .length,
    validationSuppressedCount: findings.filter((f) => f.suppressed === true).length,
  };
}

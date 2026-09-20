/**
 * Template conformance (guardrail from the MG template-completion epic).
 *
 * Pure scoring of a FormTemplate against the house-style bar, so CI can fail a
 * template that regresses instead of a human noticing months later. Two tiers:
 *
 *  - STRUCTURAL rules apply to every template, assessed or not: they catch
 *    outright defects (duplicate ids, a select with no options, an invalid
 *    mapsTo) that break the renderer or auto-fill regardless of sourcing.
 *
 *  - SOURCING rules apply only to templates that carry a `verification` value,
 *    i.e. ones whose field set has actually been assessed: every field must
 *    state its provenance, helpText must be real guidance, and a meaningful
 *    share of fields must carry validation. Placeholders are exempt on purpose —
 *    failing MG2 for being a placeholder tells nobody anything new; the point is
 *    that a template CLAIMING to be sourced cannot quietly fall below the bar.
 *
 * Thresholds are empirical, not aspirational: they were set by measuring what
 * MG11, MG5 and the five rebuilt templates pass today (see the constants), so
 * the suite goes red only on regression, never on day one.
 */
import {
  CaseFieldPath,
  FormFieldDefinition,
  FormTemplate,
  GROUP_ROW_ID_KEY,
} from './form-template.types';
import { FIELD_FORMATS, severityFor } from './validation';
import {
  COMPLETENESS_HINTS,
  CompletenessHint,
  INFORMAL_PATTERNS,
  STANDARD_PHRASES,
  StandardPhrase,
  canProposeVerbatim,
} from './language-assistance';
import { NarrativePattern } from './narrative-flags';

export interface ConformanceFinding {
  templateCode: string;
  /** `error` fails CI; `warning` is reported but does not fail. */
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  fieldId?: string;
}

/** The complete set of valid mapsTo targets, kept in sync with CaseFieldPath. */
const CASE_FIELD_PATHS: ReadonlySet<string> = new Set<CaseFieldPath>([
  'urn',
  'defendantName',
  'defendantDob',
  'defendantAddress',
  'courtName',
  'cpsReference',
  'officerInCase',
  'nextHearingAt',
  'offenceDate',
  'charges',
]);

// Sourcing thresholds — measured, not guessed. MG3's "Completed by the CPS."
// fields set the per-field helpText floor; MG3's 31% sets the coverage floor.
const MIN_HELP_TEXT_CHARS = 20;
const MIN_AVG_HELP_TEXT_CHARS = 55;
const MIN_VALIDATION_COVERAGE = 0.3;

/**
 * The rules that apply to any field definition, whether it is a top-level field
 * or a column inside a repeating group. Columns are real boxes on the printed
 * form, so exempting them would leave the half of MG6 that matters unchecked.
 */
function fieldRules(
  field: FormFieldDefinition,
  err: (rule: string, message: string, fieldId?: string) => void,
  where: string,
): void {
  const id = `${where}${field.id}`;

  if (!field.label || field.label.trim() === '') {
    err('label', 'field has no label', id);
  }
  if (!field.helpText || field.helpText.trim() === '') {
    // Contextual help is a UC-01 acceptance behaviour, so its absence is
    // structural, not stylistic.
    err('help-text', 'field has no helpText', id);
  }
  if (field.mapsTo !== undefined && !CASE_FIELD_PATHS.has(field.mapsTo)) {
    err('maps-to', `mapsTo "${field.mapsTo}" is not a CaseFieldPath`, id);
  }
  if (field.type === 'select' && (!field.options || field.options.length < 2)) {
    err('select-options', 'select field needs at least two options', id);
  }
  if (field.type !== 'select' && field.options) {
    err('select-options', 'options are only meaningful on a select field', id);
  }
  if (field.type !== 'group' && field.columns) {
    err('group-columns', 'columns are only meaningful on a group field', id);
  }
  if (field.type !== 'group' && field.complexityFieldId) {
    err('complexity-field', 'complexityFieldId is only meaningful on a group field', id);
  }
  if (field.type !== 'group' && field.sensitivityFlag) {
    err('sensitivity-flag', 'sensitivityFlag is only meaningful on a group field', id);
  }
  const v = field.validation;
  if (v?.format) {
    const format = FIELD_FORMATS[v.format];
    if (!format) {
      err('format-registry', `format "${v.format}" is not in FIELD_FORMATS`, id);
    } else {
      // The rule this project exists to enforce: a format may only block if its
      // shape is actually sourced. A template asking for more is a build failure,
      // not a silent downgrade — severityFor() already caps it at runtime, but a
      // reader of the template would otherwise believe the request was honoured.
      if (v.severity === 'error' && severityFor(format) !== 'error') {
        err(
          'format-severity',
          `format "${v.format}" is provenance '${format.provenance}'${format.source ? '' : ' with no source'}, so it cannot be severity 'error'`,
          id,
        );
      }
      if (format.provenance === 'documented' && !format.source?.trim()) {
        err(
          'format-source',
          `format "${v.format}" claims provenance 'documented' but cites no source`,
          id,
        );
      }
      if (!new RegExp(format.pattern).test(format.example)) {
        err('format-example', `format "${v.format}" does not match its own example`, id);
      }
    }
  }
  // A citation must be a citation: an empty string is worse than nothing, because
  // it reads as sourced. And a source with no provenance claims evidence for a
  // confidence nobody stated.
  if (field.source !== undefined && field.source.trim() === '') {
    err('field-source', 'source is present but empty', id);
  }
  if (field.source !== undefined && field.provenance === undefined) {
    err('field-source', 'source is given without a provenance to support', id);
  }

  // UC-06: the assistant attaches to prose. A narrative address or a narrative
  // charge list is a category error, and inferring prose from `type` or `rows`
  // is exactly what the declared flag exists to prevent.
  if (field.narrative && field.type !== 'textarea') {
    err('narrative-type', 'narrative is only meaningful on a textarea field', id);
  }
  if (field.narrative && where) {
    // A group column is a table cell, not an account. The panel would have no
    // sensible place to sit and the highlight layer no room to draw.
    err('narrative-column', 'a group column cannot be a narrative', id);
  }
  if (v?.uniqueInGroup && !where) {
    // Uniqueness is cross-row, so it means nothing on a field that has no rows.
    err('unique-in-group', 'uniqueInGroup is only meaningful on a group column', id);
  }

  // UC-07: the sensitive-material declaration. The section owns whole fields —
  // a sensitive COLUMN inside a non-sensitive group would leak through every
  // path that treats the group as one value (redaction, the guard, the export).
  if (field.sensitive && where) {
    err('sensitive-column', 'a group column cannot be declared sensitive — declare the whole field', id);
  }
  if (field.sensitive && !where && !field.section?.trim()) {
    // The renderer replaces the sensitive fields' SECTION with the gated block,
    // so a sensitive field with no section has nowhere to render.
    err('sensitive-section', 'a sensitive field must carry a section heading', id);
  }
  if (field.sensitive && field.mapsTo !== undefined) {
    // Auto-fill writes values without passing the confirmation gate; a mapped
    // sensitive field would be written into a section the user never unlocked.
    err('sensitive-maps-to', 'a sensitive field cannot declare mapsTo — auto-fill must never write into a gated section', id);
  }

  // UC-08: the cross-form reference declaration. The parser reads line-oriented
  // text, so the annotation is meaningless on any other control.
  const ref = field.crossRef;
  if (ref) {
    if (ref.vocabulary !== 'exhibitReference') {
      err('cross-ref-vocabulary', `crossRef vocabulary "${ref.vocabulary}" is not a known vocabulary`, id);
    }
    if (ref.role !== 'defines' && ref.role !== 'cites') {
      err('cross-ref-role', `crossRef role "${ref.role}" must be 'defines' or 'cites'`, id);
    }
    if (field.type !== 'text' && field.type !== 'textarea') {
      err('cross-ref-type', 'crossRef is only meaningful on a text or textarea field', id);
    }
  }
}

/** Structural rules for a repeating group and the columns it declares. */
function groupRules(
  field: FormFieldDefinition,
  err: (rule: string, message: string, fieldId?: string) => void,
  siblings: readonly FormFieldDefinition[],
): void {
  const columns = field.columns ?? [];
  if (columns.length === 0) {
    err('group-columns', 'group field declares no columns, so a row would have nothing in it', field.id);
    return;
  }

  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column.id)) {
      err('unique-ids', `duplicate column id "${column.id}"`, `${field.id}.${column.id}`);
    }
    seen.add(column.id);

    if (column.id === GROUP_ROW_ID_KEY) {
      // Rows carry their identity under this key; a column of the same name
      // would overwrite it and break every row-targeted edit and delete.
      err('reserved-id', `column id "${GROUP_ROW_ID_KEY}" is reserved for the row identifier`, field.id);
    }
    if (column.type === 'group') {
      // The renderer draws one table per group. A group inside a group has no
      // rendering, no numbering and no defined completeness.
      err('group-nesting', `column "${column.id}" is itself a group; groups do not nest`, field.id);
    }
    if (column.mapsTo !== undefined) {
      // Auto-fill (UC-02) writes one value per field id. Inside a group it has
      // no row to aim at, so it would copy the same case value into every row.
      err('group-maps-to', `column "${column.id}" declares mapsTo; auto-fill cannot target a row`, field.id);
    }
    fieldRules(column, err, `${field.id}.`);
  }

  if (field.complexityFieldId && !siblings.some((f) => f.id === field.complexityFieldId)) {
    // A check pointed at a field that does not exist would silently never fire.
    err(
      'complexity-field',
      `complexityFieldId "${field.complexityFieldId}" is not a field on this template`,
      field.id,
    );
  }

  const flag = field.sensitivityFlag;
  if (flag) {
    const column = columns.find((c) => c.id === flag.columnId);
    if (!column) {
      // A flag aimed at a column that does not exist can never fire, and would
      // silently report every schedule as non-sensitive.
      err('sensitivity-flag', `sensitivityFlag targets unknown column "${flag.columnId}"`, field.id);
    } else if (column.options && !column.options.some((o) => o.value === flag.whenValue)) {
      err(
        'sensitivity-flag',
        `sensitivityFlag value "${flag.whenValue}" is not an option of column "${flag.columnId}"`,
        field.id,
      );
    }
  }

  if (!columns.some((c) => c.required)) {
    // With no required column, isGroupValueComplete() treats an all-blank row as
    // complete and the progress bar would count empty rows as done.
    err('group-columns', 'group has no required column, so a blank row would count as complete', field.id);
  }
}

/**
 * Cross-field rules point at other fields, and a dangling reference fails
 * SILENTLY at runtime — there is simply nothing to compare, so no finding is
 * produced and nobody notices the rule stopped working. Only a build-time check
 * catches it, which is why these rules exist.
 */
function orderRules(
  field: FormFieldDefinition,
  err: (rule: string, message: string, fieldId?: string) => void,
  siblings: readonly FormFieldDefinition[],
): void {
  const v = field.validation;
  if (!v) return;
  const byId = new Map(siblings.map((f) => [f.id, f]));

  for (const [name, order] of [
    ['notBefore', v.notBefore],
    ['notAfter', v.notAfter],
  ] as const) {
    if (!order) continue;
    if (!order.fieldId && !order.casePath) {
      err('order-operand', `${name} names neither a fieldId nor a casePath`, field.id);
      continue;
    }
    if (order.fieldId && order.casePath) {
      err('order-operand', `${name} names both a fieldId and a casePath — pick one`, field.id);
    }
    if (field.type !== 'date' && field.type !== 'time') {
      err('order-type', `${name} is only meaningful on a date or time field`, field.id);
    }
    if (order.fieldId) {
      const other = byId.get(order.fieldId);
      if (!other) {
        err('order-target', `${name} points at "${order.fieldId}", which is not a field on this template`, field.id);
      } else if (other.type !== field.type) {
        // Comparing a date against a time compares 'YYYY-MM-DD' against 'HH:MM'
        // as strings, which is meaningless rather than merely wrong.
        err('order-type', `${name} compares a ${field.type} against a ${other.type}`, field.id);
      }
    }
    if (order.casePath && !CASE_FIELD_PATHS.has(order.casePath)) {
      err('order-target', `${name} casePath "${order.casePath}" is not a CaseFieldPath`, field.id);
    }
  }

  if (v.requiredWhen) {
    if (!byId.has(v.requiredWhen.fieldId)) {
      err(
        'required-when-target',
        `requiredWhen points at "${v.requiredWhen.fieldId}", which is not a field on this template`,
        field.id,
      );
    }
  }
}

/**
 * UC-07 template-level rules for the sensitive section. Field-level pieces
 * (top-level only, section present, no mapsTo) live in fieldRules; these are
 * the rules that only make sense across the whole template.
 */
function sensitiveRules(
  template: FormTemplate,
  err: (rule: string, message: string, fieldId?: string) => void,
): void {
  const sensitiveFields = template.fields.filter((f) => f.sensitive === true);
  if (sensitiveFields.length === 0) return;

  // One section: the renderer draws ONE gated block per template (one banner,
  // one confirmation). Two differently-titled sensitive sections would silently
  // share a single gate while looking like two.
  const sections = new Set(sensitiveFields.map((f) => f.section ?? ''));
  if (sections.size > 1) {
    err(
      'sensitive-section',
      `sensitive fields span ${sections.size} section headings; they must share one`,
    );
  }

  // The section must not be a mix: a non-sensitive field under the same heading
  // would render inside a block the template did not declare it into, or split
  // the heading in two — either way the declaration and the screen disagree.
  const [title] = sections;
  if (title) {
    const intruders = template.fields.filter((f) => f.section === title && f.sensitive !== true);
    for (const f of intruders) {
      err(
        'sensitive-section',
        `non-sensitive field shares the sensitive section heading "${title}"`,
        f.id,
      );
    }
  }

  // A sensitive section with no activation source is a dead declaration: the
  // flag that raises it comes from a sensitivityFlag group, and without one the
  // section could never appear — which would read as "handled" while handling
  // nothing.
  const hasTrigger = template.fields.some(
    (f) => f.type === 'group' && f.sensitivityFlag !== undefined && f.sensitive !== true,
  );
  if (!hasTrigger) {
    err(
      'sensitive-trigger',
      'template declares a sensitive section but no non-sensitive sensitivityFlag group to activate it',
    );
  }
}

function structural(template: FormTemplate): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  const err = (rule: string, message: string, fieldId?: string) =>
    findings.push({ templateCode: template.code, severity: 'error', rule, message, fieldId });

  if (template.fields.length === 0) {
    err('non-empty', 'template has no fields');
    return findings;
  }

  const seen = new Set<string>();
  for (const field of template.fields) {
    if (seen.has(field.id)) {
      err('unique-ids', `duplicate field id "${field.id}"`, field.id);
    }
    seen.add(field.id);

    fieldRules(field, err, '');
    orderRules(field, err, template.fields);
    if (field.type === 'group') {
      groupRules(field, err, template.fields);
    }
  }

  sensitiveRules(template, err);

  if (!template.fields.some((f) => f.required)) {
    err('has-required', 'template has no required fields, so progress can never be meaningful');
  }
  if (!Number.isInteger(template.templateVersion) || template.templateVersion < 1) {
    err('version', `templateVersion must be a positive integer, got ${template.templateVersion}`);
  }
  return findings;
}

function sourcing(template: FormTemplate): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  const add = (severity: 'error' | 'warning', rule: string, message: string, fieldId?: string) =>
    findings.push({ templateCode: template.code, severity, rule, message, fieldId });

  // Columns are scored too: a group's own helpText says how the table works,
  // while each column's says how to fill that box, and both need to be real.
  const fields = flattenFields(template.fields);
  for (const field of fields) {
    if (!field.provenance) {
      // The whole point of an assessed template: it states what it knows.
      add('error', 'provenance', 'assessed template field carries no provenance', field.id);
    }
    if ((field.helpText ?? '').length < MIN_HELP_TEXT_CHARS) {
      add(
        'error',
        'help-depth',
        `helpText under ${MIN_HELP_TEXT_CHARS} chars — say HOW to complete the box`,
        field.id,
      );
    }
  }

  const avgHelp = fields.reduce((n, f) => n + (f.helpText ?? '').length, 0) / fields.length;
  if (avgHelp < MIN_AVG_HELP_TEXT_CHARS) {
    add(
      'error',
      'help-depth-avg',
      `average helpText ${Math.round(avgHelp)} chars is below the ${MIN_AVG_HELP_TEXT_CHARS}-char bar MG11/MG5 set`,
    );
  }

  const covered = fields.filter((f) => f.validation && Object.keys(f.validation).length > 0).length;
  const coverage = covered / fields.length;
  if (coverage < MIN_VALIDATION_COVERAGE) {
    add(
      'error',
      'validation-coverage',
      `${Math.round(coverage * 100)}% of fields carry validation; the bar is ${Math.round(MIN_VALIDATION_COVERAGE * 100)}%`,
    );
  }

  // Advisory: a date of birth without noFutureDate is almost certainly a slip.
  for (const field of fields) {
    if (
      field.type === 'date' &&
      /birth|dob/i.test(field.id + ' ' + field.label) &&
      !field.validation?.noFutureDate
    ) {
      add('warning', 'no-future-date', 'date-of-birth field without noFutureDate', field.id);
    }
  }
  return findings;
}

/**
 * Top-level fields plus every group column, flattened for the sourcing scores.
 * Column ids are qualified so a finding names the box a human can find.
 */
function flattenFields(fields: readonly FormFieldDefinition[]): FormFieldDefinition[] {
  return fields.flatMap((field) =>
    field.type === 'group' && field.columns
      ? [field, ...field.columns.map((c) => ({ ...c, id: `${field.id}.${c.id}` }))]
      : [field],
  );
}

/**
 * UC-06: the language-assistance registries.
 *
 * Not a template check — these are data in libs/shared rather than fields on a
 * form — but it belongs in the same gate, because it enforces the rule UC-06
 * rests on: a prompt may only propose wording it can attribute. `canProposeVerbatim`
 * already strips an unattributable proposal at runtime, and this fails the build
 * so the mistake is loud rather than silent.
 *
 * The registries are parameters so the gate can be run against a planted defect;
 * they default to what actually ships.
 */
export function checkAssistanceRegistries(input?: {
  informal?: readonly NarrativePattern[];
  phrases?: readonly StandardPhrase[];
  hints?: readonly CompletenessHint[];
}): ConformanceFinding[] {
  const informal = input?.informal ?? INFORMAL_PATTERNS;
  const phrases = input?.phrases ?? STANDARD_PHRASES;
  const hints = input?.hints ?? COMPLETENESS_HINTS;

  const findings: ConformanceFinding[] = [];
  const err = (rule: string, message: string, fieldId?: string) =>
    findings.push({ templateCode: '(assistance)', severity: 'error', rule, message, fieldId });

  /** A pattern that matches the empty string matches everything, so it is not a rule. */
  const compiles = (source: string, rule: string, id: string): RegExp | null => {
    try {
      const regex = new RegExp(source, 'i');
      if (regex.test('')) {
        err(rule, 'pattern matches the empty string, so it can never discriminate', id);
        return null;
      }
      return regex;
    } catch {
      err(rule, 'pattern is not a valid regular expression', id);
      return null;
    }
  };

  const ids = new Set<string>();
  const claimId = (id: string, kind: string) => {
    const key = `${kind}:${id}`;
    if (ids.has(key)) err('assistance-id', `duplicate ${kind} id "${id}"`, id);
    ids.add(key);
  };

  for (const pattern of informal) {
    const id = pattern.phrase || '(unnamed)';
    if (!pattern.phrase?.trim()) err('assistance-phrase', 'informal pattern has no phrase', id);
    if (!pattern.explanation?.trim()) {
      err('assistance-explanation', 'informal pattern has no explanation', id);
    }
    if (pattern.kind !== 'informal') {
      err('assistance-kind', `informal registry holds a '${pattern.kind}' pattern`, id);
    }
    // THE RULE. An observation about register needs no authority; a proposed
    // replacement is drafting advice on a court document and needs a citation.
    if (
      pattern.suggestion !== undefined &&
      !canProposeVerbatim({
        provenance: pattern.suggestionProvenance,
        source: pattern.suggestionSource,
      })
    ) {
      err(
        'assistance-source',
        "carries a formal alternative without provenance 'documented' and a source, so it must not propose wording",
        id,
      );
    }
    claimId(id, 'informal');
  }

  for (const phrase of phrases) {
    const id = phrase.id || '(unnamed)';
    if (!phrase.id?.trim()) err('assistance-id', 'standard phrase has no id', id);
    if (!phrase.message?.trim()) err('assistance-message', 'standard phrase has no message', id);
    if (!phrase.insertText?.trim()) {
      err('assistance-insert-text', 'standard phrase has no wording to insert', id);
    }
    if (!phrase.trigger?.trim()) {
      err('assistance-trigger', 'standard phrase has no trigger, so it would be offered always', id);
    } else {
      compiles(phrase.trigger, 'assistance-trigger', id);
    }
    // Every standard phrase exists to be inserted, so an unattributable one has
    // no reason to ship at all.
    if (!canProposeVerbatim(phrase)) {
      err(
        'assistance-source',
        "standard phrase is not provenance 'documented' with a source, so its wording must not be insertable",
        id,
      );
    }
    claimId(id, 'phrase');
  }

  for (const hint of hints) {
    const id = hint.id || '(unnamed)';
    if (!hint.id?.trim()) err('assistance-id', 'completeness hint has no id', id);
    if (!hint.message?.trim()) err('assistance-message', 'completeness hint has no message', id);
    if (!hint.absentPattern?.trim()) {
      err('assistance-trigger', 'completeness hint has no pattern, so it would fire always', id);
    } else {
      compiles(hint.absentPattern, 'assistance-trigger', id);
    }
    if (hint.provenance === 'documented' && !hint.source?.trim()) {
      err('assistance-source', "hint claims provenance 'documented' but cites no source", id);
    }
    claimId(id, 'completeness');
  }

  return findings;
}

/** All findings for one template. */
export function checkTemplate(template: FormTemplate): ConformanceFinding[] {
  const findings = structural(template);
  if (template.verification !== undefined) {
    findings.push(...sourcing(template));
  }
  return findings;
}

/**
 * UC-08 catalogue-level rule: a vocabulary someone CITES must be DEFINED by
 * some template in the catalogue, or Check 3 would compare citations against
 * an empty universe and silently flag everything (or nothing). Catalogue-level
 * because the defining field legitimately lives on a different form.
 */
export function checkCrossRefVocabulary(
  templates: readonly FormTemplate[],
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  const defined = new Set<string>();
  for (const t of templates) {
    for (const f of t.fields) {
      if (f.crossRef?.role === 'defines') defined.add(f.crossRef.vocabulary);
    }
  }
  for (const t of templates) {
    for (const f of t.fields) {
      if (f.crossRef?.role === 'cites' && !defined.has(f.crossRef.vocabulary)) {
        findings.push({
          templateCode: t.code,
          severity: 'error',
          rule: 'cross-ref-vocabulary',
          message: `cites crossRef vocabulary "${f.crossRef.vocabulary}" which no template in the catalogue defines`,
          fieldId: f.id,
        });
      }
    }
  }
  return findings;
}

/** All findings across a catalogue; CI fails when any severity is `error`. */
export function checkAllTemplates(templates: readonly FormTemplate[]): ConformanceFinding[] {
  return [...templates.flatMap((t) => checkTemplate(t)), ...checkCrossRefVocabulary(templates)];
}

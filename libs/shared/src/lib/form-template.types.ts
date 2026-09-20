/**
 * Core template model for MG forms.
 *
 * A form template is a declarative, ordered list of field definitions.
 * The Angular dynamic renderer builds a FormGroup from it; the NestJS API
 * uses the same definition to validate submitted values (UC-03) and to lay
 * out generated PDFs (UC-05). Keep this file free of framework imports.
 */

export type MgFormCode =
  | 'MG1'
  | 'MG2'
  | 'MG3'
  | 'MG4'
  | 'MG5'
  | 'MG6'
  | 'MG11'
  | 'MG12'
  | 'MG14'
  | 'MG15'
  | 'MG16';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'time'
  | 'number'
  | 'select'
  | 'checkbox'
  /**
   * A repeating group: a numbered list of rows, each row carrying the scalar
   * fields named in `columns` (UC-04). Used for schedules such as the unused
   * material list, where the paper form is a table of items.
   *
   * Nothing keys off a form code to render one — a template declares a group and
   * the renderer handles it, so a schedule can move between forms (the MG6
   * designation is disputed) without any behaviour change.
   */
  | 'group';

/**
 * Every group row carries a stable identity under this key, generated once when
 * the row is created and never regenerated.
 *
 * The row's *displayed number* is its position + 1, computed at render and never
 * stored. That separation is the point: audit entries and sensitivity decisions
 * attach to the id, so deleting an item mid-schedule renumbers the view without
 * silently reattaching those decisions to different material.
 */
export const GROUP_ROW_ID_KEY = '__id';

/** See FormFieldDefinition.sensitivityFlag. */
export interface GroupSensitivityFlag {
  columnId: string;
  whenValue: string;
}

/** One row of a repeating group: its id plus a value per column. */
export type GroupRow = Record<string, unknown>;

export interface SelectOption {
  value: string;
  label: string;
}

/** Declarative validation rules — mapped to Angular Validators on the client
 *  and re-checked server-side when a draft is finalised (UC-03). */
export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  /** ECMAScript regex source (no flags). */
  pattern?: string;
  /** Human-readable message shown when `pattern` fails. */
  patternMessage?: string;
  min?: number;
  max?: number;
  /** Date fields: disallow dates after today (e.g. date of birth). */
  noFutureDate?: boolean;
  /** Group columns only: no two rows may share this value. Invalidates the
   *  later row, not the form, so the user can see which two collide. */
  uniqueInGroup?: boolean;
  /** UC-05: a named entry in FIELD_FORMATS. Named rather than a raw regex so the
   *  pattern, its message, its provenance and its citation live in one place —
   *  seven templates carry a URN box, and a wrong pattern copied seven times is
   *  seven edits and six chances to miss one. */
  format?: FieldFormatName;
  /** UC-05: requested severity. It is a REQUEST, not a setting: `severityFor()`
   *  caps it at what the format's provenance permits, so a template cannot
   *  smuggle in a blocking rule on a format nobody has sourced. */
  severity?: ValidationSeverity;
  /** UC-05: this value may not be earlier than the referenced one. */
  notBefore?: FieldDateOrder;
  /** UC-05: this value may not be later than the referenced one. */
  notAfter?: FieldDateOrder;
  /** UC-05: this field becomes required when another field holds a given value. */
  requiredWhen?: FieldRequiredWhen;
}

/**
 * How strongly a failed rule speaks (UC-05).
 *
 * `error` styles the field, invalidates the control and gates a future
 * finalisation. `advisory` states that something looks wrong and does nothing
 * else — the control stays valid and progress is unaffected.
 *
 * Neither blocks a save. A draft is allowed to be incomplete and inconsistent;
 * that is what a draft is, and autosave fires 1.5s after a keystroke.
 */
export type ValidationSeverity = 'error' | 'advisory';

/** Formats the registry knows. See FIELD_FORMATS for the definitions. */
export type FieldFormatName =
  | 'telephone'
  | 'email'
  | 'postcode'
  | 'urn'
  | 'asn'
  | 'custodyNumber'
  | 'collarNumber'
  | 'cpsReference';

/**
 * One format, as data.
 *
 * `provenance` is about the FORMAT, not about the field that uses it: the
 * research evidences that a URN box exists on five forms (so those fields are
 * `documented`) while saying nothing about how a URN is spelled — which is why
 * the `urn` format is `inference`.
 */
export interface FieldFormatDefinition {
  /** ECMAScript regex source, no flags. Anchored and length-bounded. */
  pattern: string;
  /** Shown to the user: the error message at `error`, the hint at `advisory`. */
  hint: string;
  example: string;
  provenance: FieldProvenance;
  /** A citation a reader can follow. Required before a format may be `error`. */
  source?: string;
}

/**
 * An ordering constraint against another value (UC-05).
 *
 * Exactly one of `fieldId` (a sibling on the same template) or `casePath` (a
 * case datum, resolved through UC-02's resolveCaseField) must be set. The case
 * operand exists because neither cross-field pair the scope names is present on
 * a single form — see docs/usecases/uc-05/open-questions.md F3.
 */
export interface FieldDateOrder {
  fieldId?: string;
  casePath?: CaseFieldPath;
  /** Equality also fails — "strictly after" rather than "not before". */
  strict?: boolean;
  message?: string;
  /** Ordering rules are not registry-backed, so this severity stands as given:
   *  some orderings are impossible, others merely unusual. */
  severity?: ValidationSeverity;
}

/** This field is required only while another field holds a given value. */
export interface FieldRequiredWhen {
  fieldId: string;
  equals: string;
}

/**
 * Paths into the case DTO that a field may auto-populate from (UC-02).
 * Most map directly onto CaseSummaryDto properties; `offenceDate` and
 * `charges` are derived from the case's offences and become ambiguous when
 * the offences disagree (see resolveCaseField in autofill.ts).
 */
export type CaseFieldPath =
  | 'urn'
  | 'defendantName'
  | 'defendantDob'
  | 'defendantAddress'
  | 'courtName'
  | 'cpsReference'
  | 'officerInCase'
  | 'nextHearingAt'
  | 'offenceDate'
  | 'charges';

export interface FormFieldDefinition {
  /** Stable identifier — used as the FormControl name and as the key in the
   *  draft's JSON values. Never rename an id once drafts exist; add a new
   *  field and migrate instead. */
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Contextual help shown when the user expands the "?" icon. */
  helpText: string;
  /** Case DTO path this field auto-populates from (UC-02). Only annotate
   *  where the case data is genuinely the right value — e.g. an MG11
   *  witness name is NOT the defendant, so it stays unmapped. */
  mapsTo?: CaseFieldPath;
  /** Evidence behind this field being on the real form. Absent means the field
   *  predates the sourcing work or has been practitioner-confirmed. */
  provenance?: FieldProvenance;
  /**
   * The citation behind `provenance` — which printed box on which specimen, and
   * where the research recorded it. A reader can follow it without trusting us.
   *
   * Optional because most templates predate per-field citations: their evidence
   * lives in `docs/mg-form-research-findings.md` keyed by form rather than on the
   * field. MG6's rebuild (UC-04) is the first field set to carry it inline, and
   * conformance enforces that a `source` is never empty and never appears without
   * a `provenance`. Back-filling the other templates is a separate job.
   */
  source?: string;
  validation?: FieldValidation;
  /** Options for `select` fields. */
  options?: SelectOption[];
  /**
   * Columns of a `group` field, in display order. Each is an ordinary field
   * definition restricted to scalar types — a group inside a group is rejected
   * by the conformance checker.
   */
  columns?: FormFieldDefinition[];
  /** For a `group`: the singular noun for one row, used in buttons and the
   *  delete confirmation. Defaults to "item". */
  rowNoun?: string;
  /** For a `group`: the id of the field holding the complexity band the
   *  completeness check compares against. Named by the template so the check
   *  needs no knowledge of which form it is running on. */
  complexityFieldId?: string;
  /** For a `group`: which column raises the derived sensitivity flag, and the
   *  value that raises it. Declared on the template so the flag is wiring, not
   *  a form-code special case — any schedule can opt in. */
  sensitivityFlag?: GroupSensitivityFlag;
  /** Optional section heading rendered above this field. */
  section?: string;
  /** Placeholder / example text. */
  placeholder?: string;
  /** Rows hint for textareas. */
  rows?: number;
  /**
   * UC-06: this field holds narrative prose — a witness's account or a case
   * summary — so it gets the highlight treatment and the Legal Language
   * Assistant panel.
   *
   * DECLARED, never inferred. There are 57 textareas across the eleven
   * templates and most are not prose: MG11's `witnessAddress` holds an address
   * and MG5's `chargesList` holds a list of charges, and flagging "I think"
   * inside an address is nonsense. Inferring from `type` or `rows` would do
   * exactly that, so a template says which of its boxes are narratives — the
   * same discipline `group` (UC-04) and the validation rules (UC-05) follow, and
   * it keeps form codes out of the renderer.
   *
   * Only meaningful on a `textarea`; conformance fails it anywhere else.
   */
  narrative?: true;
  /**
   * UC-07: this field belongs to the sensitive-material (MG6D) section — the
   * part of the form that activates when the schedule holds sensitive material,
   * renders behind the red restricted-access banner, is redacted from users
   * without the permission, requires a recorded confirmation to edit, and is
   * excluded from the non-sensitive schedule export.
   *
   * DECLARED, never inferred — the same discipline as `narrative` and `group`,
   * and for the same reason: which boxes carry sensitive detail is a statement
   * about the form, not something code should guess from types or labels. All
   * UC-07 behaviour keys off this declaration and never off the form code,
   * because MG6D's designation is disputed (LER-1205) — if a decision-maker
   * later splits MG6D into its own form, the fields move wholesale.
   *
   * Top-level fields only; conformance enforces that, a `section` heading, one
   * sensitive section per template, no `mapsTo` (auto-fill must never write
   * into a gated section), and that the template also declares a
   * `sensitivityFlag` group — without one the section could never activate.
   */
  sensitive?: true;
  /**
   * UC-08: this field participates in a cross-form reference vocabulary — a
   * kind of identifier that means the same thing on every form of a case, so
   * the review's Check 3 may compare them.
   *
   * DECLARED, never inferred — the `narrative`/`sensitive` discipline applied
   * to cross-form identity. `defines` marks the list of record (MG12's exhibit
   * list); `cites` marks fields that refer to entries of that list (MG11's
   * "Exhibits referred to"). Both fields' own helpText documents the reference
   * convention ("initials and a sequence number, e.g. JS/1", one per line),
   * which is the ONLY convention the parser honours — prose lines are ignored,
   * never guessed at (uc-08 open-questions D2).
   *
   * The vocabulary is a union of one on purpose: a second vocabulary must
   * argue its way in with the same documentation bar, not arrive as a string.
   * Note that `mapsTo` already gives Check 3 its other comparisons for free —
   * `urn`/`defendantName` repeat across a case's forms through it, so
   * equality there needs no extra declaration.
   */
  crossRef?: CrossFormReference;
}

/** See FormFieldDefinition.crossRef. */
export interface CrossFormReference {
  vocabulary: 'exhibitReference';
  role: 'defines' | 'cites';
}

/**
 * Whether a practitioner has signed this template's field set off against the
 * real form. `unverified` is a hard product statement, not a nicety: the form
 * must not be presented as filing-ready, because a wrong box on a police case
 * file document is a professional-conduct risk rather than a cosmetic bug.
 *
 * Optional by design. A template carries it once its field set has actually been
 * assessed; absent means "not yet assessed", and each form gains it as its own
 * ticket lands rather than all eleven being labelled in one sweep.
 */
export type TemplateVerification = 'verified' | 'unverified';

/** How confident we are that a field is really a box on the printed form. */
export type FieldProvenance = 'documented' | 'likely' | 'inference';

export interface FormTemplate {
  code: MgFormCode;
  name: string;
  description: string;
  /** Bump when the field set changes; drafts record the version they were
   *  created against so old drafts still render correctly (UC-06 archive). */
  templateVersion: number;
  /** See TemplateVerification — absent means not yet assessed. */
  verification?: TemplateVerification;
  fields: FormFieldDefinition[];
}

/**
 * The one test for "may this read as filing-ready?" — shared so screen and
 * paper cannot disagree (UC-09 hoists what the header chip learned in
 * mgs/verification-banner-absent): `verification` is optional, absent means
 * "not yet assessed", which is even further from sign-off than the literal
 * 'unverified' — so the test is against 'verified', never against
 * 'unverified'.
 */
export function isTemplateUnverified(template: FormTemplate): boolean {
  return template.verification !== 'verified';
}

/** Required-field ids for a template — drives the progress indicator. */
export function requiredFieldIds(template: FormTemplate): string[] {
  return template.fields.filter((f) => f.required).map((f) => f.id);
}

/** True when a value counts as "completed" for progress purposes. */
export function isFieldValueComplete(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean') return value; // declarations must be ticked
  // A repeating group with no rows is empty, not complete. Without this an
  // empty required schedule would count as done, because `[]` is non-null.
  // Row-level completeness needs the column definitions — see
  // isGroupValueComplete in schedule.ts.
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

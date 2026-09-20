/**
 * Vulnerable-witness derivation for MG11 (UC-03).
 *
 * Pure so the wizard, the API and later the PDF renderer (UC-09) all agree on
 * who counts as vulnerable. The result is persisted into the draft's values as
 * `isVulnerableWitness` so downstream output does not have to re-derive it.
 */

/** The key the derived flag is stored under in a draft's values. */
export const MG11_VULNERABLE_FLAG_KEY = 'isVulnerableWitness';

/** Field revealed once a witness is treated as vulnerable. */
export const MG11_SPECIAL_MEASURES_APPLIED_FIELD_ID = 'specialMeasuresApplied';

/** `specialMeasures` selections that make a witness vulnerable regardless of age. */
export const MG11_VULNERABLE_SPECIAL_MEASURES: readonly string[] = [
  'vulnerable',
  'intimidated',
  'assessment',
];

/** Age in whole years on `onDate`, or null if either date is unusable. */
export function ageOnDate(dob: unknown, onDate: unknown): number | null {
  if (typeof dob !== 'string' || dob === '') return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;

  // Undated statements are assessed as at today, so age is never silently skipped.
  const referenceSource = typeof onDate === 'string' && onDate !== '' ? onDate : null;
  const reference = referenceSource ? new Date(referenceSource) : new Date();
  if (Number.isNaN(reference.getTime())) return null;

  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return age;
}

/**
 * True when the witness is under 18 at the statement date, or a special-measures
 * category has been selected. Either route reveals the "Special measures
 * applied" field and the header indicator.
 */
export function isVulnerableWitness(values: Record<string, unknown>): boolean {
  const measures = values['specialMeasures'];
  if (typeof measures === 'string' && MG11_VULNERABLE_SPECIAL_MEASURES.includes(measures)) {
    return true;
  }
  const age = ageOnDate(values['witnessDob'], values['statementDate']);
  return age !== null && age < 18;
}

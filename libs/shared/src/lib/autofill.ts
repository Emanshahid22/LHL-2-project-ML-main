import { CaseSummaryDto } from './api.types';
import { CaseFieldPath } from './form-template.types';

/**
 * Resolution of one case-field path against a case (UC-02).
 * `value`: usable data; `ambiguous`: the case holds conflicting candidates
 * and a human must choose; `no_data`: the case simply lacks the information.
 */
export type CaseFieldResolution =
  | { kind: 'value'; value: string }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'no_data'; reason: string };

/** ISO timestamp → the YYYY-MM-DD string our date fields store. */
function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function direct(value: string | null, missingReason: string): CaseFieldResolution {
  return value && value.trim().length > 0
    ? { kind: 'value', value }
    : { kind: 'no_data', reason: missingReason };
}

/**
 * Resolves a CaseFieldPath against a case DTO. Derived paths never guess:
 * offences that disagree produce an `ambiguous` outcome, not a value.
 */
export function resolveCaseField(path: CaseFieldPath, c: CaseSummaryDto): CaseFieldResolution {
  switch (path) {
    case 'urn':
      return direct(c.urn, 'The case file has no URN recorded');
    case 'defendantName':
      return direct(c.defendantName, 'The case file has no defendant name recorded');
    case 'defendantAddress':
      return direct(c.defendantAddress, 'The case file has no defendant address recorded');
    case 'courtName':
      return direct(c.courtName, 'The case file has no court recorded');
    case 'cpsReference':
      return direct(c.cpsReference, 'The case file has no CPS reference recorded');
    case 'officerInCase':
      return direct(c.officerInCase, 'The case file has no officer in the case recorded');
    case 'defendantDob':
      return c.defendantDob
        ? { kind: 'value', value: toDateOnly(c.defendantDob) }
        : { kind: 'no_data', reason: 'The case file has no defendant date of birth recorded' };
    case 'nextHearingAt':
      return c.nextHearingAt
        ? { kind: 'value', value: toDateOnly(c.nextHearingAt) }
        : { kind: 'no_data', reason: 'No hearing is listed on the case file' };
    case 'offenceDate': {
      const dates = [...new Set(c.offences.map((o) => toDateOnly(o.offenceDate)))];
      if (dates.length === 0) {
        return { kind: 'no_data', reason: 'The case file has no offence recorded' };
      }
      if (dates.length > 1) {
        return {
          kind: 'ambiguous',
          reason: `${dates.length === 2 ? 'Two' : dates.length} offence dates exist on this case — choose manually`,
        };
      }
      return { kind: 'value', value: dates[0] };
    }
    case 'charges': {
      if (c.offences.length === 0) {
        return { kind: 'no_data', reason: 'The case file has no charges recorded' };
      }
      return { kind: 'value', value: c.offences.map((o) => o.chargeWording).join('\n') };
    }
  }
}

import { Injectable } from '@angular/core';
import { DateAdapter, type MatDateFormats } from '@angular/material/core';

/**
 * UK date convention for every date field in the app (UC-03 signature date,
 * UC-05 engine-wide rule): typed and displayed as DD/MM/YYYY.
 */
export const UK_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: 'DD/MM/YYYY' },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'DD MMMM YYYY',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

/** The wire/storage shape — exactly what drafts already hold. */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Typed entry: DD/MM/YYYY with / . or - separators, 1- or 2-digit day/month. */
const TYPED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** Sentinel for unparseable input, so Material can raise matDatepickerParse. */
const INVALID = 'invalid';

const LOCALE = 'en-GB';

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Builds an ISO string, rejecting impossible dates like 31/02/2026. */
function toIso(year: number, month: number, day: number): string {
  const utc = new Date(Date.UTC(year, month, day));
  // A rolled-over date (31 Feb -> 3 Mar) will not match what was asked for.
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month ||
    utc.getUTCDate() !== day
  ) {
    return INVALID;
  }
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * A DateAdapter whose date type is the ISO string a draft already stores.
 *
 * Why not `provideNativeDateAdapter`: the native adapter puts `Date` objects in
 * the FormControl. That would change what gets persisted, and would silently
 * break UC-02 — auto-fill provenance is compared with
 * `JSON.stringify(control.value) === JSON.stringify(provenance.value)`, and a
 * Date never equals the ISO string the server recorded, so every "Auto-filled"
 * badge would vanish. The no-future-date validator compares ISO strings too.
 *
 * Keeping `D = string` means the display convention changes and storage does
 * not: controls hold "YYYY-MM-DD" before and after.
 */
@Injectable()
export class IsoDateAdapter extends DateAdapter<string> {
  /** Parsed parts, or null when the value is not a usable ISO date. */
  private parts(date: string): { year: number; month: number; day: number } | null {
    const match = typeof date === 'string' ? ISO.exec(date) : null;
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return toIso(year, month, day) === date ? { year, month, day } : null;
  }

  private utc(date: string): Date | null {
    const p = this.parts(date);
    return p ? new Date(Date.UTC(p.year, p.month, p.day)) : null;
  }

  getYear(date: string): number {
    return this.parts(date)?.year ?? NaN;
  }

  getMonth(date: string): number {
    return this.parts(date)?.month ?? NaN;
  }

  getDate(date: string): number {
    return this.parts(date)?.day ?? NaN;
  }

  getDayOfWeek(date: string): number {
    return this.utc(date)?.getUTCDay() ?? NaN;
  }

  getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    const formatter = new Intl.DateTimeFormat(LOCALE, { month: style, timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, month) =>
      formatter.format(new Date(Date.UTC(2020, month, 1))),
    );
  }

  getDateNames(): string[] {
    return Array.from({ length: 31 }, (_, i) => String(i + 1));
  }

  getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    const formatter = new Intl.DateTimeFormat(LOCALE, { weekday: style, timeZone: 'UTC' });
    // 2020-11-01 was a Sunday, which is index 0 for Material.
    return Array.from({ length: 7 }, (_, day) =>
      formatter.format(new Date(Date.UTC(2020, 10, 1 + day))),
    );
  }

  getYearName(date: string): string {
    return String(this.getYear(date));
  }

  getFirstDayOfWeek(): number {
    return 1; // Monday, per UK convention.
  }

  getNumDaysInMonth(date: string): number {
    const p = this.parts(date);
    if (!p) return NaN;
    return new Date(Date.UTC(p.year, p.month + 1, 0)).getUTCDate();
  }

  clone(date: string): string {
    return date;
  }

  createDate(year: number, month: number, date: number): string {
    return toIso(year, month, date);
  }

  today(): string {
    const now = new Date();
    return toIso(now.getFullYear(), now.getMonth(), now.getDate());
  }

  parse(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (raw === '') return null;

    const typed = TYPED.exec(raw);
    if (typed) {
      return toIso(Number(typed[3]), Number(typed[2]) - 1, Number(typed[1]));
    }
    // Accept the stored shape too, so programmatic values round-trip.
    const iso = ISO.exec(raw);
    if (iso) {
      return toIso(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    return this.invalid();
  }

  format(date: string, displayFormat: string): string {
    const p = this.parts(date);
    if (!p) return '';
    const utc = new Date(Date.UTC(p.year, p.month, p.day));

    switch (displayFormat) {
      case 'MMM YYYY':
        return new Intl.DateTimeFormat(LOCALE, {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(utc);
      case 'MMMM YYYY':
        return new Intl.DateTimeFormat(LOCALE, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(utc);
      case 'DD MMMM YYYY':
        return new Intl.DateTimeFormat(LOCALE, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(utc);
      default:
        return `${pad(p.day)}/${pad(p.month + 1)}/${pad(p.year, 4)}`;
    }
  }

  addCalendarYears(date: string, years: number): string {
    return this.addCalendarMonths(date, years * 12);
  }

  addCalendarMonths(date: string, months: number): string {
    const p = this.parts(date);
    if (!p) return this.invalid();
    const target = new Date(Date.UTC(p.year, p.month + months, 1));
    const year = target.getUTCFullYear();
    const month = target.getUTCMonth();
    // Clamp, so 31 Jan + 1 month is 28/29 Feb rather than rolling into March.
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return toIso(year, month, Math.min(p.day, lastDay));
  }

  addCalendarDays(date: string, days: number): string {
    const utc = this.utc(date);
    if (!utc) return this.invalid();
    utc.setUTCDate(utc.getUTCDate() + days);
    return toIso(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }

  toIso8601(date: string): string {
    return this.parts(date) ? date : '';
  }

  /**
   * Called with whatever the form model holds. Empty stays empty so an untouched
   * date field still saves as "" exactly as it does today.
   */
  override deserialize(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
      return toIso(value.getFullYear(), value.getMonth(), value.getDate());
    }
    return this.parse(value);
  }

  isDateInstance(obj: unknown): boolean {
    return typeof obj === 'string';
  }

  isValid(date: string): boolean {
    return this.parts(date) !== null;
  }

  invalid(): string {
    return INVALID;
  }
}

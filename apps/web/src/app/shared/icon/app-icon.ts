import { Component, input } from '@angular/core';

/**
 * The icon names this app uses. Deliberately a closed set — every icon has to
 * mean something that exists in the product.
 */
export type IconName =
  | 'shield'
  | 'dashboard'
  | 'folder'
  | 'document'
  | 'mic'
  | 'gavel'
  | 'receipt'
  | 'person'
  | 'list'
  | 'eye'
  | 'edit';

/**
 * Inline SVG icons.
 *
 * Deliberately NOT an icon webfont. A ligature font that fails to load renders
 * its icon *name* as visible text ("description", "gavel"), which would both
 * look broken offline and pollute text assertions in the E2E suite. These are
 * hand-drawn 24×24 stroke glyphs inheriting currentColor, so they need no
 * network and cannot leak text.
 *
 * The shapes are written directly in the template rather than injected through
 * [innerHTML]: innerHTML is parsed as HTML, where `path`/`circle`/`line` are not
 * valid elements and get dropped. Angular's template compiler namespaces them
 * correctly.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      class="app-icon"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('shield') {
          <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
        }
        @case ('dashboard') {
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        }
        @case ('folder') {
          <path d="M3.5 7a2 2 0 012-2h3.2l1.8 2h7a2 2 0 012 2v7a2 2 0 01-2 2h-12a2 2 0 01-2-2V7z" />
        }
        @case ('mic') {
          <rect x="9.5" y="3" width="5" height="10" rx="2.5" />
          <path d="M6.5 11.5a5.5 5.5 0 0011 0" />
          <line x1="12" y1="17" x2="12" y2="20.5" />
          <line x1="9" y1="20.5" x2="15" y2="20.5" />
        }
        @case ('gavel') {
          <line x1="4" y1="20" x2="12" y2="20" />
          <path d="M7.2 9.6l4.2-4.2 4.6 4.6-4.2 4.2z" />
          <line x1="13.5" y1="7.5" x2="17.5" y2="3.5" />
          <line x1="16.5" y1="12.5" x2="20.5" y2="8.5" />
        }
        @case ('receipt') {
          <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17z" />
          <line x1="9" y1="8.5" x2="15" y2="8.5" />
          <line x1="9" y1="12" x2="15" y2="12" />
        }
        @case ('person') {
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 20a6.5 6.5 0 0113 0" />
        }
        @case ('list') {
          <line x1="9" y1="6.5" x2="19.5" y2="6.5" />
          <line x1="9" y1="12" x2="19.5" y2="12" />
          <line x1="9" y1="17.5" x2="19.5" y2="17.5" />
          <circle cx="5" cy="6.5" r="1.1" />
          <circle cx="5" cy="12" r="1.1" />
          <circle cx="5" cy="17.5" r="1.1" />
        }
        @case ('eye') {
          <path d="M2.5 12s3.6-5.5 9.5-5.5S21.5 12 21.5 12s-3.6 5.5-9.5 5.5S2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="2.5" />
        }
        @case ('edit') {
          <path d="M4.5 19.5h4l10-10-4-4-10 10z" />
          <line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
        }
        @default {
          <!-- document -->
          <path d="M6.5 3.5h7l4.5 4.5v12a1 1 0 01-1 1h-10a1 1 0 01-1-1v-15a1 1 0 011-1z" />
          <path d="M13.5 3.5V8h4.5" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="16.5" x2="15" y2="16.5" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .app-icon {
      display: block;
    }
  `,
})
export class AppIcon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly strokeWidth = input(1.7);
}

/**
 * Icon and accent for each MG form. Both are presentation only — the card's
 * code, name and description always come from the template definition.
 */
export interface FormVisual {
  icon: IconName;
  accent: string;
}

const DEFAULT_VISUAL: FormVisual = { icon: 'document', accent: 'accent-slate' };

const FORM_VISUALS: Record<string, FormVisual> = {
  MG1: { icon: 'document', accent: 'accent-indigo' }, // File front sheet
  MG2: { icon: 'mic', accent: 'accent-teal' }, // Taped interview description
  MG3: { icon: 'gavel', accent: 'accent-plum' }, // Report to CPS for charging
  MG4: { icon: 'receipt', accent: 'accent-clay' }, // Charge sheet / requisition
  MG5: { icon: 'list', accent: 'accent-slate' }, // Case summary
  MG6: { icon: 'folder', accent: 'accent-moss' }, // Unused material
  MG11: { icon: 'person', accent: 'accent-indigo' }, // Witness statement
  MG12: { icon: 'list', accent: 'accent-teal' }, // Exhibit list
  MG14: { icon: 'eye', accent: 'accent-plum' }, // Eyewitness / identification
  MG15: { icon: 'edit', accent: 'accent-clay' }, // Record of interview (non-taped)
  MG16: { icon: 'gavel', accent: 'accent-moss' }, // Bad character evidence
};

export function formVisual(code: string): FormVisual {
  return FORM_VISUALS[code] ?? DEFAULT_VISUAL;
}

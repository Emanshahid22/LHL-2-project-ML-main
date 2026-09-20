/**
 * UC-09: the embedded render font (deviation 12 resolution).
 *
 * Loads the generated @font-face asset (libs/shared/assets/fonts, built by
 * tools/generate-embedded-font-css) once and hands it to every render, so
 * glyphs resolve from bytes this repo ships — never from whatever face the
 * machine's fontconfig picks for `serif` (which is exactly how PR #194's
 * render-regression failed on ubuntu-latest). Missing asset = broken
 * checkout: the render fails loudly rather than quietly substituting fonts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cached: string | null = null;

export function renderFontCss(): string {
  if (cached !== null) return cached;
  const candidates = [
    process.env['RENDER_FONT_CSS'],
    resolve(process.cwd(), 'libs/shared/assets/fonts/dejavu-embedded.css'),
    resolve(__dirname, '../../../../libs/shared/assets/fonts/dejavu-embedded.css'),
    resolve(__dirname, '../../../../../libs/shared/assets/fonts/dejavu-embedded.css'),
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  for (const path of candidates) {
    if (existsSync(path)) {
      cached = readFileSync(path, 'utf8');
      return cached;
    }
  }
  throw new Error(
    'Embedded render font asset not found (libs/shared/assets/fonts/dejavu-embedded.css) — regenerate with tools/generate-embedded-font-css or set RENDER_FONT_CSS.',
  );
}

/**
 * UC-09: HTML → PDF via Chromium print-to-PDF (decision D1, ratified 25 Aug
 * 2026 over WeasyPrint) using the Phase 0 minimal-RSS profile: the
 * chrome-headless-shell binary Playwright already ships, single process, no
 * GPU, one renderer. Measured 142–155 MB peak RSS printing the heaviest
 * realistic case vs 393 MB for default full Chromium — the numbers live in
 * the PRD §13.
 *
 * One browser is launched PER JOB and closed after (PRD §7: no long-lived
 * browser) under a hard timeout; the queue runs one job at a time, so at most
 * one Chromium exists at any moment.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Not a static import: playwright-core is present wherever @playwright/test
// is, but the API must boot (and every non-render endpoint must work) even on
// a box without it — a missing renderer is a render-time failure, not a boot
// failure.
type PlaywrightCore = typeof import('playwright-core');

export const CHROMIUM_RENDER_TIMEOUT_MS = 30_000;

/** The Phase 0 profile — tuned for the 1 GB staging container. */
export const CHROMIUM_RENDER_ARGS: readonly string[] = [
  '--single-process',
  '--no-zygote',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--renderer-process-limit=1',
  '--disable-extensions',
  '--no-first-run',
  '--disable-background-networking',
  '--js-flags=--max-old-space-size=192',
];

/**
 * Prefer the headless shell (the measured profile); fall back to full
 * Chromium if only that is installed. CHROMIUM_EXECUTABLE overrides both for
 * deployments with a system Chromium.
 */
export function resolveChromiumExecutable(): string | undefined {
  const override = process.env['CHROMIUM_EXECUTABLE'];
  if (override && existsSync(override)) return override;
  const cache = process.env['PLAYWRIGHT_BROWSERS_PATH'] || join(homedir(), '.cache', 'ms-playwright');
  try {
    for (const dir of readdirSync(cache).sort().reverse()) {
      if (!dir.startsWith('chromium_headless_shell-')) continue;
      const root = join(cache, dir);
      for (const inner of readdirSync(root)) {
        const candidate = join(root, inner, 'chrome-headless-shell');
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
    /* fall through to Playwright's default resolution */
  }
  return undefined;
}

export interface PdfRenderInput {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
  /** Extra top space so body content never collides with the running band. */
  marginMm: { top: number; right: number; bottom: number; left: number };
}

export async function renderPdf(input: PdfRenderInput): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chromium } = require('playwright-core') as PlaywrightCore;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [...CHROMIUM_RENDER_ARGS],
    timeout: CHROMIUM_RENDER_TIMEOUT_MS,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(input.html, {
      waitUntil: 'load',
      timeout: CHROMIUM_RENDER_TIMEOUT_MS,
    });
    // The embedded @font-face (deviation 12) must be RESOLVED before print:
    // 'load' can fire while the data-URI font is still parsing, and a print
    // that races it falls back to the machine's last-resort face — wrong
    // metrics, different wraps, and exactly the cross-machine drift the
    // embed exists to kill.
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const m = input.marginMm;
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: input.headerTemplate,
      footerTemplate: input.footerTemplate,
      margin: {
        top: `${m.top}mm`,
        right: `${m.right}mm`,
        bottom: `${m.bottom}mm`,
        left: `${m.left}mm`,
      },
    });
    return normalizePdfDates(Buffer.from(pdf));
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Chromium stamps CreationDate/ModDate into every PDF, which makes two
 * renders of IDENTICAL content differ by exactly those bytes — breaking the
 * content-hash identity the storage layer is built on (same plaintext →
 * same key → the existing row already tells the truth). The timestamps are
 * replaced in place with a fixed instant of the SAME byte length, so xref
 * offsets stay valid. Nothing else in Chromium's output varies run to run
 * (proven in the build notes' determinism probe).
 */
export function normalizePdfDates(pdf: Buffer): Buffer {
  const text = pdf.toString('latin1');
  const normalized = text.replace(
    /(\/(?:Creation|Mod)Date \(D:)\d{14}/g,
    '$120260101000000',
  );
  return Buffer.from(normalized, 'latin1');
}

/**
 * Page count read from the finished PDF itself. Chromium writes the page tree
 * uncompressed, so the root /Pages node's /Count is present in the byte
 * stream; counting /Type /Page objects cross-checks it. Validated against
 * pdfinfo during the build (see the PR's build notes). Used for the DB row
 * and for the MG11 declared-vs-actual assertion.
 */
export function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const pageObjects = text.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  let maxCount = 0;
  for (const m of text.matchAll(/\/Count\s+(\d+)/g)) {
    maxCount = Math.max(maxCount, Number(m[1]));
  }
  if (pageObjects > 0 && maxCount > 0 && pageObjects !== maxCount) {
    // Two independent reads disagreeing means the parse is not trustworthy.
    throw new Error(`PDF page count ambiguous: ${pageObjects} page objects vs /Count ${maxCount}`);
  }
  const count = maxCount || pageObjects;
  if (count < 1) throw new Error('PDF page count unreadable');
  return count;
}

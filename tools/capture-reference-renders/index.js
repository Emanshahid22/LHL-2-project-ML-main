#!/usr/bin/env node
/**
 * capture-reference-renders — one reference render per form (LER-1156).
 *
 * Renders each of the 11 templates from the sanctioned fixture values
 * (./fixture-values.js — frozen Nadia Kowalczyk data, deterministic by
 * construction) through the REAL pipeline pieces: buildRenderModel →
 * CleanA4Binding's layout → modelToHtml → the pinned Chromium, screenshotted
 * at A4 width. Beside each PNG a provenance sidecar records the template and
 * layout versions and whether the baseline is a self-referent only (the four
 * forms with no genuine specimen make no fidelity claim — D2/D6).
 *
 * The screenshot is the BODY layout; the running draft band and page footer
 * are print-engine chrome (Chromium headerTemplate/footerTemplate), asserted
 * by the e2e suite on real PDFs instead. Page-count drift is likewise the
 * e2e suite's assertion; this gate owns pixel drift.
 *
 *   node tools/capture-reference-renders --out <dir>     # capture
 *   (re-capture into e2e/reference-renders is a DELIBERATE act for a PR —
 *    ci.yml only captures candidates to a temp dir.)
 *
 * WHERE a capture is authoritative (deviation 12, final resolution): only
 * the "Capture reference renders" workflow on ubuntu-latest. The embedded
 * font fixed font SELECTION, but rasterization (FreeType/fontconfig
 * hinting/antialiasing) still differs between machines — PR #194 drifted
 * 1-4% on every baseline even with identical font bytes. Baseline and
 * candidate must come from byte-identical environments, so committed
 * baselines are captured by CI's own runner and a LOCAL run of this tool
 * (or of `npm run render-regression`) is ADVISORY only. Each sidecar
 * records where its PNG was captured (capturedOn).
 */
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(join(__dirname, '..', '..', 'package.json'));
const {
  FORM_TEMPLATES,
  buildRenderModel,
  CLEAN_A4_LAYOUT,
  modelToHtml,
} = require('../../libs/shared/dist/index.js');
// Deviation 12: renders are font-self-contained — the embedded @font-face
// asset ships the exact glyphs, so baselines captured here match any runner.
const FONT_CSS = require('node:fs').readFileSync(
  join(__dirname, '..', '..', 'libs', 'shared', 'assets', 'fonts', 'dejavu-embedded.css'),
  'utf8',
);
const { FIXTURE, valuesFor, SELF_REFERENT_ONLY } = require('./fixture-values');

/** A4 at 96dpi. Fixed: the whole point is that nothing about this varies. */
const VIEWPORT = { width: 794, height: 1123 };

/** Honest provenance for the sidecar: WHERE these pixels were rasterized.
 *  In the capture workflow this names the runner image and run id; anywhere
 *  else it says so — a locally-captured baseline must be recognisable as
 *  not authoritative at a glance. */
function capturedOn() {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const image = [process.env.ImageOS, process.env.ImageVersion].filter(Boolean).join(' ');
    return `${process.env.RUNNER_LABEL || 'github-actions'} (${image || 'image unrecorded'}), workflow run ${process.env.GITHUB_RUN_ID}`;
  }
  const os = require('node:os');
  return `local ${os.platform()} ${os.release()} — ADVISORY ONLY; authoritative baselines come from the capture workflow (ubuntu-latest)`;
}

function resolveChromium() {
  const { existsSync, readdirSync } = require('node:fs');
  const { homedir } = require('node:os');
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), '.cache', 'ms-playwright');
  try {
    for (const dir of readdirSync(cache).sort().reverse()) {
      if (!dir.startsWith('chromium_headless_shell-')) continue;
      for (const inner of readdirSync(join(cache, dir))) {
        const c = join(cache, dir, inner, 'chrome-headless-shell');
        if (existsSync(c)) return c;
      }
    }
  } catch {
    /* fall back to playwright default */
  }
  return undefined;
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outDir = outIdx >= 0 ? process.argv[outIdx + 1] : null;
  if (!outDir) {
    console.error('usage: capture-reference-renders --out <dir>');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const { chromium } = req('playwright-core');
  const executablePath = resolveChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--single-process', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    for (const template of FORM_TEMPLATES) {
      const model = buildRenderModel(template, valuesFor(template), {
        sensitivePermitted: true,
      });
      const html = modelToHtml(model, CLEAN_A4_LAYOUT, FONT_CSS);
      await page.setContent(html, { waitUntil: 'load' });
      // Same rule as the PDF path: the embedded font must be resolved, or
      // the screenshot captures the fallback face's layout.
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ fullPage: true });
      writeFileSync(join(outDir, `${template.code}.png`), png);
      writeFileSync(
        join(outDir, `${template.code}.json`),
        JSON.stringify(
          {
            formCode: template.code,
            templateVersion: template.templateVersion,
            layout: { id: CLEAN_A4_LAYOUT.id, version: CLEAN_A4_LAYOUT.version },
            fixture: `${FIXTURE.defendantName} · ${FIXTURE.urn} (frozen, e2e/FIXTURES.md)`,
            font: 'MGS Render Serif = DejaVu Serif Book/Bold, EMBEDDED via libs/shared/assets/fonts (deviation 12 resolution: PR #194 CI drifted 1-4% on every baseline because `serif` resolved to a different system face on ubuntu-latest; renders are now font-self-contained)',
            capturedOn: capturedOn(),
            selfReferentOnly: SELF_REFERENT_ONLY.includes(template.code),
            claim: SELF_REFERENT_ONLY.includes(template.code)
              ? 'self-referent drift gate only — no genuine specimen exists for this form; no fidelity claim'
              : 'structural drift gate against our own signed-off output — fidelity to an official template remains OPEN (DoD 1, LER-1170)',
          },
          null,
          2,
        ) + '\n',
      );
      console.log(`captured ${template.code} (template v${template.templateVersion})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('capture failed:', err);
  process.exit(1);
});

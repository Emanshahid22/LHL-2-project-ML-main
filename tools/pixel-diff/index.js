#!/usr/bin/env node
/**
 * pixel-diff — compare rendered reference images page by page (LER-1017).
 *
 * "Looks the same" as an objective pass/fail: images are decoded and diffed
 * pixel-wise INSIDE the same pinned Chromium the renderer uses (a canvas
 * getImageData diff) — the browser is the imaging library, so no new native
 * imaging dependency enters the tree. A mismatch fails with the image name,
 * the differing-pixel count, and a written diff image (magenta where pixels
 * differ) beside the candidate.
 *
 *   node tools/pixel-diff --baseline <dir> --candidate <dir> [--json] [--quiet]
 *   node tools/pixel-diff --self-test
 *
 * Exit 1 on drift, missing/extra images, or self-test failure.
 *
 * Like-for-like only (deviation 12, final resolution): the committed
 * baselines are captured on ubuntu-latest by the "Capture reference renders"
 * workflow, so only CI's render-regression step compares images from the
 * same rasterization environment. A LOCAL `npm run render-regression` diffs
 * a VPS-rasterized candidate against runner-rasterized baselines — expect
 * 1-4% antialiasing drift and treat the result as ADVISORY; CI is the gate.
 */
const { readdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

/**
 * Per-channel tolerance before two pixels count as different. Chromium's
 * text anti-aliasing varies by a few units between runs and machines; 16 of
 * 255 absorbs that without absorbing a colour change (the amber band going
 * red would differ by >100 in at least one channel). It WILL be argued
 * about; that is what this comment is for.
 */
const ANTIALIAS_TOLERANCE = 16;
/**
 * Fraction of pixels allowed to differ beyond the tolerance. Sub-pixel
 * shifts of glyph edges survive; a moved box or changed wording does not.
 */
const MAX_DIFF_PIXEL_RATIO = 0.001;

function args() {
  const a = process.argv.slice(2);
  const get = (flag) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    baseline: get('--baseline'),
    candidate: get('--candidate'),
    json: a.includes('--json'),
    quiet: a.includes('--quiet'),
    selfTest: a.includes('--self-test'),
  };
}

function resolveChromium() {
  const { existsSync: ex, readdirSync: rd } = require('node:fs');
  const { homedir } = require('node:os');
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), '.cache', 'ms-playwright');
  try {
    for (const dir of rd(cache).sort().reverse()) {
      if (!dir.startsWith('chromium_headless_shell-')) continue;
      for (const inner of rd(join(cache, dir))) {
        const c = join(cache, dir, inner, 'chrome-headless-shell');
        if (ex(c)) return c;
      }
    }
  } catch {
    /* fall back to playwright default */
  }
  return undefined;
}

/** In-browser diff: decode both PNGs, compare, return stats + diff PNG. */
async function diffImages(page, aBuf, bBuf) {
  return page.evaluate(
    async ({ a, b, tolerance }) => {
      const load = (data) =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = 'data:image/png;base64,' + data;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { sizeMismatch: true, aSize: [ia.width, ia.height], bSize: [ib.width, ib.height] };
      }
      const w = ia.width;
      const h = ia.height;
      const canvas = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx;
      };
      const da = canvas(ia).getImageData(0, 0, w, h).data;
      const db = canvas(ib).getImageData(0, 0, w, h).data;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const octx = out.getContext('2d');
      octx.drawImage(ib, 0, 0);
      octx.fillStyle = 'magenta';
      let differing = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d =
          Math.max(
            Math.abs(da[i] - db[i]),
            Math.abs(da[i + 1] - db[i + 1]),
            Math.abs(da[i + 2] - db[i + 2]),
          );
        if (d > tolerance) {
          differing++;
          const p = i / 4;
          octx.fillRect(p % w, Math.floor(p / w), 1, 1);
        }
      }
      return {
        sizeMismatch: false,
        differing,
        total: (da.length / 4),
        diffPng: differing > 0 ? out.toDataURL('image/png').split(',')[1] : null,
      };
    },
    { a: aBuf.toString('base64'), b: bBuf.toString('base64'), tolerance: ANTIALIAS_TOLERANCE },
  );
}

async function withBrowser(fn) {
  const { createRequire } = require('node:module');
  const req = createRequire(join(__dirname, '..', '..', 'package.json'));
  const { chromium } = req('playwright-core');
  const executablePath = resolveChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--single-process', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function compareDirs(page, baselineDir, candidateDir, quiet) {
  const failures = [];
  const baselines = readdirSync(baselineDir).filter((f) => f.endsWith('.png')).sort();
  const candidates = readdirSync(candidateDir).filter((f) => f.endsWith('.png')).sort();
  for (const missing of baselines.filter((f) => !candidates.includes(f))) {
    failures.push({ image: missing, reason: 'missing-candidate' });
  }
  for (const extra of candidates.filter((f) => !baselines.includes(f))) {
    failures.push({ image: extra, reason: 'no-baseline' });
  }
  for (const name of baselines.filter((f) => candidates.includes(f))) {
    const result = await diffImages(
      page,
      readFileSync(join(baselineDir, name)),
      readFileSync(join(candidateDir, name)),
    );
    if (result.sizeMismatch) {
      // A page-count/geometry difference fails before any pixels are diffed.
      failures.push({ image: name, reason: 'size-mismatch', baseline: result.aSize, candidate: result.bSize });
      continue;
    }
    const ratio = result.differing / result.total;
    if (ratio > MAX_DIFF_PIXEL_RATIO) {
      const diffPath = join(candidateDir, name.replace(/\.png$/, '.diff.png'));
      if (result.diffPng) writeFileSync(diffPath, Buffer.from(result.diffPng, 'base64'));
      failures.push({ image: name, reason: 'pixel-drift', differing: result.differing, total: result.total, ratio, diff: diffPath });
    } else if (!quiet) {
      console.log(`ok ${name} (${result.differing} px within tolerance)`);
    }
  }
  return { compared: baselines.length, failures };
}

/** Self-tests: identical inputs pass; a doctored image fails. */
async function selfTest(page) {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-diff-'));
  const a = join(dir, 'a');
  const b = join(dir, 'b');
  const c = join(dir, 'c');
  for (const d of [a, b, c]) require('node:fs').mkdirSync(d);
  await page.setContent('<div style="width:200px;height:100px;background:#fff"><b style="font-family:serif">MG baseline</b></div>');
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 100 } });
  writeFileSync(join(a, 'page.png'), shot);
  writeFileSync(join(b, 'page.png'), shot);
  await page.setContent('<div style="width:200px;height:100px;background:#fff"><b style="font-family:serif">MG doctored!!</b></div>');
  writeFileSync(join(c, 'page.png'), await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 100 } }));

  const same = await compareDirs(page, a, b, true);
  const drift = await compareDirs(page, a, c, true);
  rmSync(dir, { recursive: true, force: true });
  if (same.failures.length !== 0) throw new Error('self-test: identical inputs reported drift');
  if (drift.failures.length !== 1 || drift.failures[0].reason !== 'pixel-drift') {
    throw new Error('self-test: doctored input was not caught');
  }
  return 2;
}

async function main() {
  const opts = args();
  await withBrowser(async (page) => {
    const selfTests = await selfTest(page);
    if (opts.selfTest) {
      console.log(`pixel-diff: ${selfTests} self-tests passed`);
      return;
    }
    if (!opts.baseline || !opts.candidate || !existsSync(opts.baseline) || !existsSync(opts.candidate)) {
      console.error('usage: pixel-diff --baseline <dir> --candidate <dir> [--json] [--quiet]');
      process.exit(1);
    }
    const result = await compareDirs(page, opts.baseline, opts.candidate, opts.quiet || opts.json);
    if (opts.json) {
      console.log(JSON.stringify({ selfTests, ...result }, null, 2));
    } else {
      for (const f of result.failures) console.error(`DRIFT [${f.reason}] ${f.image}${f.differing !== undefined ? ` (${f.differing}/${f.total} px)` : ''}`);
      console.log(`pixel-diff: ${selfTests} self-tests passed; ${result.compared} baselines compared; ${result.failures.length} failure(s)`);
    }
    process.exit(result.failures.length === 0 ? 0 : 1);
  });
}

main().catch((err) => {
  console.error('pixel-diff failed to run:', err);
  process.exit(1);
});

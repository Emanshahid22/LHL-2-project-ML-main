#!/usr/bin/env node
/**
 * pii-scan — prove no defendant personal data appears in document file names
 * or storage paths (UC-09 DoD 3 / Global DoD #11), and that stored document
 * bytes are ciphertext (UC-09 DoD 2's repeatable half).
 *
 * What it scans:
 *   1. Every GeneratedDocument.storageKey in the database, plus the
 *      download-filename each row would produce (derived exactly like the
 *      API derives it — filenames are never stored, LER-1167).
 *   2. Every file under the document store on disk (name AND magic bytes:
 *      a stored document must not start with %PDF or PK — plaintext at rest
 *      is a finding even if the name is clean).
 *
 * What it scans FOR, drawn live from the same database:
 *   - defendant name tokens, defendant address tokens, defendant DOB in
 *     three renderings (ISO, DDMMYYYY, YYYYMMDD), case URNs;
 *   - user names and email local-parts;
 *   - a structural rule: every storage key must match the opaque shape
 *     documents/<caseId|standalone>/<sha256>.<pdf|docx>.enc — a key that is
 *     merely "clean" but the wrong shape still fails, because the shape is
 *     what makes cleanliness a construction rather than luck.
 *
 * Self-tests run first (like template-conformance): planted violations must
 * be caught or the scan refuses to certify anything.
 *
 *   node tools/pii-scan            # report
 *   node tools/pii-scan --json     # machine-readable
 * Exit 1 on any finding or self-test failure.
 */
const { PrismaClient } = require('@prisma/client');
const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const KEY_SHAPE = /^documents\/[a-z0-9]+\/[a-f0-9]{64}\.(pdf|docx)\.enc$/;
const STORE_DIR =
  process.env.DOCUMENT_STORE_DIR || resolve(__dirname, '..', '..', 'apps', 'api', 'document-store');

/** Tokens shorter than this are too common to scan for (e.g. "Le", "of"). */
const MIN_TOKEN = 3;

function tokensOf(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN && !/^\d+$/.test(t));
}

function dobRenderings(date) {
  if (!date) return [];
  const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const [y, m, d] = iso.split('-');
  return [iso, `${d}${m}${y}`, `${y}${m}${d}`, `${d}-${m}-${y}`, `${d}/${m}/${y}`];
}

async function personalPatterns(prisma) {
  const cases = await prisma.case.findMany({
    select: { urn: true, defendantName: true, defendantAddress: true, defendantDob: true },
  });
  const users = await prisma.user.findMany({ select: { name: true, email: true } });
  const tokens = new Set();
  const exact = new Set();
  for (const c of cases) {
    for (const t of tokensOf(c.defendantName)) tokens.add(t);
    for (const t of tokensOf(c.defendantAddress)) tokens.add(t);
    for (const r of dobRenderings(c.defendantDob)) exact.add(r.toLowerCase());
    if (c.urn) exact.add(c.urn.toLowerCase());
  }
  for (const u of users) {
    for (const t of tokensOf(u.name)) tokens.add(t);
    const local = (u.email || '').split('@')[0];
    for (const t of tokensOf(local)) tokens.add(t);
  }
  return { tokens: [...tokens], exact: [...exact] };
}

function scanText(subject, kind, patterns, findings) {
  const lower = subject.toLowerCase();
  for (const t of patterns.tokens) {
    // Token match on word-ish boundaries so a hex hash containing "ash"
    // by coincidence does not fire — hashes are matched only when the token
    // stands alone between non-alphanumerics.
    if (new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`, 'i').test(lower)) {
      findings.push({ kind, subject, matched: t, rule: 'personal-token' });
    }
  }
  for (const e of patterns.exact) {
    if (lower.includes(e)) findings.push({ kind, subject, matched: e, rule: 'exact-value' });
  }
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function downloadFilenameFor(row, versionNumber) {
  // Mirrors DocumentsService.openDocument — the ONLY other place this
  // template exists. Keep in sync. UC-10: an archived version's download
  // carries its number; the scan covers the filename each row would
  // ACTUALLY produce.
  const date = row.createdAt.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = versionNumber ? `-v${versionNumber}` : '';
  return `${row.formCode}-draft-${date}${suffix}.${row.kind === 'pdf' ? 'pdf' : 'docx'}`;
}

function selfTest() {
  const patterns = {
    tokens: ['kowalczyk', 'nadia'],
    exact: ['07st0990011/26', '2001-03-04'],
  };
  const cases = [
    ['documents/standalone/nadia-kowalczyk-statement.pdf.enc', true],
    ['MG11-kowalczyk-20260825.pdf', true],
    ['documents/abc123/deadbeef.pdf.enc', false],
    ['documents/case1/07st0990011/26.pdf.enc', true],
    ['MG11-draft-20010304.docx', false], // date-shaped but not an exact DOB rendering
  ];
  for (const [subject, shouldFire] of cases) {
    const findings = [];
    scanText(subject, 'self-test', patterns, findings);
    if (shouldFire !== findings.length > 0) {
      console.error(`pii-scan SELF-TEST FAILED on "${subject}" (expected ${shouldFire ? 'a finding' : 'clean'})`);
      process.exit(1);
    }
  }
  // Shape rule self-test.
  if (KEY_SHAPE.test('documents/case1/readable-name.pdf.enc') || !KEY_SHAPE.test(`documents/standalone/${'a'.repeat(64)}.pdf.enc`)) {
    console.error('pii-scan SELF-TEST FAILED on the key-shape rule');
    process.exit(1);
  }
  // Magic-bytes self-test.
  if (!looksPlaintext(Buffer.from('%PDF-1.7 x')) || !looksPlaintext(Buffer.from('PK')) || looksPlaintext(Buffer.from([0x8f, 0x11, 0x02]))) {
    console.error('pii-scan SELF-TEST FAILED on the magic-bytes rule');
    process.exit(1);
  }
  return cases.length + 2;
}

function looksPlaintext(buf) {
  return buf.slice(0, 4).toString('latin1').startsWith('%PDF') || buf.slice(0, 2).toString('latin1') === 'PK';
}

async function main() {
  const json = process.argv.includes('--json');
  const selfTests = selfTest();
  const prisma = new PrismaClient();
  const findings = [];
  try {
    const patterns = await personalPatterns(prisma);
    const rows = await prisma.generatedDocument.findMany({
      select: { id: true, storageKey: true, formCode: true, kind: true, createdAt: true, cipher: true, iv: true, authTag: true },
    });
    // UC-10: version numbers feed the download filename — resolve each
    // row's version (if archived) so the scanned template is the real one.
    const versions = await prisma.archivedVersion.findMany({
      select: { documentId: true, docxDocumentId: true, versionNumber: true, label: true, lineageId: true },
    });
    const versionByDoc = new Map();
    for (const v of versions) {
      versionByDoc.set(v.documentId, v.versionNumber);
      if (v.docxDocumentId) versionByDoc.set(v.docxDocumentId, v.versionNumber);
      // UC-10 archive surfaces: labels and lineage ids reach the client —
      // scan them like every other name-shaped output.
      scanText(v.label, 'version-label', patterns, findings);
      scanText(v.lineageId, 'lineage-id', patterns, findings);
    }
    for (const row of rows) {
      if (!KEY_SHAPE.test(row.storageKey)) {
        findings.push({ kind: 'storage-key', subject: row.storageKey, rule: 'opaque-shape' });
      }
      scanText(row.storageKey, 'storage-key', patterns, findings);
      scanText(downloadFilenameFor(row, versionByDoc.get(row.id)), 'download-filename', patterns, findings);
      if (row.cipher !== 'aes-256-gcm' || !row.iv || !row.authTag) {
        findings.push({ kind: 'db-row', subject: row.storageKey, rule: 'cipher-metadata-missing' });
      }
    }
    for (const file of walk(STORE_DIR)) {
      const rel = file.slice(STORE_DIR.length + 1);
      scanText(rel, 'stored-file-name', patterns, findings);
      const head = readFileSync(file).slice(0, 8);
      if (looksPlaintext(head)) {
        findings.push({ kind: 'stored-file-bytes', subject: rel, rule: 'plaintext-at-rest' });
      }
    }
    const summary = {
      selfTests,
      documents: rows.length,
      filesOnDisk: walk(STORE_DIR).length,
      patternTokens: patterns.tokens.length,
      findings,
    };
    if (json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`pii-scan: ${selfTests} self-tests passed`);
      console.log(`scanned ${summary.documents} document rows, ${summary.filesOnDisk} stored files, against ${summary.patternTokens} personal tokens`);
      for (const f of findings) console.error(`FINDING [${f.rule}] ${f.kind}: ${f.subject}${f.matched ? ` (matched: ${f.matched})` : ''}`);
      console.log(findings.length === 0 ? 'clean — no personal data in names, paths or filenames; all bytes ciphertext' : `${findings.length} finding(s)`);
    }
    process.exit(findings.length === 0 ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('pii-scan failed to run:', err);
  process.exit(1);
});

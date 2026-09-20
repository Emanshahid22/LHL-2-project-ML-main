#!/usr/bin/env node
/**
 * orphan-scan — find draft values stored under field ids their template no
 * longer has.
 *
 * Why this exists: FormDraft.valuesJson is keyed by field id, and the renderer
 * only reads ids the template declares. So renaming or removing a field id does
 * not error — it silently strands whatever the user had typed, and the next
 * autosave (1.5s after a keystroke) can write the pruned object back. Before any
 * template rewrite that changes ids — MG2 and MG14 are both queued for exactly
 * that — run this and see what would be stranded.
 *
 *   node tools/orphan-scan            # report
 *   node tools/orphan-scan --json     # machine-readable
 *   node tools/orphan-scan --quiet    # exit code only
 *
 * Exit code 1 if any true orphan is found, so it can gate a migration step.
 */
const { PrismaClient } = require('@prisma/client');
const {
  getFormTemplate,
  FORM_TEMPLATES,
  MG11_VULNERABLE_FLAG_KEY,
  SENSITIVE_MATERIAL_FLAG_KEY,
  GROUP_ROW_ID_KEY,
} = require('../../libs/shared/dist/index.js');

/**
 * Keys deliberately stored in valuesJson that are NOT template fields. These are
 * by design, not drift, and must not be reported as orphans.
 */
const DERIVED_KEYS = new Set([
  // UC-03: persisted so PDF output does not have to re-derive vulnerability.
  MG11_VULNERABLE_FLAG_KEY,
  // UC-04: derived from the schedule's per-row classification, and the contract
  // UC-07 will read. Recomputed on save, so it is never drift.
  SENSITIVE_MATERIAL_FLAG_KEY,
]);

/** A value the user never actually filled in is not worth reporting. */
function isEmpty(value) {
  return value === '' || value === null || value === undefined || value === false;
}

function truncate(value, max = 60) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function main() {
  const json = process.argv.includes('--json');
  const quiet = process.argv.includes('--quiet');
  const prisma = new PrismaClient();

  const drafts = await prisma.formDraft.findMany({
    select: {
      id: true,
      formCode: true,
      templateVersion: true,
      valuesJson: true,
      updatedAt: true,
      userId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const currentVersion = new Map(FORM_TEMPLATES.map((t) => [t.code, t.templateVersion]));
  const orphaned = [];
  const derived = [];
  const behindVersion = [];
  const unknownForm = [];

  for (const draft of drafts) {
    const template = getFormTemplate(draft.formCode);
    if (!template) {
      unknownForm.push({ draftId: draft.id, formCode: draft.formCode });
      continue;
    }

    const fieldIds = new Set(template.fields.map((f) => f.id));
    let values;
    try {
      values = JSON.parse(draft.valuesJson || '{}');
    } catch {
      unknownForm.push({ draftId: draft.id, formCode: draft.formCode, reason: 'unparseable values' });
      continue;
    }

    const strayKeys = Object.keys(values).filter((k) => !fieldIds.has(k) && !isEmpty(values[k]));

    // Rows inside a repeating group are keyed by column id, so renaming a column
    // strands data exactly as renaming a field does — one level deeper, where a
    // top-level key comparison cannot see it.
    for (const field of template.fields) {
      if (field.type !== 'group') continue;
      const allowed = new Set([GROUP_ROW_ID_KEY, ...(field.columns ?? []).map((c) => c.id)]);
      const rows = Array.isArray(values[field.id]) ? values[field.id] : [];
      rows.forEach((row, index) => {
        if (typeof row !== 'object' || row === null) return;
        for (const key of Object.keys(row)) {
          if (!allowed.has(key) && !isEmpty(row[key])) {
            strayKeys.push(`${field.id}[${index}].${key}`);
            values[`${field.id}[${index}].${key}`] = row[key];
          }
        }
      });
    }
    const trueOrphans = strayKeys.filter((k) => !DERIVED_KEYS.has(k));
    const derivedKeys = strayKeys.filter((k) => DERIVED_KEYS.has(k));

    if (trueOrphans.length) {
      orphaned.push({
        draftId: draft.id,
        formCode: draft.formCode,
        draftVersion: draft.templateVersion,
        currentVersion: currentVersion.get(draft.formCode),
        updatedAt: draft.updatedAt.toISOString(),
        orphans: trueOrphans.map((k) => ({ id: k, value: truncate(values[k]) })),
      });
    }
    if (derivedKeys.length) derived.push({ draftId: draft.id, keys: derivedKeys });

    const current = currentVersion.get(draft.formCode);
    if (current !== undefined && draft.templateVersion < current) {
      behindVersion.push({
        draftId: draft.id,
        formCode: draft.formCode,
        draftVersion: draft.templateVersion,
        currentVersion: current,
      });
    }
  }

  await prisma.$disconnect();

  const report = {
    scanned: drafts.length,
    orphanedDrafts: orphaned.length,
    orphaned,
    derivedKeysSeen: derived,
    draftsBehindTemplateVersion: behindVersion,
    unknownForm,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!quiet) {
    console.log(`orphan-scan — ${drafts.length} draft(s) scanned\n`);

    if (orphaned.length === 0) {
      console.log('No orphaned values. No draft holds data under an id its template has dropped.');
    } else {
      console.log(`ORPHANED VALUES in ${orphaned.length} draft(s) — these would be stranded:\n`);
      for (const d of orphaned) {
        console.log(`  ${d.formCode}  draft ${d.draftId}  (draft v${d.draftVersion}, template v${d.currentVersion})`);
        for (const o of d.orphans) console.log(`      ${o.id} = ${o.value}`);
      }
    }

    if (derived.length) {
      console.log(
        `\n${derived.length} draft(s) carry deliberate derived keys (not orphans): ` +
          `${[...new Set(derived.flatMap((d) => d.keys))].join(', ')}`,
      );
    }

    if (behindVersion.length) {
      // Not a fault, but worth stating: templateVersion is recorded and not honoured,
      // so these render against the current field set rather than their own.
      console.log(
        `\n${behindVersion.length} draft(s) predate their template's current version and render ` +
          'against the newer field set:',
      );
      const byForm = {};
      for (const b of behindVersion) {
        const key = `${b.formCode} v${b.draftVersion} -> v${b.currentVersion}`;
        byForm[key] = (byForm[key] || 0) + 1;
      }
      for (const [k, n] of Object.entries(byForm)) console.log(`      ${k}  (${n})`);
    }

    if (unknownForm.length) {
      console.log(`\n${unknownForm.length} draft(s) reference an unknown form or unparseable values.`);
    }
  }

  process.exit(orphaned.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('orphan-scan failed:', err.message);
  process.exit(2);
});

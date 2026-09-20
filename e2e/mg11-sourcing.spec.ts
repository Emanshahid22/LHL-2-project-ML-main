import { expect, test } from './support/fixtures';

/**
 * MG11 per-field sourcing against the genuine 2013 specimen
 * (bbpolice.uk/uploads/MG11.pdf) — see docs/mg-form-research-findings.md § MG11.
 * Metadata only: the sourcing pass must never change the field set.
 */

/** Every id that existed before the sourcing pass. Renaming any of them
 *  destroys a live draft's stored value on its next autosave. */
const ORIGINAL_IDS = [
  'title',
  'witnessName',
  'witnessDob',
  'witnessOccupation',
  'witnessAddress',
  'witnessPhone',
  'statementDate',
  'statementText',
  'exhibitsReferenced',
  'declarationConfirmed',
  'signatureName',
  'statementTakenBy',
  'witnessConsentsCourt',
  'specialMeasures',
  'specialMeasuresApplied',
];

test.describe('MG11 sourcing', () => {
  test('the template is assessed: provisionally verified (D-F), every field carries provenance, documented fields cite the 2013 specimen', async ({
    request,
  }) => {
    const mg11 = await (await request.get('/api/form-templates/MG11')).json();

    expect(mg11.templateVersion).toBeGreaterThanOrEqual(6);
    // D-F (provisional): MG11 is specimen-matched (front + declaration) and
    // flagged 'verified'; the rear-section caveat is on record in
    // docs/decisions/layout-verification-record.md.
    expect(mg11.verification).toBe('verified');
    expect(mg11.fields.length).toBe(ORIGINAL_IDS.length);

    for (const field of mg11.fields) {
      expect(['documented', 'likely', 'inference'], `${field.id} provenance`).toContain(
        field.provenance,
      );
    }

    // The honest split is pinned exactly: the specimen has no Title box and no
    // exhibits box, and never asks which measures were APPLIED — those three
    // must not quietly acquire a claim they cannot cite.
    const byProvenance = (p: string) =>
      mg11.fields
        .filter((f: { provenance?: string }) => f.provenance === p)
        .map((f: { id: string }) => f.id)
        .sort();
    expect(byProvenance('inference')).toEqual(['exhibitsReferenced', 'title']);
    expect(byProvenance('likely')).toEqual(['specialMeasuresApplied']);

    // Every documented field cites the specimen, not a vibe.
    for (const field of mg11.fields.filter(
      (f: { provenance?: string }) => f.provenance === 'documented',
    )) {
      expect(field.source, `${field.id} must cite its printed box`).toContain(
        'bbpolice.uk/uploads/MG11.pdf',
      );
      expect(field.source).toContain('2013');
    }
  });

  test('the sourcing pass changed metadata only — every original field id survives', async ({
    request,
  }) => {
    const mg11 = await (await request.get('/api/form-templates/MG11')).json();
    const ids = mg11.fields.map((f: { id: string }) => f.id);
    for (const id of ORIGINAL_IDS) {
      expect(ids, `original id ${id} must not be renamed or removed`).toContain(id);
    }
  });
});

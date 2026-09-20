import { expect, test } from './support/fixtures';
import { auditEventsFor, caseFor, createDraft, getDraft, saveValues } from './support/api';

/**
 * The gate that keeps the gate honest. On 24 Aug 2026 the "fresh throwaway DB"
 * verification leg silently tested the wrong database: an orphaned dev server
 * from five days earlier still held :3000, `reuseExistingServer: true` reused
 * it (pointed at dev.db), while db:setup and the suite's direct-SQLite helper
 * honoured the run's DATABASE_URL. Browser checks passed; every direct-DB
 * assertion failed with "missing" rows that were sitting in the other file.
 * A convention that can be silently violated is not a gate — so this spec
 * asserts the invariant outright: what the API under test WRITES, this run's
 * database READS. It fails loudly, whatever the configuration, if the two
 * point at different files. Full write-up: HANDOVER §5.
 */
test.describe('database guard', () => {
  test('the API under test writes to the database this run reads', async ({ request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG4', foster.id);
    const fresh = await getDraft(request, draft.id);
    // A save is the cheapest API write that must land in the audit trail.
    await saveValues(request, draft.id, { chargingOfficer: 'DB GUARD PROBE' }, fresh.version);

    const events = await auditEventsFor(draft.id);
    expect(
      events.length,
      [
        'The API under test and this run are using DIFFERENT databases:',
        'an API-created save left no trace where this run reads.',
        'Almost always an orphaned dev server — reuseExistingServer: true will',
        'reuse anything already on :3000, whatever DATABASE_URL it was born with.',
        'Kill it (`ss -ltnp | grep -E ":3000|:4200"` — the nest child can outlive',
        'its wrappers) and re-run. HANDOVER §5 has the 24 Aug incident.',
      ].join(' '),
    ).toBeGreaterThan(0);
  });
});

/**
 * Seeds the demo user, a colleague, and the fictional cases.
 *
 * The first five are the ORIGINAL cases; "R v Whitfield" belongs only to the
 * colleague, so it must never appear in the demo user's case picker, and
 * Marcus Bellamy's case carries TWO offences with different dates, which
 * auto-population (UC-02) must treat as ambiguous.
 *
 * The last four are DEDICATED SUITE FIXTURES (LER-1269): any e2e suite that
 * WRITES case-divergent data (an edited defendant name, a deliberately bad
 * URN) does it on its own case, because UC-08's cross-form Check 3 is
 * case-wide and correctly flags such writes as blocking on every later review
 * of that case. Ownership and the rules live in e2e/FIXTURES.md; the original
 * five stay pristine for read-only suites. All data is synthetic.
 */
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { ROLE_CAPABILITIES } = require('../../../libs/shared/dist/index.js');

/**
 * Release-01: dev/e2e credential for every seeded user. DEV-ONLY — this is
 * seed data for local and CI databases, not a production secret; staging
 * and production users are provisioned by an Administrator (ruling #5/#6)
 * and never carry this value.
 */
const DEV_PASSWORD = 'mgs-dev-password-2026!';


const prisma = new PrismaClient();

async function main() {
  // UC-07: the demo user holds the Sensitive Material Access permission; the
  // colleague deliberately does not, so the locked flow is demonstrable and
  // testable (switch actors with the x-user-email header). The update clauses
  // set it too, so an existing dev database picks the grant up on re-seed.
  const demo = await prisma.user.upsert({
    where: { email: 'demo.solicitor@example.co.uk' },
    update: { sensitiveMaterialAccess: true },
    create: {
      email: 'demo.solicitor@example.co.uk',
      name: 'Alex Marlowe',
      sensitiveMaterialAccess: true,
    },
  });

  const colleague = await prisma.user.upsert({
    where: { email: 'second.solicitor@example.co.uk' },
    update: { sensitiveMaterialAccess: false },
    create: {
      email: 'second.solicitor@example.co.uk',
      name: 'Priya Chandran',
      sensitiveMaterialAccess: false,
    },
  });

  const cases = [
    {
      urn: '01AB0456321/26',
      defendantName: 'Daniel Foster',
      offenceSummary: 'Theft from a shop (s.1 Theft Act 1968)',
      courtName: "Westminster Magistrates' Court",
      nextHearingAt: new Date('2026-09-03T10:00:00Z'),
      cpsReference: '01AB4563221/26/CPS',
      officerInCase: 'PC 4571 Amara Hughes, Metropolitan Police',
      defendantAddress: '22 Brackley Road, Catford, London SE6 4PT',
      defendantDob: new Date('1994-03-22T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-07-14T00:00:00Z'),
          chargeWording:
            'Theft from a shop, contrary to section 1 of the Theft Act 1968',
        },
      ],
      users: [demo.id],
    },
    {
      urn: '01CD0789654/26',
      defendantName: 'Marcus Bellamy',
      offenceSummary: 'Assault occasioning ABH (s.47 OAPA 1861)',
      courtName: 'Inner London Crown Court',
      nextHearingAt: new Date('2026-09-17T09:30:00Z'),
      cpsReference: '01CD7896541/26/CPS',
      officerInCase: 'DC 2984 Owen Llewellyn, Metropolitan Police',
      defendantAddress: 'Flat 3, 91 Camberwell New Road, London SE5 0RS',
      defendantDob: new Date('1988-11-05T00:00:00Z'),
      // Two offences on different dates — auto-fill must flag as ambiguous.
      offences: [
        {
          offenceDate: new Date('2026-06-02T00:00:00Z'),
          chargeWording:
            'Assault occasioning actual bodily harm, contrary to section 47 of the Offences Against the Person Act 1861',
        },
        {
          offenceDate: new Date('2026-06-09T00:00:00Z'),
          chargeWording:
            'Assault occasioning actual bodily harm, contrary to section 47 of the Offences Against the Person Act 1861 (second incident)',
        },
      ],
      users: [demo.id, colleague.id],
    },
    {
      urn: '02EF0234987/26',
      defendantName: 'Sofia Renard',
      offenceSummary: 'Fraud by false representation (s.2 Fraud Act 2006)',
      courtName: "Croydon Magistrates' Court",
      nextHearingAt: new Date('2026-10-01T14:00:00Z'),
      cpsReference: '02EF2349871/26/CPS',
      officerInCase: 'DC 1108 Sarah Whitmore, Metropolitan Police',
      defendantAddress: '8 Lansdowne Gardens, Croydon CR0 5BE',
      defendantDob: new Date('1991-07-18T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-04-30T00:00:00Z'),
          chargeWording:
            'Fraud by false representation, contrary to sections 1 and 2 of the Fraud Act 2006',
        },
      ],
      users: [demo.id],
    },
    {
      urn: '02GH0567123/25',
      defendantName: 'Liam Okafor',
      offenceSummary: 'Possession with intent to supply (s.5(3) MDA 1971)',
      courtName: 'Kingston Crown Court',
      nextHearingAt: null,
      cpsReference: null, // no CPS reference yet — auto-fill reports no_data
      officerInCase: 'PC 3355 James Farley, Metropolitan Police',
      defendantAddress: '14 Elgar House, Norbiton, Kingston KT1 3AY',
      defendantDob: new Date('1999-01-30T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2025-12-11T00:00:00Z'),
          chargeWording:
            'Possession of a controlled drug of Class A with intent to supply, contrary to section 5(3) of the Misuse of Drugs Act 1971',
        },
      ],
      users: [demo.id],
    },
    {
      urn: '03JK0890456/26',
      defendantName: 'Edward Whitfield',
      offenceSummary: 'Dangerous driving (s.2 RTA 1988)',
      courtName: "Bromley Magistrates' Court",
      nextHearingAt: new Date('2026-09-22T10:30:00Z'),
      cpsReference: '03JK8904561/26/CPS',
      officerInCase: 'PC 5522 Tom Barratt, Metropolitan Police',
      defendantAddress: '3 Orchard Way, Bromley BR2 8DN',
      defendantDob: new Date('1976-09-02T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-05-17T00:00:00Z'),
          chargeWording: 'Dangerous driving, contrary to section 2 of the Road Traffic Act 1988',
        },
      ],
      users: [colleague.id], // NOT accessible to the demo user
    },
  ];

  // ── Dedicated suite fixtures (LER-1269) — see e2e/FIXTURES.md ──────────────
  cases.push(
    {
      // UC-02's manual-edit and failed-autofill tests write an edited
      // defendant name here. Nobody else may touch this case.
      urn: '04LM0112233/26',
      defendantName: 'Theo Marchetti',
      offenceSummary: 'Burglary (s.9 Theft Act 1968)',
      courtName: "Camberwell Green Magistrates' Court",
      nextHearingAt: new Date('2026-10-08T10:00:00Z'),
      cpsReference: '04LM1122331/26/CPS',
      officerInCase: 'PC 6120 Rhea Sandhu, Metropolitan Police',
      defendantAddress: '19 Delft Way, Peckham, London SE15 6QN',
      defendantDob: new Date('1993-06-11T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-07-02T00:00:00Z'),
          chargeWording: 'Burglary, contrary to section 9 of the Theft Act 1968',
        },
      ],
      users: [demo.id],
    },
    {
      // UC-05's validation tests write deliberately malformed URNs on drafts
      // linked here. Single offence AND a listed hearing, because both the
      // offence-date ordering rule and the after-hearing advisory need it.
      urn: '05NP0445566/26',
      defendantName: 'Isla Fenwick',
      offenceSummary: 'Criminal damage (s.1 Criminal Damage Act 1971)',
      courtName: "Highbury Corner Magistrates' Court",
      nextHearingAt: new Date('2026-09-30T09:30:00Z'),
      cpsReference: '05NP4455661/26/CPS',
      officerInCase: 'PC 2277 Callum Reid, Metropolitan Police',
      defendantAddress: '4 Weaver Court, Islington, London N1 8RJ',
      defendantDob: new Date('1997-02-20T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-05-10T00:00:00Z'),
          chargeWording: 'Destroying property, contrary to section 1(1) of the Criminal Damage Act 1971',
        },
      ],
      users: [demo.id],
    },
    {
      // UC-08's cross-form tests live here — including the deliberate,
      // self-corrected URN divergence and the run-unique exhibit citations.
      urn: '06QR0778899/26',
      defendantName: 'Rowan Ashcroft',
      offenceSummary: 'Handling stolen goods (s.22 Theft Act 1968)',
      courtName: "Thames Magistrates' Court",
      nextHearingAt: new Date('2026-10-15T14:00:00Z'),
      cpsReference: '06QR7788991/26/CPS',
      officerInCase: 'DC 8834 Priya Nair, Metropolitan Police',
      defendantAddress: '77 Corbett Road, Bow, London E3 2DL',
      defendantDob: new Date('1989-12-03T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-06-18T00:00:00Z'),
          chargeWording: 'Handling stolen goods, contrary to section 22 of the Theft Act 1968',
        },
      ],
      users: [demo.id],
    },
    {
      // RESERVED for UC-09 reference renders. Complete data on purpose, and
      // NO suite may write case-divergent values or link throwaway noise here:
      // pixel-diff baselines will be captured against this case.
      urn: '07ST0990011/26',
      defendantName: 'Nadia Kowalczyk',
      offenceSummary: 'Common assault (s.39 Criminal Justice Act 1988)',
      courtName: "Ealing Magistrates' Court",
      nextHearingAt: new Date('2026-11-02T10:30:00Z'),
      cpsReference: '07ST9900111/26/CPS',
      officerInCase: 'PC 4408 Marcus Doyle, Metropolitan Police',
      defendantAddress: '12 Alder Grove, Ealing, London W5 4HT',
      defendantDob: new Date('1991-08-27T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-07-21T00:00:00Z'),
          chargeWording: 'Assault by beating, contrary to section 39 of the Criminal Justice Act 1988',
        },
      ],
      users: [demo.id],
    },
    {
      // RESERVED for UC-10 archive & case attachment. Amendment cycles
      // reopen, finalise and regenerate drafts on this case, and manual
      // case-linking attaches standalone lineages here — see e2e/FIXTURES.md.
      urn: '08AR0110022/26',
      defendantName: 'Callum Whitmore',
      offenceSummary: 'Fraud by false representation (s.2 Fraud Act 2006)',
      courtName: "Camberwell Green Magistrates' Court",
      nextHearingAt: new Date('2026-11-20T10:00:00Z'),
      cpsReference: '08AR0110226/26/CPS',
      officerInCase: 'DS 3319 Erin Fallon, Metropolitan Police',
      defendantAddress: '9 Latchmere Road, Battersea, London SW11 2DR',
      defendantDob: new Date('1993-04-11T00:00:00Z'),
      offences: [
        {
          offenceDate: new Date('2026-06-30T00:00:00Z'),
          chargeWording: 'Fraud by false representation, contrary to section 2 of the Fraud Act 2006',
        },
      ],
      users: [demo.id],
    },
  );

  for (const c of cases) {
    const { offences, users, ...data } = c;
    const created = await prisma.case.upsert({
      where: { urn: c.urn },
      update: data, // keep existing dev DBs in step with the seed
      create: data,
    });
    await prisma.caseOffence.deleteMany({ where: { caseId: created.id } });
    await prisma.caseOffence.createMany({
      data: offences.map((o) => ({ ...o, caseId: created.id })),
    });
    for (const userId of users) {
      await prisma.caseAccess.upsert({
        where: { userId_caseId: { userId, caseId: created.id } },
        update: {},
        create: { userId, caseId: created.id },
      });
    }
  }


  // ── Release-01 (LER-1013/1014, D-G as amended): roles, assignments,
  // credentials. Role rows are DATA seeded from the shared map; the four
  // names are LER-1014's verbatim contract text. ─────────────────────────
  const roleIds = {};
  for (const [name, caps] of Object.entries(ROLE_CAPABILITIES)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { capabilitiesJson: JSON.stringify(caps) },
      create: { name, capabilitiesJson: JSON.stringify(caps) },
    });
    roleIds[name] = role.id;
  }

  // Fixture users per role (e2e/FIXTURES.md discipline extended to USERS).
  // The two build-era users keep their ids and histories: both map to
  // Senior Solicitor (they exercised finalise across the suites); the
  // sensitive grant stays exactly as UC-07 seeded it.
  const paralegal = await prisma.user.upsert({
    where: { email: 'paralegal.e2e@example.co.uk' },
    update: { sensitiveMaterialAccess: false },
    create: { email: 'paralegal.e2e@example.co.uk', name: 'Tunde Bakare', sensitiveMaterialAccess: false },
  });
  const readonly = await prisma.user.upsert({
    where: { email: 'readonly.e2e@example.co.uk' },
    update: { sensitiveMaterialAccess: false },
    create: { email: 'readonly.e2e@example.co.uk', name: 'Rosa Delgado', sensitiveMaterialAccess: false },
  });
  const admin = await prisma.user.upsert({
    where: { email: 'admin.e2e@example.co.uk' },
    update: { sensitiveMaterialAccess: false },
    create: { email: 'admin.e2e@example.co.uk', name: 'Ashwin Rao', sensitiveMaterialAccess: false },
  });

  const assignments = [
    [demo.id, roleIds['Senior Solicitor']],
    [colleague.id, roleIds['Senior Solicitor']],
    [paralegal.id, roleIds['Paralegal']],
    [readonly.id, roleIds['Read-Only']],
    [admin.id, roleIds['Administrator']],
  ];
  for (const [userId, roleId] of assignments) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }

  // D-I: a deployed environment sets SEED_USER_PASSWORD — every fixture
  // credential is then created with THAT value and mustChange: true, so the
  // first sign-in forces a real choice and the documented dev credential
  // never works there. Unset = dev/e2e behaviour, byte-identical to before.
  // The upsert's empty update keeps both paths idempotent: an existing
  // credential row is never overwritten by a reboot.
  const seedPassword = process.env.SEED_USER_PASSWORD;
  const seedHash = await argon2.hash(seedPassword || DEV_PASSWORD, { type: argon2.argon2id });
  const mustChange = Boolean(seedPassword);
  for (const userId of [demo.id, colleague.id, paralegal.id, readonly.id, admin.id]) {
    await prisma.passwordCredential.upsert({
      where: { userId },
      update: {},
      create: { userId, argon2Hash: seedHash, mustChange },
    });
  }

  console.log('Seeded 5 users (4 roles + credentials, release-01) and 10 cases (9 accessible to the demo user; 5 dedicated suite fixtures — see e2e/FIXTURES.md).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

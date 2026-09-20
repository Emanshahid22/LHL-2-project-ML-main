// These tests run against the BUILT library (../dist/index.js) — see
// sensitive-material.test.mjs for the stale-dist rationale.
/**
 * access-control (release-01, LER-1014 / D-G as amended) — the capability
 * matrix, pinned. Role names/count are the ticket's verbatim four; the
 * capability assignments are the decision-maker's documented interpretation
 * (provisional). D-G4's admin/content separation and ruling #8's
 * grant-stacking restriction are PROPERTIES here, not conventions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  ROLE_NAMES,
  capabilitySetOf,
  grantAssignableTo,
  hasCapability,
} from '../dist/index.js';

test('exactly the ticket-named four roles exist, spelled as LER-1014 spells them', () => {
  assert.deepEqual(ROLE_NAMES, ['Administrator', 'Senior Solicitor', 'Paralegal', 'Read-Only']);
  assert.deepEqual(Object.keys(ROLE_CAPABILITIES).sort(), [...ROLE_NAMES].sort());
});

test('every assigned capability is a declared capability', () => {
  for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
    for (const cap of caps) assert.ok(CAPABILITIES.includes(cap), `${role}: ${cap}`);
  }
});

test('D-G4: Administrator holds admin.users and NOTHING content-bearing', () => {
  assert.deepEqual([...ROLE_CAPABILITIES['Administrator']], ['admin.users']);
});

test('no non-admin role holds admin.users', () => {
  for (const role of ['Senior Solicitor', 'Paralegal', 'Read-Only']) {
    assert.ok(!ROLE_CAPABILITIES[role].includes('admin.users'), role);
  }
});

test('Paralegal prepares but cannot finalise or oversee bypasses (ruling #1)', () => {
  const caps = new Set(ROLE_CAPABILITIES['Paralegal']);
  for (const has of ['forms.read', 'forms.edit', 'documents.generate', 'documents.read', 'archive.read', 'archive.link', 'cases.read']) {
    assert.ok(caps.has(has), `has ${has}`);
  }
  assert.ok(!caps.has('forms.finalise'));
  assert.ok(!caps.has('oversight.bypasses'));
});

test('Senior Solicitor is Paralegal plus finalise plus bypass oversight — a strict superset', () => {
  const senior = new Set(ROLE_CAPABILITIES['Senior Solicitor']);
  for (const cap of ROLE_CAPABILITIES['Paralegal']) assert.ok(senior.has(cap), cap);
  assert.ok(senior.has('forms.finalise'));
  assert.ok(senior.has('oversight.bypasses'));
  assert.equal(senior.size, ROLE_CAPABILITIES['Paralegal'].length + 2);
});

test('Read-Only holds read capabilities only — no create/edit/finalise/generate/link', () => {
  assert.deepEqual([...ROLE_CAPABILITIES['Read-Only']].sort(), ['archive.read', 'cases.read', 'documents.read', 'forms.read']);
});

test('capabilitySetOf unions stored role lists; hasCapability reads the union', () => {
  const set = capabilitySetOf([['forms.read'], ['forms.read', 'admin.users']]);
  assert.equal(set.size, 2);
  assert.ok(hasCapability(set, 'admin.users'));
  assert.ok(!hasCapability(set, 'forms.edit'));
});

test('ruling #8: the sensitive grant stacks on practitioner roles only', () => {
  assert.equal(grantAssignableTo(['Paralegal']), true);
  assert.equal(grantAssignableTo(['Senior Solicitor']), true);
  assert.equal(grantAssignableTo(['Read-Only']), false);
  assert.equal(grantAssignableTo(['Administrator']), false);
  assert.equal(grantAssignableTo(['Administrator', 'Paralegal']), true);
  assert.equal(grantAssignableTo([]), false);
});

/**
 * Release-01 (LER-1014, D-G as amended): the capability model — the ONE
 * shared truth for what each role may do.
 *
 * Role NAMES and COUNT are LER-1014's contract text verbatim
 * ("Administrator, Senior Solicitor, Paralegal and Read-Only"); the
 * capability assignments are the decision-maker's documented interpretation
 * (register: D-G amendment, PROVISIONAL). Roles are DATA at runtime — the
 * database rows are seeded from this map and the client can rename/amend at
 * ratification; this module is the seed source and the unit-tested truth,
 * never a runtime bypass of the stored rows.
 *
 * The Sensitive Material Access GRANT is deliberately NOT a capability: it
 * remains the per-user boolean predicate UC-07/09/10 already enforce, and it
 * stacks only on the practitioner roles (ruling #8 — never Read-Only,
 * default-deny where the ticket is silent).
 */

export const CAPABILITIES = [
  /** Read templates and drafts (owner/case scoping still applies). */
  'forms.read',
  /** Create/edit drafts, run reviews, autofill, language-insert. */
  'forms.edit',
  /** Finalise, advisory-bypass (with reasons), reopen for amendment. */
  'forms.finalise',
  /** Start PDF/DOCX generation for accessible drafts (output is
   *  draft-marked, hence Paralegal holds it — ruling #1). */
  'documents.generate',
  /** Open generated documents (ownership/CaseAccess/SENS re-checks stay). */
  'documents.read',
  /** Archive and version-history reads (scoping stays). */
  'archive.read',
  /** Manual case-linking of standalone lineages. */
  'archive.link',
  /** Case list/detail reads (CaseAccess rows still scope WHICH cases). */
  'cases.read',
  /** Read-only listing of advisory bypasses with verbatim reasons
   *  (ruling #9 — no approve/reject workflow in v1). */
  'oversight.bypasses',
  /** User/role/grant management and password resets — and NOTHING
   *  content-bearing (D-G4 separation of duties). */
  'admin.users',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** LER-1014's four roles, exactly as named in the ticket. */
export const ROLE_NAMES = [
  'Administrator',
  'Senior Solicitor',
  'Paralegal',
  'Read-Only',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

const PARALEGAL_CAPABILITIES: readonly Capability[] = [
  'forms.read',
  'forms.edit',
  'documents.generate',
  'documents.read',
  'archive.read',
  'archive.link',
  'cases.read',
];

/** The seed truth. Administrator holds admin.users ONLY — the D-G4
 *  separation is a property of this table, tested here and at the API. */
export const ROLE_CAPABILITIES: Record<RoleName, readonly Capability[]> = {
  Administrator: ['admin.users'],
  'Senior Solicitor': [...PARALEGAL_CAPABILITIES, 'forms.finalise', 'oversight.bypasses'],
  Paralegal: PARALEGAL_CAPABILITIES,
  'Read-Only': ['forms.read', 'documents.read', 'archive.read', 'cases.read'],
};

/** Union of capability sets (as stored on Role rows) into one lookup. */
export function capabilitySetOf(
  roleCapabilityLists: readonly (readonly string[])[],
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const list of roleCapabilityLists) for (const cap of list) set.add(cap);
  return set;
}

export function hasCapability(set: ReadonlySet<string>, capability: Capability): boolean {
  return set.has(capability);
}

/** Ruling #8: the sensitive grant may stack on practitioner roles only. */
export function grantAssignableTo(roleNames: readonly string[]): boolean {
  return roleNames.includes('Senior Solicitor') || roleNames.includes('Paralegal');
}

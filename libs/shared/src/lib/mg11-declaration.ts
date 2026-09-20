/**
 * The MG11 statutory declaration (UC-03).
 *
 * This wording is NOT a form field value and is never stored per draft: a draft
 * records only `declarationConfirmed: true`. Both the client (which renders it
 * read-only) and the API (which verifies its integrity at startup) read it from
 * here, so there is exactly one copy in the system and no endpoint accepts
 * declaration wording from a client.
 *
 * Provenance note (D-B, provisional — docs/decisions/
 * provisional-decision-register.md): this is the s.9 CJA 1967 / s.5B MCA 1980
 * declaration EXACTLY as printed on two independent genuine specimens — the
 * Manual of Guidance 2011 MG11 (docs/reference/MoG-2011-july-archived.pdf,
 * p104) and the bbpolice.uk 2013 MG11 — which agree on all three deltas from
 * the pre-D-B wording: the page-count parenthetical, "stated in it anything",
 * and the comma before "or do not believe". The "___" blank is the specimen's
 * page-count blank; the render pipeline interpolates the ACTUAL page count
 * (declarationPageCountActive() is now true) and refuses to emit a document
 * whose declared count differs from its actual count. Adoption is PROVISIONAL
 * pending practitioner ratification (LER-1200/1077/1078/1124); reversal is a
 * one-commit revert of this constant + its hash pin, which re-dormants the
 * interpolation automatically.
 */
export const MG11_DECLARATION =
  'This statement (consisting of ___ page(s) each signed by me) is true to the best of my knowledge and belief and I make it knowing that, if it is tendered in evidence, I shall be liable to prosecution if I have wilfully stated in it anything which I know to be false, or do not believe to be true.';

/**
 * SHA-256 of MG11_DECLARATION (UTF-8). The API hashes the constant on startup
 * and refuses to boot on a mismatch, so the wording cannot drift — whether by
 * accident or by tampering — without a deliberate, reviewable change here.
 *
 * Regenerate after an approved wording change with:
 *   node -e "console.log(require('crypto').createHash('sha256').update(require('./libs/shared/dist/index.js').MG11_DECLARATION,'utf8').digest('hex'))"
 */
export const MG11_DECLARATION_SHA256 =
  '335ff916bb36cf8459b240ab6e7bad01b62aa898957e94737fbae1f7fb7c0490';

/** The checkbox field that records confirmation of the declaration. */
export const MG11_DECLARATION_FIELD_ID = 'declarationConfirmed';

/**
 * Keys a client may never send: declaration wording is server-owned. Guarded on
 * every save path, not just MG11, so no form can smuggle wording into a draft.
 */
export const FORBIDDEN_DRAFT_VALUE_KEYS: readonly string[] = ['declarationText'];

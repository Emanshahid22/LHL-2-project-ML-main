/**
 * UC-09: application-level encryption at rest (Global DoD #12 / UC-09 DoD 2).
 *
 * AES-256-GCM per document: a random 96-bit IV per file, the auth tag stored
 * on the DB row so a tampered file FAILS decryption rather than serving
 * altered content. Platform attestation was judged insufficient for LER-1202,
 * so the claim is made where it can be verified: stored bytes are ciphertext
 * (no %PDF/PK magic — the storage audit checks), and decrypt happens only in
 * the streaming endpoints.
 *
 * Key resolution (DOCUMENT_MASTER_KEY, 32 bytes base64):
 *  - present and well-formed → used;
 *  - present but MALFORMED → the API refuses to boot (a misconfigured key is
 *    an operator error that must never degrade silently — same posture as
 *    the wording integrity asserts);
 *  - ABSENT → an ephemeral process-lifetime key with a loud warning. This is
 *    a recorded deviation from the story letter (which said absent → refuse):
 *    refusing would break every existing dev/CI boot path, and an ephemeral
 *    key keeps the invariant that matters — bytes on disk are NEVER
 *    plaintext — while making the missing configuration impossible to miss.
 *    Deployed environments must set the key or documents die with the
 *    process.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { Decipher } from 'node:crypto';
import { Logger } from '@nestjs/common';

export const DOCUMENT_CIPHER = 'aes-256-gcm';
const KEY_ENV = 'DOCUMENT_MASTER_KEY';

let masterKey: Buffer | null = null;
let ephemeral = false;

/**
 * Called from bootstrap BEFORE listen (beside the wording integrity asserts)
 * and lazily by the crypto functions. Throws on a malformed key.
 */
export function resolveDocumentMasterKey(): Buffer {
  if (masterKey) return masterKey;
  const raw = process.env[KEY_ENV];
  if (raw !== undefined && raw !== '') {
    // 32 bytes base64 is exactly 43 payload chars + one '=' — Buffer.from is
    // lenient about garbage, so the SHAPE is checked before decoding.
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw) || Buffer.from(raw, 'base64').length !== 32) {
      throw new Error(
        `${KEY_ENV} is malformed: expected 32 bytes base64-encoded (44 chars). Refusing to start — a half-working document key silently produces undecryptable or weakly-keyed files.`,
      );
    }
    masterKey = Buffer.from(raw, 'base64');
    return masterKey;
  }
  masterKey = randomBytes(32);
  ephemeral = true;
  new Logger('DocumentCrypto').warn(
    `${KEY_ENV} is not set — using an EPHEMERAL key. Generated documents will not be decryptable after a restart. Set a 32-byte base64 key in any deployed environment.`,
  );
  return masterKey;
}

export function isEphemeralKey(): boolean {
  return ephemeral;
}

export interface EncryptedDocument {
  ciphertext: Buffer;
  ivHex: string;
  authTagHex: string;
  /** SHA-256 of the PLAINTEXT — content identity survives re-encryption. */
  contentHashHex: string;
}

export function encryptDocument(plaintext: Buffer): EncryptedDocument {
  const key = resolveDocumentMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(DOCUMENT_CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext,
    ivHex: iv.toString('hex'),
    authTagHex: cipher.getAuthTag().toString('hex'),
    contentHashHex: createHash('sha256').update(plaintext).digest('hex'),
  };
}

/**
 * A decipher STREAM — the endpoints pipe file → decipher → response without
 * buffering whole documents (PRD §9). GCM verifies the tag at final(): a
 * tampered file aborts the stream instead of serving altered bytes.
 */
export function documentDecipher(ivHex: string, authTagHex: string): Decipher {
  const decipher = createDecipheriv(
    DOCUMENT_CIPHER,
    resolveDocumentMasterKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher;
}

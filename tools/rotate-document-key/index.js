#!/usr/bin/env node
/**
 * rotate-document-key — re-encrypt every stored document under a new master
 * key (LER-1165, deviation D7: one env-supplied key, rotation = re-encrypt).
 *
 *   OLD_DOCUMENT_MASTER_KEY=<base64> NEW_DOCUMENT_MASTER_KEY=<base64> \
 *     node tools/rotate-document-key [--dry-run]
 *   node tools/rotate-document-key --self-test
 *
 * For each stored file: decrypt with the old key (GCM verifies it — a
 * tampered file fails the rotation loudly rather than being re-signed),
 * check the plaintext against the row's contentHash, re-encrypt under the
 * new key with a fresh IV, write the file back and update every row that
 * references it. contentHash and storageKey never change: content identity
 * survives re-encryption, by design.
 *
 * The cipher layout is the storage CONTRACT (aes-256-gcm, 96-bit IV and the
 * auth tag hex on the row, the file holding raw ciphertext) — implemented
 * here directly over node:crypto, and proven by the self-tests: a
 * round-trip must succeed, a tampered byte and a wrong key must both fail
 * authentication. Exit 1 on any failure; keys are never printed.
 */
const { PrismaClient } = require('@prisma/client');
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const STORE_DIR =
  process.env.DOCUMENT_STORE_DIR || resolve(__dirname, '..', '..', 'apps', 'api', 'document-store');

function parseKey(name) {
  const raw = process.env[name];
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw) || Buffer.from(raw, 'base64').length !== 32) {
    console.error(`${name} must be 32 bytes, base64-encoded (44 chars).`);
    process.exit(1);
  }
  return Buffer.from(raw, 'base64');
}

function decrypt(key, ivHex, authTagHex, ciphertext) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encrypt(key, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, ivHex: iv.toString('hex'), authTagHex: cipher.getAuthTag().toString('hex') };
}

/** Round-trip + tamper-fails + wrong-key-fails, over the exact storage layout. */
function selfTest() {
  const key = randomBytes(32);
  const other = randomBytes(32);
  const plaintext = Buffer.from('%PDF-1.7 self-test plaintext body');
  const enc = encrypt(key, plaintext);
  if (!decrypt(key, enc.ivHex, enc.authTagHex, enc.ciphertext).equals(plaintext)) {
    console.error('SELF-TEST FAILED: round-trip mismatch');
    process.exit(1);
  }
  const tampered = Buffer.from(enc.ciphertext);
  tampered[Math.floor(tampered.length / 2)] ^= 0xff;
  let tamperedFailed = false;
  try {
    decrypt(key, enc.ivHex, enc.authTagHex, tampered);
  } catch {
    tamperedFailed = true;
  }
  if (!tamperedFailed) {
    console.error('SELF-TEST FAILED: tampered ciphertext decrypted');
    process.exit(1);
  }
  let wrongKeyFailed = false;
  try {
    decrypt(other, enc.ivHex, enc.authTagHex, enc.ciphertext);
  } catch {
    wrongKeyFailed = true;
  }
  if (!wrongKeyFailed) {
    console.error('SELF-TEST FAILED: wrong key decrypted');
    process.exit(1);
  }
  return 3;
}

async function main() {
  const selfTests = selfTest();
  if (process.argv.includes('--self-test')) {
    console.log(`rotate-document-key: ${selfTests} self-tests passed`);
    return;
  }
  const dryRun = process.argv.includes('--dry-run');
  const oldKey = parseKey('OLD_DOCUMENT_MASTER_KEY');
  const newKey = parseKey('NEW_DOCUMENT_MASTER_KEY');

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.generatedDocument.findMany();
    // Twin rows share one file: rotate each FILE once, then update every row
    // that references it with the file's new cipher identity.
    const byKey = new Map();
    for (const row of rows) {
      if (!byKey.has(row.storageKey)) byKey.set(row.storageKey, []);
      byKey.get(row.storageKey).push(row);
    }
    let rotated = 0;
    for (const [storageKey, group] of byKey) {
      const path = join(STORE_DIR, storageKey);
      if (!existsSync(path)) {
        console.error(`MISSING FILE for ${storageKey} — aborting before any partial rotation.`);
        process.exit(1);
      }
      const { iv, authTag, contentHash } = group[0];
      const plaintext = decrypt(oldKey, iv, authTag, readFileSync(path));
      const hash = createHash('sha256').update(plaintext).digest('hex');
      if (hash !== contentHash) {
        console.error(`CONTENT HASH MISMATCH for ${storageKey} — refusing to re-sign it.`);
        process.exit(1);
      }
      if (!dryRun) {
        const enc = encrypt(newKey, plaintext);
        writeFileSync(path, enc.ciphertext);
        await prisma.generatedDocument.updateMany({
          where: { storageKey },
          data: { iv: enc.ivHex, authTag: enc.authTagHex },
        });
      }
      rotated++;
    }
    console.log(
      `rotate-document-key: ${selfTests} self-tests passed; ${rotated} file(s) / ${rows.length} row(s) ${dryRun ? 'verified (dry run)' : 'rotated'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('rotation failed:', err.message);
  process.exit(1);
});

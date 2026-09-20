import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { MG11_DECLARATION, MG11_DECLARATION_SHA256 } from '@mgs/shared';

const logger = new Logger('DeclarationIntegrity');

/** SHA-256 of the shipped declaration wording. */
export function declarationHash(): string {
  return createHash('sha256').update(MG11_DECLARATION, 'utf8').digest('hex');
}

/**
 * UC-03 declaration integrity gate.
 *
 * The statutory declaration must be byte-identical to the reviewed wording: a
 * statement carrying altered wording would be worthless (and misleading) in
 * court. Hashing at startup means drift fails loudly here rather than silently
 * reaching a witness, so a mismatch is fatal — the API refuses to serve.
 *
 * Throws on mismatch; bootstrap turns that into a non-zero exit.
 */
export function assertDeclarationIntegrity(): void {
  const actual = declarationHash();
  if (actual === MG11_DECLARATION_SHA256) {
    logger.log('MG11 declaration integrity verified');
    return;
  }

  logger.error(
    'FATAL: MG11 declaration integrity check failed — the statutory wording does not ' +
      'match its reviewed hash. Refusing to start.',
  );
  logger.error(`  expected sha256: ${MG11_DECLARATION_SHA256}`);
  logger.error(`  actual   sha256: ${actual}`);
  throw new Error('MG11 declaration integrity check failed');
}

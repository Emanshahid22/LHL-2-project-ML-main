import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  PII_STEPS_SHA256,
  SENSITIVE_HANDLING_SHA256,
  piiStepsCanonical,
  sensitiveHandlingCanonical,
} from '@mgs/shared';

const logger = new Logger('SensitiveWordingIntegrity');

/**
 * UC-07 wording integrity gate — the MG11-declaration discipline applied to the
 * handling instructions and the PII steps.
 *
 * These blocks are rendered as authoritative guidance beside sensitive material
 * on a criminal case file, and every acknowledgement row records the pin of the
 * wording it acknowledged. If the constants drift from their reviewed pins, the
 * acknowledgement record would attest to wording nobody reviewed — so drift is
 * fatal at startup, not a warning in a log nobody reads.
 *
 * Throws on mismatch; bootstrap turns that into a non-zero exit.
 */
export function assertSensitiveWordingIntegrity(): void {
  const checks: [name: string, expected: string, actual: string][] = [
    [
      'sensitive handling instructions',
      SENSITIVE_HANDLING_SHA256,
      createHash('sha256').update(sensitiveHandlingCanonical(), 'utf8').digest('hex'),
    ],
    [
      'PII steps',
      PII_STEPS_SHA256,
      createHash('sha256').update(piiStepsCanonical(), 'utf8').digest('hex'),
    ],
  ];

  for (const [name, expected, actual] of checks) {
    if (actual !== expected) {
      logger.error(
        `FATAL: ${name} integrity check failed — the wording does not match its reviewed hash. Refusing to start.`,
      );
      logger.error(`  expected sha256: ${expected}`);
      logger.error(`  actual   sha256: ${actual}`);
      throw new Error(`UC-07 ${name} integrity check failed`);
    }
  }
  logger.log('UC-07 sensitive-material wording integrity verified');
}

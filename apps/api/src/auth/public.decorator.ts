import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'release01:isPublic';

/**
 * LER-1015: marks a route as reachable without a session. The boundary is
 * guard-by-default — this decorator is the ONLY way out, the completeness
 * check refuses to boot if a route carries neither this nor @Requires, and
 * the e2e 401 matrix walks the result.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

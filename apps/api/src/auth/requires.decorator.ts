import { SetMetadata } from '@nestjs/common';
import type { Capability } from '@mgs/shared';

export const REQUIRES_KEY = 'release01:requiresCapability';

/**
 * LER-1015: declares the capability a route requires (PRD §5's table, in
 * code). Deeper scoping (ownership, CaseAccess, the sensitive grant) stays
 * INSIDE services exactly as built — this layer sits in front of those
 * checks, never replacing them.
 */
export const Requires = (capability: Capability) => SetMetadata(REQUIRES_KEY, capability);

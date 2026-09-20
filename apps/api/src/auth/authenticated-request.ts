import type { Request } from 'express';
import type { User } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user: User;
  /** Release-01: the validated session row's id (logout revokes it). */
  sessionId?: string;
  /** Release-01: the resolved capability set (CapabilityGuard attaches it). */
  capabilities?: ReadonlySet<string>;
}

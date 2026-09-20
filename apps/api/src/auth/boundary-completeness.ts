/**
 * LER-1015's build-time completeness check, enforced at BOOT: every HTTP
 * route must carry @Public, @Requires(capability), or appear on the
 * SESSION_ONLY list below. An undeclared route refuses to serve — a new
 * endpoint cannot default open (or default-capability) by omission.
 */
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DiscoveryService } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from './public.decorator';
import { REQUIRES_KEY } from './requires.decorator';

/** Routes that legitimately need a session but no capability: identity and
 *  session management itself. Everything else must declare. */
const SESSION_ONLY = new Set(['me', 'auth/logout', 'auth/change-password']);

export function assertBoundaryComplete(app: INestApplication): void {
  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const undeclared: string[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const controllerPath = (Reflect.getMetadata(PATH_METADATA, metatype) ?? '') as string;
    const proto = Object.getPrototypeOf(instance);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const routePath = (Reflect.getMetadata(PATH_METADATA, handler) ?? '') as string;
      const full = [controllerPath, routePath].filter((p) => p && p !== '/').join('/');
      const isPublic =
        reflector.get<boolean>(IS_PUBLIC_KEY, handler) ??
        reflector.get<boolean>(IS_PUBLIC_KEY, metatype);
      const requires =
        reflector.get<string>(REQUIRES_KEY, handler) ??
        reflector.get<string>(REQUIRES_KEY, metatype);
      if (!isPublic && !requires && !SESSION_ONLY.has(full)) {
        undeclared.push(`${metatype.name}.${name} (${full || '/'})`);
      }
    }
  }

  if (undeclared.length > 0) {
    throw new Error(
      `API boundary incomplete — routes without @Public/@Requires/session-only listing:\n  ` +
        undeclared.join('\n  '),
    );
  }
}

import { NestFactory } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Express, NextFunction, Request, Response } from 'express';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertBoundaryComplete } from './auth/boundary-completeness';
import { assertDeclarationIntegrity } from './integrity/declaration-integrity';
import { assertSensitiveWordingIntegrity } from './integrity/sensitive-wording-integrity';
import { resolveDocumentMasterKey } from './documents/document-crypto';

/**
 * Staging basic-auth gate (deploy branch, decided by Ali).
 *
 * The app has no real auth: DemoAuthGuard trusts an `x-user-email` header, so
 * on a public URL any visitor could assert any identity — including the
 * sensitive-material permission. Until OAuth2/RBAC (LER-1013/1014) exist,
 * HTTP basic auth fronts EVERYTHING — static assets and /api/* alike — with
 * exactly one exemption: /api/health, so the platform's checks can probe
 * liveness without credentials.
 *
 * Enabled only when BOTH STAGING_AUTH_USER and STAGING_AUTH_PASSWORD are set,
 * so local development and the E2E suite are untouched. Credentials are
 * compared constant-time over digests, so neither length nor prefix leaks.
 */
function credentialMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function basicAuth(user: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      const givenUser = colon >= 0 ? decoded.slice(0, colon) : decoded;
      const givenPassword = colon >= 0 ? decoded.slice(colon + 1) : '';
      if (credentialMatches(givenUser, user) && credentialMatches(givenPassword, password)) {
        next();
        return;
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="MG Forms staging"');
    res.status(401).send('Authentication required');
  };
}

/**
 * Where the built Angular bundle lives, if anywhere. Serving it from the API
 * gives staging one service, one origin, one auth gate and no CORS surface —
 * preferable to a second static service for an app whose MG6D access control
 * a permissive CORS policy would undermine. Local dev is unaffected: the dev
 * server on :4200 keeps proxying /api, and the watcher's cwd (apps/api) has
 * no dist to find.
 */
function webDistDir(): string | null {
  const candidates = [
    process.env.WEB_DIST_DIR,
    resolve(process.cwd(), 'apps/web/dist/web/browser'),
    resolve(__dirname, '../../web/dist/web/browser'),
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

async function bootstrap() {
  // UC-03: verify the statutory declaration before serving anything. A mismatch
  // is fatal by design — see declaration-integrity.ts.
  assertDeclarationIntegrity();
  // UC-07: same discipline for the sensitive-material wording, whose hash pin
  // every acknowledgement row records.
  assertSensitiveWordingIntegrity();
  // UC-09: a malformed DOCUMENT_MASTER_KEY refuses to boot (absent falls back
  // to an ephemeral key with a loud warning — see document-crypto.ts).
  resolveDocumentMasterKey();

  const app = await NestFactory.create(AppModule);
  // Release-01 (LER-1015): refuse to serve if any route lacks an access
  // declaration — default-open cannot happen by omission.
  assertBoundaryComplete(app);
  // Raw express routes registered here run BEFORE Nest mounts its router (at
  // listen), which is what makes the ordering below enforceable: health first
  // (exempt), then the gate, then static — Nest's /api routes after all of it.
  const server = app.getHttpAdapter().getInstance() as Express;
  // Release-01: behind Railway's TLS proxy the Secure cookie needs the real
  // protocol; helmet sets the standard security headers (CSP stays off until
  // the Angular bundle's inline styles are audited — recorded deviation).
  server.set('trust proxy', 1);
  server.use(helmet({ contentSecurityPolicy: false }));

  // Liveness for the platform's health checks: no credentials, no database, no
  // guard — a probe must not depend on the things it exists to watch.
  server.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  const authUser = process.env.STAGING_AUTH_USER;
  const authPassword = process.env.STAGING_AUTH_PASSWORD;
  if (authUser && authPassword) {
    server.use(basicAuth(authUser, authPassword));
    console.log('Staging basic-auth gate enabled (exempt: /api/health)');
  }

  const dist = webDistDir();
  if (dist) {
    server.use(express.static(dist));
    // SPA fallback for client-side routes — GETs only, never /api/* (the
    // regex, not middleware order, is what keeps Nest's routes unshadowed).
    server.get(/^\/(?!api(\/|$)).*/, (_req: Request, res: Response) => {
      res.sendFile(join(dist, 'index.html'));
    });
    console.log(`Serving web bundle from ${dist}`);
  }

  app.setGlobalPrefix('api');
  // The Angular dev server proxies /api, but allow direct calls in dev too.
  // Same-origin in staging (the API serves the bundle), so no other origin is
  // ever added here — permissive CORS would undermine the MG6D access gate.
  app.enableCors({ origin: /^http:\/\/localhost:\d+$/ });
  await app.listen(process.env.PORT ?? 3000);
  console.log(`MGs Forms API listening on http://localhost:${process.env.PORT ?? 3000}/api`);
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

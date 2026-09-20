/** Minimal cookie helpers — no parser dependency for two known cookies. */
import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'mgs_sid';
/** Angular's HttpClient XSRF support reads this name by default. */
export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'x-xsrf-token';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function setSessionCookies(
  res: Response,
  sessionId: string,
  csrfSecret: string,
  maxAgeMs: number,
): void {
  const secure = process.env['NODE_ENV'] === 'production';
  // The session cookie is HttpOnly (BFF — tokens never in browser JS);
  // the XSRF cookie is deliberately readable so Angular can echo it as a
  // header, which the guard compares against the SERVER-side session secret.
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: maxAgeMs,
    path: '/',
  });
  res.cookie(XSRF_COOKIE, csrfSecret, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: maxAgeMs,
    path: '/',
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(XSRF_COOKIE, { path: '/' });
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * Release-01 (LER-1013): the client half of the PKCE flow. The verifier is
 * generated here, lives only for the two login calls, and is never stored;
 * the session itself is an HttpOnly cookie the code never sees (BFF).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  async login(email: string, password: string): Promise<void> {
    const verifier = this.randomUrlSafe(48);
    const challenge = await this.s256(verifier);
    const { code } = await firstValueFrom(
      this.http.post<{ code: string }>('/api/auth/login', {
        email,
        password,
        codeChallenge: challenge,
      }),
    );
    await firstValueFrom(
      this.http.post<{ ok: true }>('/api/auth/token', { code, codeVerifier: verifier }),
    );
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post<{ ok: true }>('/api/auth/logout', {}));
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ ok: true }>('/api/auth/change-password', { currentPassword, newPassword }),
    );
  }

  private randomUrlSafe(bytes: number): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return this.base64url(buf);
  }

  private async s256(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return this.base64url(new Uint8Array(digest));
  }

  private base64url(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

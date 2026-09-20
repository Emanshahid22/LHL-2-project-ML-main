import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { UserService } from './core/services/user.service';
import { AppIcon } from './shared/icon/app-icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppIcon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /**
   * Logged-out MUST read as null, never throw: toSignal rethrows a source
   * error on EVERY read, and this signal is read by the shell template on
   * every change-detection pass — an unguarded /api/me 401 therefore poisons
   * CD app-wide (dead ngModel sync, unrendered @if blocks, half-wired
   * Material inputs). That was the P1 the first human UAT hit on the login
   * page while every logged-in automated test passed.
   */
  protected readonly user = toSignal(
    this.userService.getCurrentUser().pipe(catchError(() => of(null))),
  );
  /** Courtesy only — the API refuses admin routes without the capability. */
  protected readonly isAdmin = computed(() =>
    (this.user()?.capabilities ?? []).includes('admin.users'),
  );

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }

  /** Up to two initials for the avatar, e.g. "Alex Marlowe" -> "AM". */
  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}

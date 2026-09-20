import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';

/** Release-01: the sign-in screen. Errors are the API's content-free words. */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="login-wrap">
      <mat-card appearance="outlined" class="login-card">
        <mat-card-header>
          <mat-card-title>MGs Forms</mat-card-title>
          <mat-card-subtitle>Sign in to continue</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form (ngSubmit)="submit()" data-testid="login-form">
            <mat-form-field appearance="outline" class="field">
              <mat-label>Email</mat-label>
              <input
                matInput
                type="email"
                name="email"
                [(ngModel)]="email"
                autocomplete="username"
                data-testid="login-email"
                aria-label="Email"
                required
              />
            </mat-form-field>
            <mat-form-field appearance="outline" class="field">
              <mat-label>Password</mat-label>
              <input
                matInput
                type="password"
                name="password"
                [(ngModel)]="password"
                autocomplete="current-password"
                data-testid="login-password"
                aria-label="Password"
                required
              />
            </mat-form-field>
            @if (error(); as message) {
              <p class="login-error" role="alert" data-testid="login-error">{{ message }}</p>
            }
            <button
              matButton="filled"
              type="submit"
              class="submit"
              [disabled]="busy()"
              data-testid="login-submit"
            >
              Sign in
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .login-wrap {
      display: flex;
      justify-content: center;
      padding: 10vh 1rem 0;
    }
    .login-card {
      width: 24rem;
      max-width: 100%;
    }
    .field {
      width: 100%;
    }
    .submit {
      width: 100%;
      margin-top: 0.5rem;
    }
    .login-error {
      color: var(--mg-ink-700, inherit);
      font-size: 0.85rem;
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.login(this.email, this.password);
      const me = await new Promise<{ mustChange: boolean }>((resolve, reject) =>
        this.users.getCurrentUser().subscribe({ next: resolve, error: reject }),
      );
      await this.router.navigate([me.mustChange ? '/change-password' : '/']);
    } catch (err: unknown) {
      const message = (err as { error?: { message?: unknown } })?.error?.message;
      this.error.set(typeof message === 'string' ? message : 'Sign-in failed — try again.');
    } finally {
      this.busy.set(false);
    }
  }
}

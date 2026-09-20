import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth.service';

/** Ruling #5: after an admin reset the API confines the session here until
 *  the user sets their own password (the guard enforces; this is the door). */
@Component({
  selector: 'app-change-password-page',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="login-wrap">
      <mat-card appearance="outlined" class="login-card">
        <mat-card-header>
          <mat-card-title>Set a new password</mat-card-title>
          <mat-card-subtitle>At least 12 characters — length beats complexity</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form (ngSubmit)="submit()" data-testid="change-password-form">
            <mat-form-field appearance="outline" class="field">
              <mat-label>Current password</mat-label>
              <input matInput type="password" name="current" [(ngModel)]="current"
                autocomplete="current-password" data-testid="current-password" aria-label="Current password" required />
            </mat-form-field>
            <mat-form-field appearance="outline" class="field">
              <mat-label>New password</mat-label>
              <input matInput type="password" name="next" [(ngModel)]="next"
                autocomplete="new-password" data-testid="new-password" aria-label="New password" required />
            </mat-form-field>
            @if (error(); as message) {
              <p class="login-error" role="alert" data-testid="change-password-error">{{ message }}</p>
            }
            <button matButton="filled" type="submit" class="submit" [disabled]="busy()"
              data-testid="change-password-submit">
              Save password
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .login-wrap { display: flex; justify-content: center; padding: 10vh 1rem 0; }
    .login-card { width: 24rem; max-width: 100%; }
    .field { width: 100%; }
    .submit { width: 100%; margin-top: 0.5rem; }
    .login-error { font-size: 0.85rem; }
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected current = '';
  protected next = '';
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.changePassword(this.current, this.next);
      await this.router.navigate(['/']);
    } catch (err: unknown) {
      const message = (err as { error?: { message?: unknown } })?.error?.message;
      this.error.set(typeof message === 'string' ? message : 'The password could not be changed.');
    } finally {
      this.busy.set(false);
    }
  }
}

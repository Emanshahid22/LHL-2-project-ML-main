import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  sensitiveMaterialAccess: boolean;
  mustChange: boolean;
}

const ROLE_OPTIONS = ['Administrator', 'Senior Solicitor', 'Paralegal', 'Read-Only'];

/**
 * Ruling #6: the minimal admin surface — exactly four actions (list, create,
 * role/grant assignment, password reset). No content views exist here, and
 * none would work: the Administrator role holds no content capability and
 * the API refuses regardless of what any UI shows (D-G4).
 */
@Component({
  selector: 'app-admin-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
})
export class AdminPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly roleOptions = ROLE_OPTIONS;

  protected newEmail = '';
  protected newName = '';
  protected newRole = 'Paralegal';
  protected newPassword = '';

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.users.set(await firstValueFrom(this.http.get<AdminUser[]>('/api/admin/users')));
  }

  protected async createUser(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(
        this.http.post('/api/admin/users', {
          email: this.newEmail,
          name: this.newName,
          role: this.newRole,
          temporaryPassword: this.newPassword,
        }),
      );
      this.newEmail = this.newName = this.newPassword = '';
      this.snackBar.open('User created — they must change the temporary password at sign-in.', undefined, { duration: 4000 });
    });
  }

  protected async setRoles(user: AdminUser, roles: string[]): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.patch(`/api/admin/users/${user.id}/roles`, { roles }));
    });
  }

  protected async setGrant(user: AdminUser, grant: boolean): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(
        this.http.patch(`/api/admin/users/${user.id}/grant`, { sensitiveMaterialAccess: grant }),
      );
    });
  }

  protected async resetPassword(user: AdminUser): Promise<void> {
    const temporaryPassword = prompt(`Temporary password for ${user.email} (min 12 chars):`);
    if (!temporaryPassword) return;
    await this.run(async () => {
      await firstValueFrom(
        this.http.post(`/api/admin/users/${user.id}/password-reset`, { temporaryPassword }),
      );
      this.snackBar.open('Password reset — their sessions are revoked and a change is forced.', undefined, { duration: 4000 });
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err: unknown) {
      const message = (err as { error?: { message?: unknown } })?.error?.message;
      this.snackBar.open(typeof message === 'string' ? message : 'The action failed.', undefined, { duration: 5000 });
    } finally {
      await this.reload();
    }
  }
}

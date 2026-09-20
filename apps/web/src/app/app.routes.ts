import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
    title: 'MGs Forms',
  },
  {
    path: 'cases/:id',
    loadComponent: () =>
      import('./features/case-detail/case-detail-page').then((m) => m.CaseDetailPage),
    title: 'Case — MGs Forms',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
    title: 'Sign in — MGs Forms',
  },
  {
    path: 'change-password',
    loadComponent: () =>
      import('./features/auth/change-password-page').then((m) => m.ChangePasswordPage),
    title: 'Set a new password — MGs Forms',
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
    title: 'Administration — MGs Forms',
  },
  {
    path: 'archive',
    loadComponent: () => import('./features/archive/archive-page').then((m) => m.ArchivePage),
    title: 'Archive — MGs Forms',
  },
  {
    path: 'drafts/:id',
    loadComponent: () => import('./features/form-fill/form-fill-page').then((m) => m.FormFillPage),
    title: 'Complete form — MGs Forms',
  },
  { path: '**', redirectTo: '' },
];

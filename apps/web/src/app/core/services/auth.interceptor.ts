import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/** Release-01: a 401 anywhere means the session ended — return to sign-in.
 *  The login endpoints themselves are exempt (their 401 is the form error). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/api/auth/')
      ) {
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};

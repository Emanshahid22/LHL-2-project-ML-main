import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { CurrentUserDto } from '@mgs/shared';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);

  getCurrentUser(): Observable<CurrentUserDto> {
    return this.http.get<CurrentUserDto>('/api/me');
  }
}

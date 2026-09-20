import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { CaseSummaryDto } from '@mgs/shared';

@Injectable({ providedIn: 'root' })
export class CasesService {
  private readonly http = inject(HttpClient);

  /** Only cases the signed-in user can access — enforced server-side. */
  getMyCases(): Observable<CaseSummaryDto[]> {
    return this.http.get<CaseSummaryDto[]>('/api/cases');
  }

  getCase(id: string): Observable<CaseSummaryDto> {
    return this.http.get<CaseSummaryDto>(`/api/cases/${encodeURIComponent(id)}`);
  }
}

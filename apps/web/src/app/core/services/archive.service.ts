import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  ArchiveDiffResponse,
  ArchiveListResponse,
  ArchivedVersionDto,
  CaseDocumentsResponse,
} from '@mgs/shared';

export interface ArchiveFilters {
  formCode?: string;
  /** A case id, or 'standalone' for unlinked lineages. */
  caseId?: string;
  from?: string;
  to?: string;
  status?: string;
}

/** UC-10: the archive read/link surface. The client renders what these
 *  endpoints return — versions, diffs and access decisions are the API's. */
@Injectable({ providedIn: 'root' })
export class ArchiveService {
  private readonly http = inject(HttpClient);

  getCaseDocuments(caseId: string): Observable<CaseDocumentsResponse> {
    return this.http.get<CaseDocumentsResponse>(
      `/api/cases/${encodeURIComponent(caseId)}/documents`,
    );
  }

  getVersions(lineageId: string): Observable<ArchivedVersionDto[]> {
    return this.http.get<ArchivedVersionDto[]>(
      `/api/archive/lineages/${encodeURIComponent(lineageId)}/versions`,
    );
  }

  getDiff(lineageId: string, from: number, to: number): Observable<ArchiveDiffResponse> {
    return this.http.get<ArchiveDiffResponse>(
      `/api/archive/lineages/${encodeURIComponent(lineageId)}/diff`,
      { params: new HttpParams().set('from', from).set('to', to) },
    );
  }

  link(lineageId: string, caseId: string): Observable<{ lineageId: string; caseId: string }> {
    return this.http.post<{ lineageId: string; caseId: string }>(
      `/api/archive/lineages/${encodeURIComponent(lineageId)}/link`,
      { caseId },
    );
  }

  list(filters: ArchiveFilters): Observable<ArchiveListResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<ArchiveListResponse>('/api/archive', { params });
  }
}

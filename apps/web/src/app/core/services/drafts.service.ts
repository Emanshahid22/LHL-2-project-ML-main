import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  AutoFillResultDto,
  CreateDraftRequest,
  CreateDraftResponse,
  FinaliseRequest,
  FinaliseResponse,
  FormDraftDto,
  QualityReviewResponse,
  SensitiveConfirmRequest,
  SensitiveConfirmResponse,
  UpdateDraftRequest,
  ReopenResponse,
} from '@mgs/shared';

@Injectable({ providedIn: 'root' })
export class DraftsService {
  private readonly http = inject(HttpClient);

  create(request: CreateDraftRequest): Observable<CreateDraftResponse> {
    return this.http.post<CreateDraftResponse>('/api/drafts', request);
  }

  getMyDrafts(): Observable<FormDraftDto[]> {
    return this.http.get<FormDraftDto[]>('/api/drafts');
  }

  getDraft(id: string): Observable<FormDraftDto> {
    return this.http.get<FormDraftDto>(`/api/drafts/${encodeURIComponent(id)}`);
  }

  update(id: string, request: UpdateDraftRequest): Observable<FormDraftDto> {
    return this.http.patch<FormDraftDto>(`/api/drafts/${encodeURIComponent(id)}`, request);
  }

  /** UC-02: populate mapped fields from the linked case (server-side rules). */
  autoFill(id: string): Observable<AutoFillResultDto> {
    return this.http.post<AutoFillResultDto>(`/api/drafts/${encodeURIComponent(id)}/autofill`, {});
  }

  /** UC-08: run the four-check quality suite server-side. */
  review(id: string): Observable<QualityReviewResponse> {
    return this.http.post<QualityReviewResponse>(
      `/api/drafts/${encodeURIComponent(id)}/review`,
      {},
    );
  }

  /** UC-10: reopen a finalised form for amendment — the server creates the
   *  editable copy and supersedes this draft in one transaction. */
  reopen(id: string): Observable<ReopenResponse> {
    return this.http.post<ReopenResponse>(
      `/api/drafts/${encodeURIComponent(id)}/reopen`,
      {},
    );
  }

  /** UC-08: the finalise gate — the server re-runs the engine at the boundary. */
  finalise(id: string, request: FinaliseRequest): Observable<FinaliseResponse> {
    return this.http.post<FinaliseResponse>(
      `/api/drafts/${encodeURIComponent(id)}/finalise`,
      request,
    );
  }

  /**
   * UC-07: records a handling-instructions confirmation or a PII-steps
   * acknowledgement. Each call appends a new persisted row — step-up per
   * access, so there is no cached "already confirmed" shortcut here.
   */
  confirmSensitive(
    id: string,
    request: SensitiveConfirmRequest,
  ): Observable<SensitiveConfirmResponse> {
    return this.http.post<SensitiveConfirmResponse>(
      `/api/drafts/${encodeURIComponent(id)}/sensitive/confirmations`,
      request,
    );
  }
}

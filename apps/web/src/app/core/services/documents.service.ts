import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { GeneratedDocumentDto, PdfJobDto, StartPdfResponse } from '@mgs/shared';

/**
 * UC-09: document generation client. Generation is asynchronous — start
 * returns a job id and the page polls; the bytes never pass through Angular
 * (preview is an iframe on the streaming endpoint, downloads are plain
 * links), so the client holds ids only.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);

  startPdf(draftId: string): Observable<StartPdfResponse> {
    return this.http.post<StartPdfResponse>(
      `/api/drafts/${encodeURIComponent(draftId)}/pdf`,
      {},
    );
  }

  jobStatus(jobId: string): Observable<PdfJobDto> {
    return this.http.get<PdfJobDto>(`/api/pdf-jobs/${encodeURIComponent(jobId)}`);
  }

  documentMeta(id: string): Observable<GeneratedDocumentDto> {
    return this.http.get<GeneratedDocumentDto>(`/api/documents/${encodeURIComponent(id)}`);
  }

  previewUrl(documentId: string): string {
    return `/api/documents/${encodeURIComponent(documentId)}/preview`;
  }

  downloadUrl(documentId: string): string {
    return `/api/documents/${encodeURIComponent(documentId)}/download`;
  }

  docxUrl(documentId: string): string {
    return `/api/documents/${encodeURIComponent(documentId)}/docx`;
  }
}

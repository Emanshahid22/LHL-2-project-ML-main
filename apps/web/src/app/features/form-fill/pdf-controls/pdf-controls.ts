import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DocumentsService } from '../../../core/services/documents.service';

type PdfState = 'idle' | 'generating' | 'ready' | 'failed';

/**
 * UC-09: the generation entry point — the finalised banner's old stub, grown
 * into the real thing. Generate → poll the job → inline preview (an iframe
 * on the streaming endpoint, so what is previewed is byte-for-byte what is
 * stored) with explicit zoom controls (LER-1160), Download, and Download as
 * Word with the draft label explained (LER-1166). Failure shows the server's
 * reason and a Retry; the form data is untouched (LER-1169).
 *
 * No red anywhere here: the draft band inside the document is amber, and
 * red stays reserved for UC-07 sensitive material (rule 6).
 */
@Component({
  selector: 'app-pdf-controls',
  imports: [MatButtonModule, MatProgressBarModule],
  templateUrl: './pdf-controls.html',
  styleUrl: './pdf-controls.scss',
})
export class PdfControls {
  readonly draftId = input.required<string>();

  private readonly documents = inject(DocumentsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<PdfState>('idle');
  protected readonly failureReason = signal<string | null>(null);
  protected readonly documentId = signal<string | null>(null);
  protected readonly pageCount = signal<number | null>(null);
  /** Preview zoom, percent. Bounded so the iframe stays usable. */
  protected readonly zoom = signal(100);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  protected generate(): void {
    this.state.set('generating');
    this.failureReason.set(null);
    this.documents.startPdf(this.draftId()).subscribe({
      next: ({ jobId }) => this.poll(jobId),
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.state.set('failed');
        this.failureReason.set(
          err.status === 409
            ? (err.error?.message ??
              'The form does not pass the quality review — re-run the review first.')
            : 'Could not start the generation. The form is unchanged — try again.',
        );
      },
    });
  }

  private poll(jobId: string): void {
    this.pollTimer = setTimeout(() => {
      this.documents.jobStatus(jobId).subscribe({
        next: (job) => {
          if (job.status === 'done' && job.documentId) {
            this.documentId.set(job.documentId);
            this.state.set('ready');
            this.documents.documentMeta(job.documentId).subscribe({
              next: (meta) => this.pageCount.set(meta.pageCount),
              error: () => this.pageCount.set(null),
            });
          } else if (job.status === 'failed') {
            this.state.set('failed');
            this.failureReason.set(job.failureReason ?? 'The generation failed. Retry when ready.');
          } else {
            this.poll(jobId);
          }
        },
        error: () => {
          this.state.set('failed');
          this.failureReason.set('Lost track of the generation job. The form is unchanged — try again.');
        },
      });
    }, 400);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
  }

  private readonly sanitizer = inject(DomSanitizer);

  /** The preview endpoint is our own same-origin API path — safe to mark as
   *  a resource URL for the iframe (never a client-supplied value). */
  protected readonly previewSrc = computed<SafeResourceUrl | null>(() => {
    const id = this.documentId();
    return id
      ? this.sanitizer.bypassSecurityTrustResourceUrl(this.documents.previewUrl(id))
      : null;
  });

  protected downloadUrl(): string | null {
    const id = this.documentId();
    return id ? this.documents.downloadUrl(id) : null;
  }

  protected docxUrl(): string | null {
    const id = this.documentId();
    return id ? this.documents.docxUrl(id) : null;
  }

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(200, z + 25));
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(50, z - 25));
  }
}

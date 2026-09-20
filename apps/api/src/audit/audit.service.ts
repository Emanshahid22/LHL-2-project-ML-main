import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'FORM_INITIATED'
  | 'DRAFT_SAVED'
  | 'AUTO_POPULATED'
  /** UC-04: a schedule completeness assessment, recorded whether or not it
   *  found the schedule sparse — a check that only logs failures cannot prove
   *  it ran. */
  | 'COMPLETENESS_CHECKED'
  /**
   * UC-06: the user pressed Insert on a language-assistance suggestion.
   *
   * Recorded because the scope's post-condition requires it: "All Insert actions
   * logged in the form audit trail with the suggestion text." The suggestion text
   * is the assistant's own wording, so it is product text rather than case
   * content; the narrative itself is never sent to this endpoint and never
   * appears in the metadata.
   */
  | 'LANGUAGE_SUGGESTION_INSERTED'
  /**
   * UC-07 sensitive material. View and edit are distinct actions because the
   * client tickets require the trail to say which one happened (LER-1135).
   * User identity and timestamp are the row's own userId/createdAt. Metadata
   * carries ids, counts and wording-hash pins — never case content.
   */
  | 'SENSITIVE_SECTION_VIEWED'
  | 'SENSITIVE_SECTION_EDITED'
  | 'SENSITIVE_INSTRUCTIONS_CONFIRMED'
  | 'SENSITIVE_PII_ACKNOWLEDGED'
  /** A rejected attempt: an edit or confirmation without the permission, or an
   *  edit without a valid recorded confirmation. */
  | 'SENSITIVE_ACCESS_DENIED'
  /** UC-07: a non-sensitive schedule export was generated (counts only). */
  | 'SCHEDULE_EXPORTED'
  /**
   * UC-08 review & finalisation. QUALITY_CHECK_COMPLETED is written on EVERY
   * run — pass, fail or partial — because a trail that only logs failures
   * cannot prove the check ran (the COMPLETENESS_CHECKED precedent). The
   * advisory-bypass reason is the user's own words, recorded verbatim
   * (LER-1106); everything else is ids and counts, never field values.
   */
  | 'QUALITY_CHECK_COMPLETED'
  | 'ADVISORY_BYPASSED'
  | 'FINALISE_REJECTED'
  | 'FORM_FINALISED'
  /**
   * UC-09 document generation. PDF_GENERATED/PDF_FAILED on every job outcome;
   * PDF_RETRIED when a generation follows a failed job for the same draft.
   * DOCUMENT_DOWNLOADED covers preview and download (metadata `mode` says
   * which); DOCX_EXPORTED is the Word download. Metadata carries ids, counts
   * and byte sizes — never draft content, never a filename (filenames exist
   * only in the response header, derived at download time).
   */
  | 'PDF_GENERATED'
  | 'PDF_RETRIED'
  | 'PDF_FAILED'
  | 'DOCUMENT_DOWNLOADED'
  | 'DOCX_EXPORTED'
  /** UC-09: a stored file failed GCM authentication — tampered or wrongly
   *  keyed. The endpoint answers 410 rather than serving altered content. */
  | 'DOCUMENT_INTEGRITY_FAILED'
  /** UC-10: a version was minted into the archive (metadata: lineage id,
   *  version number, label, attached/personal — ids and counts only). */
  | 'DOCUMENT_ARCHIVED'
  /** UC-10: a finalised form was reopened for amendment — a new editable
   *  copy exists and the source is superseded (ARCHIVED). */
  | 'FORM_REOPENED'
  /** UC-10: a standalone lineage was manually attached to a case. */
  | 'CASE_LINKED'
  /** Release-01 (LER-1013/1014): authentication and administration events.
   *  Ids only — never credentials, never content. */
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'LOGIN_FAILED'
  | 'USER_CREATED'
  | 'USER_ROLE_CHANGED'
  | 'GRANT_CHANGED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED';

/**
 * Append-only audit trail (foundation for the audit use case). Events are
 * written out-of-band of the main response — an audit failure is logged but
 * never breaks the user's action. Metadata must never contain case data
 * beyond opaque ids.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    userId: string,
    action: AuditAction,
    formDraftId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          userId,
          action,
          formDraftId: formDraftId ?? null,
          metadataJson: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit event ${action}`, err as Error);
    }
  }
}

/** API contract types shared between the Angular client and the NestJS API. */

/**
 * REVIEWED (UC-08) is set only by a clean quality-check run and is EVIDENCE,
 * not authority: finalise re-runs the engine regardless, and any edit reverts
 * the draft to DRAFT because a review attests exactly the values it saw.
 */
export type DraftStatus = 'DRAFT' | 'REVIEWED' | 'FINALISED' | 'ARCHIVED';

export interface CaseOffenceDto {
  id: string;
  offenceDate: string;
  chargeWording: string;
}

export interface CaseSummaryDto {
  id: string;
  urn: string;
  defendantName: string;
  offenceSummary: string;
  courtName: string | null;
  nextHearingAt: string | null;
  cpsReference: string | null;
  officerInCase: string | null;
  defendantAddress: string | null;
  defendantDob: string | null;
  offences: CaseOffenceDto[];
  /** Lets clients detect that the case changed after a draft was populated. */
  updatedAt: string;
}

/** Provenance of one auto-filled field, keyed by field id on the draft. */
export interface AutoFillProvenance {
  source: 'case';
  /** The case's updatedAt at population time. */
  caseUpdatedAt: string;
  /** The exact value written — a differing draft value means a manual edit. */
  value: unknown;
  accepted: boolean;
}

export type AutoFillOutcomeKind = 'filled' | 'ambiguous' | 'no_data';

export interface AutoFillFieldOutcome {
  fieldId: string;
  outcome: AutoFillOutcomeKind;
  /** Human-readable explanation for ambiguous/no_data outcomes. */
  reason?: string;
}

export interface AutoFillResultDto {
  /** Values written by this run, keyed by field id. */
  values: Record<string, unknown>;
  /** Outcome for each mapped field this run evaluated (manual values are skipped). */
  outcomes: AutoFillFieldOutcome[];
  summary: {
    /** Fields filled by this run. */
    filled: number;
    /** Mappable fields on the template. */
    total: number;
  };
  /** The draft after population (new version, values and provenance). */
  draft: FormDraftDto;
}

export interface FormDraftDto {
  id: string;
  formCode: string;
  templateVersion: number;
  status: DraftStatus;
  version: number;
  values: Record<string, unknown>;
  /** Auto-fill provenance by field id (UC-02) — drives badges and re-runs. */
  autoFill: Record<string, AutoFillProvenance>;
  caseId: string | null;
  case?: CaseSummaryDto | null;
  createdAt: string;
  updatedAt: string;
  /** UC-07: present on single-draft responses when the template declares a
   *  sensitive section. Absent on list rows (whose values are still redacted
   *  for users without the permission). */
  sensitiveSection?: SensitiveSectionDto;
}

export interface CreateDraftRequest {
  formCode: string;
  /** Omit or null for a standalone form. */
  caseId?: string | null;
}

export interface CreateDraftResponse {
  draft: FormDraftDto;
  /** Set when a requested case link could not be honoured (inaccessible case);
   *  the draft is created standalone and the client shows a banner. */
  caseLinkWarning?: string;
}

export interface UpdateDraftRequest {
  values: Record<string, unknown>;
  /** Optimistic concurrency: the version the client last saw. */
  baseVersion: number;
  /**
   * UC-07: required whenever `values` carries any sensitive-declared field —
   * the id of a HANDLING_INSTRUCTIONS acknowledgement belonging to this user
   * and this draft. Without a valid one the save is rejected with 403; requests
   * that do not touch the sensitive section never need it.
   */
  sensitiveConfirmationId?: string;
}

/**
 * UC-07: the state of a draft's sensitive-material (MG6D) section, computed
 * server-side and attached to single-draft DTOs when the template declares
 * sensitive fields. The instructions, PII steps and link travel ONLY to users
 * holding the permission: for everyone else the block stops at the lock
 * metadata, because content that reached an unauthorised client is not locked.
 */
export interface SensitiveSectionDto {
  /** Derived from the stored values (UC-04's flag). */
  active: boolean;
  /** Whether THIS user holds the permission. */
  permitted: boolean;
  requiredPermissionLevel: string;
  /** Names (only) of users holding the permission — who in the firm to ask. */
  permissionHolders: string[];
  /** Rows currently on the sensitive schedule. A count, never content — the
   *  locked state may honestly say the section has material in it. */
  sensitiveItemCount: number;
  /** Present only when `permitted`. */
  handlingInstructions?: { text: string; source: string }[];
  handlingNotice?: string;
  /** The hash pin acknowledgements record — present only when `permitted`. */
  wordingHash?: string;
  piiSteps?: { text: string; source: string }[];
  practiceDirection?: { label: string; url: string };
  /** Whether THIS user has a persisted PII acknowledgement for this draft. */
  piiAcknowledged?: boolean;
}

/** UC-08: POST /drafts/:id/review — the report plus the (possibly updated) status. */
export interface QualityReviewResponse {
  report: import('./quality-check').QualityReport;
  status: DraftStatus;
}

/** UC-08: request body for POST /drafts/:id/finalise. */
export interface FinaliseRequest {
  advisoryAcknowledgements?: import('./quality-check').AdvisoryAcknowledgement[];
}

/** UC-08: a successful finalisation. */
export interface FinaliseResponse {
  status: DraftStatus;
  report: import('./quality-check').QualityReport;
}

/** UC-07: request body for POST /drafts/:id/sensitive/confirmations. */
export interface SensitiveConfirmRequest {
  kind: 'HANDLING_INSTRUCTIONS' | 'PII_STEPS';
}

/** UC-07: a recorded confirmation/acknowledgement. */
export interface SensitiveConfirmResponse {
  id: string;
  kind: 'HANDLING_INSTRUCTIONS' | 'PII_STEPS';
  recordedAt: string;
}

export interface CurrentUserDto {
  id: string;
  name: string;
  email: string;
  /** UC-07 permission level — the client uses it only for honest
   *  presentation (withheld states); the API re-checks on every access. */
  sensitiveMaterialAccess: boolean;
  /** Release-01: role names and resolved capabilities — presentation only;
   *  every access is re-checked at the API (LER-1015). */
  roles: string[];
  capabilities: string[];
  /** Ruling #5: true after an admin reset until the user sets a password. */
  mustChange: boolean;
}

/**
 * UC-06: request to the optional language-assistance proxy.
 *
 * Narrative text and nothing else. There is no draft id and no field id on
 * purpose: the service is a text-in, prompts-out boundary with no way to reach a
 * draft, and giving it an identifier to write against would be the first step to
 * it having one.
 */
export interface LanguagePromptsRequest {
  text: string;
}

/**
 * The proxy's answer. It never fails: an unconfigured deployment, a timeout, an
 * upstream 5xx and a malformed response all produce an empty `prompts` array,
 * because the panel must degrade to silence rather than to an error.
 */
export interface LanguagePromptsResponse {
  /** Validated prompts. Anything unattributable has lost its `insertText`. */
  prompts: import('./language-assistance').AssistancePrompt[];
  /** False when no assistance service is configured — the default deployment. */
  enabled: boolean;
  /** True when a service IS configured but did not answer usefully. */
  degraded: boolean;
}

/** UC-09: POST /drafts/:id/pdf — generation started (or restarted). */
export interface StartPdfResponse {
  jobId: string;
}

export type PdfJobStatus = 'queued' | 'rendering' | 'done' | 'failed';

/** UC-09: GET /pdf-jobs/:id. Failure carries a user-readable reason and a
 *  retryable flag; it NEVER mutates the draft (LER-1169). */
export interface PdfJobDto {
  id: string;
  draftId: string;
  status: PdfJobStatus;
  documentId?: string;
  failureReason?: string;
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** UC-09: document metadata as the client sees it — identity and provenance,
 *  never bytes, never a stored filename (filenames are derived at download
 *  time from this metadata and exist nowhere else, LER-1167). */
export interface GeneratedDocumentDto {
  id: string;
  draftId: string;
  formCode: string;
  templateVersion: number;
  kind: 'pdf' | 'docx';
  pageCount: number;
  sizeBytes: number;
  /** UC-10: 'attached' (case-linked) | 'personal' (standalone archive).
   *  'pending-uc10' survives only on rows minted before the archive existed. */
  archiveStatus: 'pending-uc10' | 'attached' | 'personal';
  createdAt: string;
}

/** UC-10: one minted version of a form lineage (append-only history). */
export interface ArchivedVersionDto {
  id: string;
  lineageId: string;
  versionNumber: number;
  /** 'Original' | 'Amendment N' — assigned at mint by planVersionMint. */
  label: string;
  cycle: number;
  formCode: string;
  templateVersion: number;
  documentId: string;
  docxDocumentId?: string;
  /** SHA-256 of the version's plaintext PDF — byte-integrity per version. */
  contentHash: string;
  caseId: string | null;
  generatedByName: string;
  containsSensitive: boolean;
  createdAt: string;
}

/** UC-10: POST /drafts/:id/reopen. */
export interface ReopenResponse {
  draftId: string;
  lineageId: string;
}

/** UC-10: GET /archive/lineages/:id/diff?from=&to=. Entries come from the
 *  shared diffArchivedValues under the CALLER's sensitive permission. */
export interface ArchiveDiffResponse {
  lineageId: string;
  from: number;
  to: number;
  entries: import('./archive-version').ValueDiffEntry[];
}

/** UC-10: one lineage in a Documents section or the personal archive —
 *  the PRIMARY entry is always the CURRENT version (DoD line 4). */
export interface ArchiveLineageEntryDto {
  lineageId: string;
  formCode: string;
  caseId: string | null;
  versionCount: number;
  current: ArchivedVersionDto;
  /** 'Final' — or 'Amendment in progress' while an open copy exists. */
  status: 'Final' | 'Amendment in progress';
}

/** UC-10: GET /cases/:id/documents — the "MG Forms" folder. */
export interface CaseDocumentsResponse {
  caseId: string;
  lineages: ArchiveLineageEntryDto[];
}

/** UC-10: GET /archive — the caller's archive with LER-1186's filters
 *  (case, form type, date, status), applied server-side. */
export interface ArchiveListResponse {
  entries: ArchiveLineageEntryDto[];
}

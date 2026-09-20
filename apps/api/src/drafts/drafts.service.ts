import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { FormDraft, User } from '@prisma/client';
import {
  AutoFillFieldOutcome,
  SENSITIVE_MATERIAL_FLAG_KEY,
  AutoFillProvenance,
  AutoFillResultDto,
  CreateDraftRequest,
  CreateDraftResponse,
  DraftStatus,
  FORBIDDEN_DRAFT_VALUE_KEYS,
  FormDraftDto,
  MG11_DECLARATION_FIELD_ID,
  PII_PRACTICE_DIRECTION,
  PII_STEPS,
  PII_STEPS_SHA256,
  SENSITIVE_HANDLING_INSTRUCTIONS,
  SENSITIVE_HANDLING_NOTICE,
  SENSITIVE_HANDLING_SHA256,
  SENSITIVE_PERMISSION_LEVEL,
  SensitiveConfirmResponse,
  SensitiveSectionDto,
  FinaliseResponse,
  QualityCheckResult,
  QualityReport,
  QualityReviewResponse,
  QUALITY_CHECK_TIMEOUT_MS,
  QUALITY_CHECK_TITLES,
  UpdateDraftRequest,
  advisoriesOf,
  asRows,
  assembleReport,
  buildNonSensitiveScheduleCsv,
  checkCrossForm,
  checkDateLogic,
  checkRequiredCompleteness,
  checkSensitiveHandling,
  isFinaliseRequest,
  unacknowledgedAdvisories,
  checkCompleteness,
  countFindings,
  validateForm,
  detectNarrativeFlags,
  distinctFlaggedPhrases,
  getFormTemplate,
  hasSensitiveRow,
  hasSensitiveSection,
  isFieldValueComplete,
  isLanguageInsertRequest,
  isSensitiveConfirmRequest,
  isSensitiveSectionActive,
  redactSensitiveValues,
  resolveCaseField,
  sensitiveFieldIds,
  shouldRunCompletenessCheck,
  touchedSensitiveFieldIds,
  validateGroupValue,
  withDormantSensitiveSections,
} from '@mgs/shared';
import type { FormFieldDefinition, FormTemplate, ReopenResponse } from '@mgs/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CasesService, CaseWithOffences } from '../cases/cases.service';

/**
 * UC-10: content-free lock reasons, grammar-correct for every status. The
 * old interpolation (`Cannot edit a ${status.toLowerCase()} form`) produced
 * "a archived" once ARCHIVED arrived — fixed as a drive-by while these
 * messages were being touched (stage-2 review note).
 */
function lockedReason(verb: string, status: string): string {
  return status === 'ARCHIVED'
    ? `Cannot ${verb} this version — it has been superseded by an amendment.`
    : `Cannot ${verb} a ${status.toLowerCase()} form.`;
}


type DraftWithCase = FormDraft & { case: CaseWithOffences | null };

const CASE_INCLUDE = { case: { include: { offences: true } } } as const;

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
  ) {}

  /**
   * UC-01 form initiation. If a case link is requested but the case is not
   * accessible to the user, the draft is created standalone and the response
   * carries a warning for the client banner (alternative flow 9).
   */
  async create(user: User, req: CreateDraftRequest): Promise<CreateDraftResponse> {
    const template = getFormTemplate(req.formCode);
    if (!template) {
      throw new BadRequestException(`Unknown form code: ${req.formCode}`);
    }

    let caseId: string | null = null;
    let caseLinkWarning: string | undefined;
    if (req.caseId) {
      const linked = await this.cases.findForUser(user.id, req.caseId);
      if (linked) {
        caseId = linked.id;
      } else {
        caseLinkWarning =
          'The selected case is no longer accessible to you, so this form was started standalone. You can link it to a case later.';
      }
    }

    const draft = await this.prisma.formDraft.create({
      data: {
        formCode: template.code,
        templateVersion: template.templateVersion,
        userId: user.id,
        caseId,
      },
      include: CASE_INCLUDE,
    });

    await this.audit.record(user.id, 'FORM_INITIATED', draft.id, {
      formCode: template.code,
      templateVersion: template.templateVersion,
      caseLinked: caseId !== null,
      caseLinkDenied: caseLinkWarning !== undefined,
    });

    return { draft: await this.toDtoFor(user, draft, { includeSensitiveSection: true }), caseLinkWarning };
  }

  /** The user's in-progress drafts, most recently touched first. */
  async listForUser(user: User): Promise<FormDraftDto[]> {
    const drafts = await this.prisma.formDraft.findMany({
      // UC-08: a REVIEWED form is still in progress — it stays on the queue;
      // FINALISED and ARCHIVED leave it.
      where: { userId: user.id, status: { in: ['DRAFT', 'REVIEWED'] } },
      include: CASE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    // UC-07: list rows are redacted per user but carry no section block and log
    // no view — a listing never contains section content (PRD §4.6).
    return Promise.all(drafts.map((d) => this.toDtoFor(user, d)));
  }

  async getForUser(user: User, id: string): Promise<FormDraftDto> {
    const draft = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
      include: CASE_INCLUDE,
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    // UC-07: this is the response that delivers the section's content to a
    // permitted user, so it is the audited view (LER-1249/DoD 3).
    return this.toDtoFor(user, draft, { includeSensitiveSection: true, auditView: true });
  }

  /**
   * Saves field values. Optimistic concurrency: the update only applies if
   * the stored version still matches the client's baseVersion, so a stale
   * tab cannot silently overwrite newer work.
   */
  async update(user: User, id: string, req: UpdateDraftRequest): Promise<FormDraftDto> {
    if (req.values === null || typeof req.values !== 'object' || Array.isArray(req.values)) {
      throw new BadRequestException('values must be an object');
    }
    const existing = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      throw new NotFoundException('Draft not found');
    }
    if (existing.status !== 'DRAFT' && existing.status !== 'REVIEWED') {
      throw new ConflictException(lockedReason('edit', existing.status));
    }
    // UC-08 (open-questions F3): a review attests exactly the values it saw,
    // so editing a REVIEWED draft reverts it to DRAFT — recorded in this
    // save's audit metadata so the trail explains the reversion.
    const reviewInvalidated = existing.status === 'REVIEWED';
    this.assertDeclarationNotTampered(existing.formCode, req.values);

    const template = getFormTemplate(existing.formCode);
    // UC-07: the guard on the MG6D write path. Presence of a sensitive key is
    // what counts — the endpoint judges what the request ASKED to do, and it is
    // checked before shape validation so an unauthorised probe learns nothing
    // about what a valid body would have been.
    const touchedSensitive = template ? touchedSensitiveFieldIds(template, req.values) : [];
    if (touchedSensitive.length > 0) {
      await this.assertSensitiveEditAllowed(user, existing, req, touchedSensitive);
    }
    this.assertValueTypesStorable(template, req.values);
    this.assertGroupValuesValid(template, req.values);
    const previous = JSON.parse(existing.valuesJson) as Record<string, unknown>;
    // UC-07 merge-preserve: a sensitive key ABSENT from the request keeps its
    // stored value. Redaction strips these keys from what a locked user ever
    // sees, so without this their next wholesale save would erase the sensitive
    // schedule (uc-07 open-questions F1).
    const merged: Record<string, unknown> = { ...req.values };
    if (template) {
      for (const fieldId of sensitiveFieldIds(template)) {
        if (!(fieldId in merged) && fieldId in previous) {
          merged[fieldId] = previous[fieldId];
        }
      }
    }
    // Derived flags are computed from what the client sent, never taken from it.
    const values = this.withDerivedFlags(template, merged);

    const { count } = await this.prisma.formDraft.updateMany({
      where: { id, version: req.baseVersion },
      data: {
        valuesJson: JSON.stringify(values),
        autoFillJson: JSON.stringify(
          this.pruneProvenance(this.parseAutoFill(existing.autoFillJson), values),
        ),
        version: { increment: 1 },
        ...(reviewInvalidated ? { status: 'DRAFT' } : {}),
      },
    });
    if (count === 0) {
      throw new ConflictException(
        'This draft was updated elsewhere. Reload it to continue from the latest version.',
      );
    }

    const updated = (await this.prisma.formDraft.findUnique({
      where: { id },
      include: CASE_INCLUDE,
    })) as DraftWithCase;

    await this.audit.record(user.id, 'DRAFT_SAVED', id, {
      formCode: updated.formCode,
      version: updated.version,
      ...(reviewInvalidated ? { reviewInvalidated: true } : {}),
      // UC-03 requires advisory hearsay/opinion flags to be recorded whenever a
      // narrative is saved, so the decision to proceed despite them is auditable.
      ...this.narrativeAuditMetadata(updated.formCode, req.values),
      // UC-04: schedule size and sensitivity, so the audit trail shows how the
      // schedule grew and when sensitive material first appeared.
      ...this.scheduleAuditMetadata(template, values),
      // UC-05: what validation found at this save. Counts only — never a field
      // value and never a failing string.
      ...this.validationAuditMetadata(template, values, updated),
    });

    await this.recordCompleteness(user.id, id, template, values, previous);

    // UC-07: record the edit itself — only for keys whose stored value actually
    // changed. The access GRANT is already in the trail as the confirmation row,
    // so an unlock followed by no typing does not manufacture edit events.
    const changedSensitive = touchedSensitive.filter(
      (fieldId) => JSON.stringify(values[fieldId]) !== JSON.stringify(previous[fieldId]),
    );
    if (changedSensitive.length > 0) {
      await this.audit.record(user.id, 'SENSITIVE_SECTION_EDITED', id, {
        formCode: updated.formCode,
        fieldIds: changedSensitive,
        confirmationId: req.sensitiveConfirmationId,
      });
    }

    return this.toDtoFor(user, updated, { includeSensitiveSection: true });
  }

  /**
   * UC-07: the NestJS-layer gate on the MG6D write path (LER-1131/1245).
   *
   * Order matters and is deliberate: permission first, confirmation second, and
   * neither failure stores anything. The confirmation must belong to THIS user
   * and THIS draft and be of kind HANDLING_INSTRUCTIONS — a foreign, invented or
   * PII-kind id is exactly as rejected as none at all. 403 rather than 422
   * because these are authorisation failures, not shape problems (uc-07
   * open-questions D1); every rejection is audited with the caller's identity.
   */
  private async assertSensitiveEditAllowed(
    user: User,
    draft: FormDraft,
    req: UpdateDraftRequest,
    touched: string[],
  ): Promise<void> {
    if (!user.sensitiveMaterialAccess) {
      await this.audit.record(user.id, 'SENSITIVE_ACCESS_DENIED', draft.id, {
        formCode: draft.formCode,
        mode: 'edit',
        reason: 'no-permission',
        fieldIds: touched,
      });
      throw new ForbiddenException(
        `Editing the sensitive material section requires the ${SENSITIVE_PERMISSION_LEVEL} permission.`,
      );
    }

    const confirmationId = req.sensitiveConfirmationId;
    const confirmation =
      typeof confirmationId === 'string' && confirmationId !== ''
        ? await this.prisma.sensitiveAcknowledgement.findFirst({
            where: {
              id: confirmationId,
              userId: user.id,
              draftId: draft.id,
              kind: 'HANDLING_INSTRUCTIONS',
            },
            select: { id: true },
          })
        : null;
    if (!confirmation) {
      await this.audit.record(user.id, 'SENSITIVE_ACCESS_DENIED', draft.id, {
        formCode: draft.formCode,
        mode: 'edit',
        reason: 'no-confirmation',
        fieldIds: touched,
      });
      throw new ForbiddenException(
        'Editing the sensitive material section requires a recorded confirmation of the handling instructions for this draft.',
      );
    }
  }

  /**
   * UC-07: records a handling-instructions confirmation or a PII-steps
   * acknowledgement (LER-1243/1246). Per-user, persisted, append-only; each row
   * records the hash pin of the wording it acknowledged, which startup
   * integrity has already proven matches the shipped wording.
   */
  async recordSensitiveConfirmation(
    user: User,
    id: string,
    body: unknown,
  ): Promise<SensitiveConfirmResponse> {
    if (!isSensitiveConfirmRequest(body)) {
      throw new UnprocessableEntityException(
        "kind is required and must be 'HANDLING_INSTRUCTIONS' or 'PII_STEPS'.",
      );
    }
    const draft = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
      select: { id: true, formCode: true, valuesJson: true },
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    const template = getFormTemplate(draft.formCode);
    if (!template || !hasSensitiveSection(template)) {
      throw new BadRequestException('This form has no sensitive material section.');
    }
    if (!user.sensitiveMaterialAccess) {
      await this.audit.record(user.id, 'SENSITIVE_ACCESS_DENIED', draft.id, {
        formCode: draft.formCode,
        mode: 'confirm',
        reason: 'no-permission',
      });
      throw new ForbiddenException(
        `Confirming the handling instructions requires the ${SENSITIVE_PERMISSION_LEVEL} permission.`,
      );
    }
    const values = JSON.parse(draft.valuesJson) as Record<string, unknown>;
    if (!isSensitiveSectionActive(template, values)) {
      // A confirmation for a section that is not there is a client bug; a row
      // for it would put an untruth in a trail that exists to be believed.
      throw new ConflictException(
        'The sensitive material section is not active on this draft, so there is nothing to confirm.',
      );
    }

    const kind = body.kind;
    const wordingHash = kind === 'HANDLING_INSTRUCTIONS' ? SENSITIVE_HANDLING_SHA256 : PII_STEPS_SHA256;
    const row = await this.prisma.sensitiveAcknowledgement.create({
      data: { userId: user.id, draftId: draft.id, kind, wordingHash },
    });
    await this.audit.record(
      user.id,
      kind === 'HANDLING_INSTRUCTIONS' ? 'SENSITIVE_INSTRUCTIONS_CONFIRMED' : 'SENSITIVE_PII_ACKNOWLEDGED',
      draft.id,
      { formCode: draft.formCode, wordingHash },
    );
    return { id: row.id, kind, recordedAt: row.createdAt.toISOString() };
  }

  /**
   * UC-07: the non-sensitive schedule export (LER-1248/DoD 4). Owner-scoped and
   * deliberately NOT permission-gated: by construction it contains nothing
   * sensitive — the one shared builder excludes sensitive rows and the whole
   * sensitive section. Audited with counts, never content.
   */
  async exportNonSensitiveSchedule(
    user: User,
    id: string,
  ): Promise<{ filename: string; csv: string }> {
    const draft = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
      select: { id: true, formCode: true, valuesJson: true },
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    const template = getFormTemplate(draft.formCode);
    if (!template) {
      throw new BadRequestException(`Unknown form code: ${draft.formCode}`);
    }
    const values = JSON.parse(draft.valuesJson) as Record<string, unknown>;
    const result = buildNonSensitiveScheduleCsv(template, values);
    if (!result) {
      throw new BadRequestException('This form has no schedule to export.');
    }
    await this.audit.record(user.id, 'SCHEDULE_EXPORTED', draft.id, {
      formCode: draft.formCode,
      includedRows: result.includedRows,
      excludedSensitiveRows: result.excludedSensitiveRows,
    });
    // Opaque id only — no case data ever appears in a file name.
    return { filename: `non-sensitive-schedule-${draft.id}.csv`, csv: result.csv };
  }

  /**
   * UC-06: records an accepted language-assistance suggestion.
   *
   * Deliberately narrow. It writes ONE audit row and touches nothing else — not
   * the draft's values, not its version, not its timestamps. The narrative is
   * saved by the ordinary autosave PATCH, so this endpoint has no reason to be
   * able to change a draft and does not.
   *
   * The metadata is `{ fieldId, promptId, kind, suggestionText }`. The suggestion
   * text is there because the scope's post-condition requires it — "All Insert
   * actions logged in the form audit trail with the suggestion text" — and it is
   * the assistant's own wording, not the witness's. The narrative itself is never
   * sent to this endpoint and never recorded; a check asserts that.
   */
  async recordLanguageInsert(user: User, id: string, body: unknown): Promise<void> {
    if (!isLanguageInsertRequest(body)) {
      throw new UnprocessableEntityException(
        'fieldId, promptId, kind and suggestionText are required, and kind must be informal, phrase or completeness.',
      );
    }
    const draft = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
      select: { id: true, formCode: true },
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    await this.audit.record(user.id, 'LANGUAGE_SUGGESTION_INSERTED', draft.id, {
      formCode: draft.formCode,
      fieldId: body.fieldId,
      promptId: body.promptId,
      kind: body.kind,
      suggestionText: body.suggestionText,
    });
  }

  /**
   * UC-05 type-shape guard: rejects a value whose JS type cannot be stored for
   * its field kind, with 422 — the same class of guard as the group and
   * declaration checks, and for the same reason: it protects the store.
   *
   * Deliberately narrow. Semantic validation (a wrongly formatted URN, a missing
   * required field, contradictory dates) NEVER rejects a save: a form is invalid
   * for most of the time a human is filling it in, and autosave fires 1.5s after
   * a keystroke, so rejecting would break the product.
   *
   * It is narrower still than UC-05's story asked for, and the reason is worth
   * recording: an unparseable date leaves the string 'invalid' in the control
   * (IsoDateAdapter's sentinel, which is how Material raises matDatepickerParse),
   * and autosave legitimately saves that. A "dates must be ISO" rule would
   * therefore reject something that already saves today. So the guard checks only
   * what no client can legitimately send: a structure where a scalar belongs, or
   * a non-boolean tick.
   */
  private assertValueTypesStorable(
    template: FormTemplate | undefined,
    values: Record<string, unknown>,
  ): void {
    if (!template) return;
    for (const field of template.fields) {
      if (!(field.id in values)) continue;
      const value = values[field.id];
      if (value === null || value === undefined) continue;

      if (field.type === 'group') continue; // shape-checked by validateGroupValue

      if (typeof value === 'object') {
        throw new UnprocessableEntityException(
          `${field.id} must be a single value, not ${Array.isArray(value) ? 'a list' : 'an object'}`,
        );
      }
      if (field.type === 'checkbox' && typeof value !== 'boolean') {
        throw new UnprocessableEntityException(`${field.id} must be true or false`);
      }
    }
  }

  /**
   * UC-05 client/server parity. The counts come from the SAME
   * `validateForm` the browser displays, so the two cannot disagree about what
   * is wrong — this closes the gap the README has admitted since UC-01, where
   * the declarative rules ran only in the browser.
   *
   * Cross-field rules that compare against a case datum need the case, which is
   * why this runs after the draft is re-read with its case included.
   */
  private validationAuditMetadata(
    template: FormTemplate | undefined,
    values: Record<string, unknown>,
    draft: DraftWithCase,
  ): Record<string, unknown> {
    if (!template) return {};
    try {
      const caseDto = draft.case ? this.cases.toDto(draft.case) : null;
      // UC-07 parity: a never-opened MG6D has no stored key, but to the server
      // that IS an empty mandatory schedule, so the counts here must say so —
      // the same normalisation the UC-08 review engine applies, so the two
      // trails cannot disagree. This can legitimately exceed what a pre-unlock
      // client displays: the server counts stored truth, a locked client
      // honestly declines to guess at it (see withDormantSensitiveSections).
      return countFindings(
        validateForm(template, withDormantSensitiveSections(template, values), caseDto),
      );
    } catch {
      // Validation is advisory to the save path. Never fail a save because
      // counting what is wrong with it went wrong.
      return {};
    }
  }

  /**
   * UC-04: rejects a malformed repeating-group value with 422, following the
   * MG11 declaration guard's precedent. The row ids reach audit rows, so a row
   * without a stable id — or two rows sharing one — would break the link between
   * a recorded decision and the material it was made about. Enforced here and
   * not only in the browser because the endpoint is the real boundary.
   */
  private assertGroupValuesValid(
    template: FormTemplate | undefined,
    values: Record<string, unknown>,
  ): void {
    for (const field of this.groupFields(template)) {
      if (!(field.id in values)) continue;
      const reason = validateGroupValue(field, values[field.id]);
      if (reason) {
        throw new UnprocessableEntityException(reason);
      }
    }
  }

  /**
   * Recomputes the derived sensitivity flag from the rows themselves. Whatever
   * the client sent under that key is discarded: it is derived, never editable,
   * and it is removed rather than set false when the last sensitive row goes —
   * a flag that latches on would over-report the case for as long as the draft
   * lives.
   */
  private withDerivedFlags(
    template: FormTemplate | undefined,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const groups = this.groupFields(template);
    if (groups.length === 0) return values;

    const next = { ...values };
    delete next[SENSITIVE_MATERIAL_FLAG_KEY];
    if (groups.some((field) => hasSensitiveRow(field, next[field.id]))) {
      next[SENSITIVE_MATERIAL_FLAG_KEY] = true;
    }
    return next;
  }

  /**
   * Row counts per schedule, plus the sensitivity flag.
   *
   * Keyed by field id rather than the PRD's literal `unusedMaterialItemCount`:
   * the same engine serves MG12 and the MG6C/D schedules, and a form-specific
   * key in generic metadata would have to be renamed the moment a second
   * schedule exists. The count is still there for anyone reading the trail.
   */
  private scheduleAuditMetadata(
    template: FormTemplate | undefined,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const groups = this.groupFields(template);
    if (groups.length === 0) return {};
    const counts: Record<string, number> = {};
    for (const field of groups) {
      counts[field.id] = asRows(values[field.id]).length;
    }
    return {
      scheduleItemCounts: counts,
      [SENSITIVE_MATERIAL_FLAG_KEY]: values[SENSITIVE_MATERIAL_FLAG_KEY] === true,
    };
  }

  /**
   * UC-04 completeness. Advisory only — it never blocks the save, and its result
   * is recorded whether or not the schedule looked sparse.
   *
   * Written only when the schedule's size or its complexity band actually
   * changed. Autosave fires 1.5s after any keystroke, so recording on every save
   * would bury the trail under identical rows from someone editing a
   * description, and a trail nobody can read is not an audit trail.
   */
  private async recordCompleteness(
    userId: string,
    draftId: string,
    template: FormTemplate | undefined,
    values: Record<string, unknown>,
    previous: Record<string, unknown>,
  ): Promise<void> {
    for (const field of this.groupFields(template)) {
      const itemCount = asRows(values[field.id]).length;
      const complexity = field.complexityFieldId ? values[field.complexityFieldId] : undefined;
      if (!shouldRunCompletenessCheck({ itemCount, complexity })) continue;

      const previousCount = asRows(previous[field.id]).length;
      const previousComplexity = field.complexityFieldId
        ? previous[field.complexityFieldId]
        : undefined;
      if (itemCount === previousCount && complexity === previousComplexity) continue;

      await this.audit.record(userId, 'COMPLETENESS_CHECKED', draftId, {
        fieldId: field.id,
        ...checkCompleteness({ itemCount, complexity }),
      });
    }
  }

  private groupFields(template: FormTemplate | undefined): FormFieldDefinition[] {
    return (template?.fields ?? []).filter((f) => f.type === 'group');
  }

  /**
   * UC-03 declaration integrity at the API boundary. The statutory wording is a
   * server-owned constant, so no client may supply it, and confirmation is a
   * boolean and nothing else — a truthy string must not pass for a tick.
   */
  private assertDeclarationNotTampered(formCode: string, values: Record<string, unknown>): void {
    for (const key of FORBIDDEN_DRAFT_VALUE_KEYS) {
      if (key in values) {
        throw new UnprocessableEntityException(
          `${key} is not accepted: the statutory declaration wording is server-owned and is never stored per draft.`,
        );
      }
    }

    if (formCode !== 'MG11') return;
    if (MG11_DECLARATION_FIELD_ID in values) {
      const confirmed = values[MG11_DECLARATION_FIELD_ID];
      if (typeof confirmed !== 'boolean') {
        throw new UnprocessableEntityException(
          `${MG11_DECLARATION_FIELD_ID} must be a boolean.`,
        );
      }
    }
  }

  /** Hearsay/opinion flags for an MG11 narrative, for the audit metadata. */
  private narrativeAuditMetadata(
    formCode: string,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    if (formCode !== 'MG11') return {};
    const narrative = values['statementText'];
    if (typeof narrative !== 'string' || narrative === '') return {};

    try {
      const flags = detectNarrativeFlags(narrative);
      if (flags.length === 0) return { hearsayFlagCount: 0 };
      return {
        hearsayFlagCount: flags.length,
        hearsayFlagPhrases: distinctFlaggedPhrases(flags),
      };
    } catch {
      // Detection is advisory; never fail a save because flagging broke.
      return {};
    }
  }

  /**
   * UC-02 auto-population. Fills mapped fields from the linked case, never
   * touching manual input: a field is fillable only while it is empty or
   * still holds the exact value a previous run wrote (pristine). Ambiguous
   * case data (e.g. several offence dates) is reported, not guessed.
   */
  async autoFill(user: User, id: string): Promise<AutoFillResultDto> {
    const draft = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
      include: CASE_INCLUDE,
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    if (draft.status !== 'DRAFT') {
      throw new ConflictException(lockedReason('auto-populate', draft.status));
    }
    if (!draft.case) {
      throw new BadRequestException(
        'This draft is not linked to a case, so there is no case file to populate from.',
      );
    }
    const template = getFormTemplate(draft.formCode);
    if (!template) {
      throw new BadRequestException(`Unknown form code: ${draft.formCode}`);
    }

    const caseDto = this.cases.toDto(draft.case);
    const values = JSON.parse(draft.valuesJson) as Record<string, unknown>;
    const autoFill = this.parseAutoFill(draft.autoFillJson);
    const written: Record<string, unknown> = {};
    const outcomes: AutoFillFieldOutcome[] = [];
    const mappedFields = template.fields.filter((f) => f.mapsTo);

    for (const field of mappedFields) {
      const current = values[field.id];
      const provenance = autoFill[field.id];
      const pristine =
        provenance !== undefined && JSON.stringify(current) === JSON.stringify(provenance.value);
      if (isFieldValueComplete(current) && !pristine) {
        continue; // manual value — never overwrite
      }

      const resolution = resolveCaseField(field.mapsTo!, caseDto);
      if (resolution.kind === 'value') {
        values[field.id] = resolution.value;
        written[field.id] = resolution.value;
        autoFill[field.id] = {
          source: 'case',
          caseUpdatedAt: caseDto.updatedAt,
          value: resolution.value,
          accepted: true,
        };
        outcomes.push({ fieldId: field.id, outcome: 'filled' });
      } else {
        outcomes.push({
          fieldId: field.id,
          outcome: resolution.kind,
          reason: resolution.reason,
        });
      }
    }

    // This run saw the case as it is now — refresh every surviving entry so
    // the "case file has changed" banner clears after a re-run.
    for (const fieldId of Object.keys(autoFill)) {
      autoFill[fieldId] = { ...autoFill[fieldId], caseUpdatedAt: caseDto.updatedAt };
    }

    const updated = (await this.prisma.formDraft.update({
      where: { id: draft.id },
      data: {
        valuesJson: JSON.stringify(values),
        autoFillJson: JSON.stringify(autoFill),
        version: { increment: 1 },
      },
      include: CASE_INCLUDE,
    })) as DraftWithCase;

    const summary = { filled: Object.keys(written).length, total: mappedFields.length };
    await this.audit.record(user.id, 'AUTO_POPULATED', draft.id, {
      formCode: draft.formCode,
      ...summary,
    });

    return {
      values: written,
      outcomes,
      summary,
      draft: await this.toDtoFor(user, updated, { includeSensitiveSection: true }),
    };
  }

  private parseAutoFill(json: string): Record<string, AutoFillProvenance> {
    return JSON.parse(json) as Record<string, AutoFillProvenance>;
  }

  /** Drops provenance for fields whose saved value no longer matches what
   *  auto-fill wrote — they have become manual values. */
  private pruneProvenance(
    autoFill: Record<string, AutoFillProvenance>,
    values: Record<string, unknown>,
  ): Record<string, AutoFillProvenance> {
    const pruned: Record<string, AutoFillProvenance> = {};
    for (const [fieldId, provenance] of Object.entries(autoFill)) {
      if (JSON.stringify(values[fieldId]) === JSON.stringify(provenance.value)) {
        pruned[fieldId] = provenance;
      }
    }
    return pruned;
  }

  /**
   * UC-08: run the quality suite for one draft (LER-1141/1255).
   *
   * The engine runs HERE, not in the browser: Check 3 needs the case's sibling
   * drafts and Check 4 the acknowledgement table, and UC-07's redaction must
   * never distort a result. Each check runs under its own time budget and in
   * its own try/catch — one check failing or timing out reports `incomplete`
   * with manual-verification guidance while the others stand (the scope's
   * partial-results behaviour). The outcome is audited on EVERY run.
   *
   * A clean run (no blocking, no incomplete) marks the draft REVIEWED; a run
   * with findings leaves status untouched. REVIEWED is evidence, not
   * authority — finalise() re-runs everything at the boundary regardless.
   */
  async review(user: User, id: string): Promise<QualityReviewResponse> {
    const draft = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
      include: CASE_INCLUDE,
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    if (draft.status !== 'DRAFT' && draft.status !== 'REVIEWED') {
      throw new ConflictException(lockedReason('review', draft.status));
    }
    const template = getFormTemplate(draft.formCode);
    if (!template) {
      throw new BadRequestException(`Unknown form code: ${draft.formCode}`);
    }
    const values = JSON.parse(draft.valuesJson) as Record<string, unknown>;
    // The scope's pre-condition: a form with nothing in it has nothing to review.
    const anyComplete = template.fields.some((f) => isFieldValueComplete(values[f.id]));
    if (!anyComplete) {
      throw new UnprocessableEntityException(
        'Complete at least one field before running the review.',
      );
    }

    const report = await this.runQualityChecks(user, draft, template, values);

    await this.audit.record(user.id, 'QUALITY_CHECK_COMPLETED', draft.id, {
      formCode: draft.formCode,
      blocking: report.blocking,
      advisory: report.advisory,
      incomplete: report.incomplete,
      perCheck: Object.fromEntries(report.checks.map((c) => [c.checkId, c.status])),
    });

    let status = draft.status as DraftStatus;
    if (report.readyToFinalise && draft.status === 'DRAFT') {
      // Guarded by version so a save racing the review cannot be marked
      // REVIEWED with values the engine never saw.
      const { count } = await this.prisma.formDraft.updateMany({
        where: { id: draft.id, version: draft.version, status: 'DRAFT' },
        data: { status: 'REVIEWED' },
      });
      if (count === 1) status = 'REVIEWED';
    } else if (report.readyToFinalise) {
      status = 'REVIEWED';
    }
    return { report, status };
  }

  /**
   * UC-08: the finalise gate (LER-1150/1266) — the UC-07 discipline applied to
   * the last transition of a form's life. It RE-RUNS the engine at the
   * boundary (a gate that trusts the client's earlier report is not a gate)
   * and refuses, with an audited FINALISE_REJECTED, while any blocking issue
   * stands, any check could not complete (a timeout is not a bypass,
   * open-questions Q5), or any advisory lacks an acknowledgement with a real
   * reason. Each accepted bypass is audited with the reason verbatim
   * (LER-1106/1265). Success sets FINALISED and audits FORM_FINALISED.
   */
  async finalise(user: User, id: string, body: unknown): Promise<FinaliseResponse> {
    if (!isFinaliseRequest(body)) {
      throw new UnprocessableEntityException(
        'advisoryAcknowledgements, when given, must be an array of { issueId, reason } strings.',
      );
    }
    const draft = await this.prisma.formDraft.findFirst({
      where: { id, userId: user.id },
      include: CASE_INCLUDE,
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    if (draft.status !== 'DRAFT' && draft.status !== 'REVIEWED') {
      throw new ConflictException(lockedReason('finalise', draft.status));
    }
    const template = getFormTemplate(draft.formCode);
    if (!template) {
      throw new BadRequestException(`Unknown form code: ${draft.formCode}`);
    }
    const values = JSON.parse(draft.valuesJson) as Record<string, unknown>;
    const report = await this.runQualityChecks(user, draft, template, values);
    const acks = body.advisoryAcknowledgements ?? [];
    const unacknowledged = unacknowledgedAdvisories(report, acks);

    if (report.blocking > 0 || report.incomplete > 0 || unacknowledged.length > 0) {
      await this.audit.record(user.id, 'FINALISE_REJECTED', draft.id, {
        formCode: draft.formCode,
        blocking: report.blocking,
        incomplete: report.incomplete,
        unacknowledgedAdvisories: unacknowledged.map((i) => i.id),
      });
      const reasons: string[] = [];
      if (report.blocking > 0) reasons.push(`${report.blocking} blocking issue(s) outstanding`);
      if (report.incomplete > 0) {
        reasons.push(`${report.incomplete} check(s) could not complete and must succeed first`);
      }
      if (unacknowledged.length > 0) {
        reasons.push(
          `${unacknowledged.length} advisory issue(s) not acknowledged with a reason`,
        );
      }
      throw new ConflictException(`This form cannot be finalised: ${reasons.join('; ')}.`);
    }

    // NOTHING reaches the trail until the transition has won. The guarded flip
    // goes first because each audit write commits immediately and independently:
    // written before it, the bypass rows survive a lost guard and the trail then
    // records bypasses on a form that was never finalised. Three interleavings
    // reach that `count === 0` branch — an autosave landing between this
    // method's read and its update, a second finalise from another tab (which
    // would also DUPLICATE the rows), and a concurrent review() flipping
    // DRAFT→REVIEWED — and this ordering closes all three: the loser throws
    // having written nothing. The residual risk it accepts (a crash between the
    // flip and the audit writes leaves a finalised form missing bypass rows) is
    // the same audit-failure risk AuditService's never-fatal contract already
    // accepts everywhere. Deliberately NOT a $transaction: inside one, a failed
    // audit insert would abort the finalisation, inverting that contract — see
    // uc-08 open-questions Q8, flagged for the LER-1189 security review.
    const advisories = advisoriesOf(report);
    const { count } = await this.prisma.formDraft.updateMany({
      where: { id: draft.id, version: draft.version, status: draft.status },
      data: { status: 'FINALISED' },
    });
    if (count === 0) {
      throw new ConflictException(
        'This draft was updated while finalising. Review it again from the latest version.',
      );
    }

    const ackById = new Map(acks.map((a) => [a.issueId, a.reason]));
    for (const issue of advisories) {
      await this.audit.record(user.id, 'ADVISORY_BYPASSED', draft.id, {
        issueId: issue.id,
        checkId: issue.checkId,
        fieldId: issue.fieldId,
        reason: ackById.get(issue.id),
      });
    }
    await this.audit.record(user.id, 'FORM_FINALISED', draft.id, {
      formCode: draft.formCode,
      advisoriesBypassed: advisories.length,
    });
    return { status: 'FINALISED', report };
  }

  /**
   * UC-10: reopen a finalised form for amendment (LER-1174/1175). One
   * transaction creates the editable copy AND supersedes the source — the
   * lock is the reopen's own act, not a later mint's side effect. Guards,
   * all API-level and content-free (stage-2 review, condition 3):
   * superseded → 409; not finalised → 409; an open amendment already on the
   * lineage → 409. The values copy is wholesale (sensitive keys included —
   * the copy holds exactly what the original holds; UC-07's read rules apply
   * to it identically from its first save).
   */
  async reopen(user: User, id: string): Promise<ReopenResponse> {
    const { copy, lineageId, sourceId } = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.formDraft.findFirst({ where: { id, userId: user.id } });
      if (!draft) {
        throw new NotFoundException('Draft not found');
      }
      if (draft.status === 'ARCHIVED') {
        throw new ConflictException(
          'This version has been superseded by an amendment — only the current version of a form can be reopened.',
        );
      }
      if (draft.status !== 'FINALISED') {
        throw new ConflictException('Only a finalised form can be reopened for amendment.');
      }
      const lineageId = draft.lineageId ?? draft.id;
      const open = await tx.formDraft.findFirst({
        where: { lineageId, status: { in: ['DRAFT', 'REVIEWED'] } },
        select: { id: true },
      });
      if (open) {
        throw new ConflictException(
          'An amendment of this form is already open — continue or finalise that copy first.',
        );
      }
      if (!draft.lineageId) {
        await tx.formDraft.update({ where: { id: draft.id }, data: { lineageId } });
      }
      const copy = await tx.formDraft.create({
        data: {
          formCode: draft.formCode,
          templateVersion: draft.templateVersion,
          valuesJson: draft.valuesJson,
          autoFillJson: draft.autoFillJson,
          userId: user.id,
          caseId: draft.caseId,
          lineageId,
          amendedFromId: draft.id,
        },
      });
      // Guarded flip: a concurrent reopen from another tab loses here rather
      // than forking the lineage.
      const flipped = await tx.formDraft.updateMany({
        where: { id: draft.id, status: 'FINALISED' },
        data: { status: 'ARCHIVED' },
      });
      if (flipped.count !== 1) {
        throw new ConflictException('The form changed while reopening — retry.');
      }
      return { copy, lineageId, sourceId: draft.id };
    });
    await this.audit.record(user.id, 'FORM_REOPENED', sourceId, {
      newDraftId: copy.id,
      lineageId,
    });
    return { draftId: copy.id, lineageId };
  }

  /**
   * UC-09: the generation gate. Loads the caller's own draft and re-runs the
   * quality engine server-side — a client's claim that its review passed is
   * never trusted (PRD §5). Returns everything the render pipeline needs;
   * throws 404 for a draft the caller does not own, 409 while the engine is
   * not clean (`readyToFinalise`: no blocking issues, every check complete —
   * advisories gate FINALISATION, not generation of a draft-banded document).
   */
  async gateForGeneration(
    user: User,
    draftId: string,
  ): Promise<{ draft: DraftWithCase; template: FormTemplate; values: Record<string, unknown> }> {
    const draft = await this.prisma.formDraft.findFirst({
      where: { id: draftId, userId: user.id },
      include: CASE_INCLUDE,
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    // UC-10: a superseded version is history — generating from it would mint
    // duplicate versions from stale content. Checked BEFORE the quality gate
    // so the refusal is unconditional (stage-2 review: this guard predates
    // any code that can flip a draft to ARCHIVED, by one commit, on purpose).
    if (draft.status === 'ARCHIVED') {
      throw new ConflictException(
        'This version has been superseded by an amendment — generate documents from the current version of the form.',
      );
    }
    const template = getFormTemplate(draft.formCode);
    if (!template) {
      throw new BadRequestException(`Unknown form code: ${draft.formCode}`);
    }
    const values = JSON.parse(draft.valuesJson) as Record<string, unknown>;
    const report = await this.runQualityChecks(user, draft, template, values);
    if (!report.readyToFinalise) {
      throw new ConflictException(
        'The form does not pass the quality review — resolve the blocking issues and re-run the review before generating a document.',
      );
    }
    return { draft, template, values };
  }

  /**
   * The four checks, each isolated in its own budget (QUALITY_CHECK_TIMEOUT_MS)
   * and try/catch: one check's failure is ITS `incomplete` result, never the
   * suite's. Data the checks need (sibling drafts, acknowledgement state) is
   * fetched inside the budget so a slow query times out as the check it
   * belongs to.
   */
  private async runQualityChecks(
    user: User,
    draft: DraftWithCase,
    template: FormTemplate,
    values: Record<string, unknown>,
  ): Promise<QualityReport> {
    const caseDto = draft.case ? this.cases.toDto(draft.case) : null;

    const budget = async (
      checkId: QualityCheckResult['checkId'],
      guidance: string,
      run: () => Promise<{ issues: QualityReport['checks'][0]['issues']; note?: string }>,
    ): Promise<QualityCheckResult> => {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${checkId} timed out`)),
            QUALITY_CHECK_TIMEOUT_MS,
          ).unref?.(),
        );
        const { issues, note } = await Promise.race([run(), timeout]);
        return { checkId, status: issues.length === 0 ? 'clean' : 'issues', issues, note };
      } catch {
        return {
          checkId,
          status: 'incomplete',
          issues: [],
          guidance: `${QUALITY_CHECK_TITLES[checkId]} could not complete — verify this aspect manually. Finalisation stays blocked until a full run succeeds.`,
        };
      }
    };

    const checks = await Promise.all([
      budget('completeness', '', async () => ({
        issues: checkRequiredCompleteness(template, values),
      })),
      budget('dateLogic', '', async () => ({
        issues: checkDateLogic(template, values, caseDto),
      })),
      budget('crossForm', '', async () => {
        if (!draft.caseId) return checkCrossForm(template, values, null, getFormTemplate);
        const rows = await this.prisma.formDraft.findMany({
          where: { caseId: draft.caseId, userId: user.id, id: { not: draft.id } },
          select: { id: true, formCode: true, valuesJson: true },
        });
        const siblings = rows.map((r) => ({
          draftId: r.id,
          formCode: r.formCode,
          values: JSON.parse(r.valuesJson) as Record<string, unknown>,
        }));
        return checkCrossForm(template, values, siblings, getFormTemplate);
      }),
      budget('sensitiveHandling', '', async () => {
        const confirmed =
          (await this.prisma.sensitiveAcknowledgement.findFirst({
            where: { draftId: draft.id, kind: 'HANDLING_INSTRUCTIONS' },
            select: { id: true },
          })) !== null;
        return { issues: checkSensitiveHandling(template, values, confirmed) };
      }),
    ]);
    return assembleReport(checks);
  }

  /**
   * UC-07: the DTO as one specific user may see it.
   *
   * Redaction is REMOVAL, server-side: a user without the permission never
   * receives a sensitive-declared value on any path — list, single get, save
   * response or autofill response — because content that reached the client is
   * not locked (LER-1252). The derived flag and the section block survive so
   * the locked state can render honestly.
   *
   * `includeSensitiveSection` attaches the computed section block (single-draft
   * responses); `auditView` records the view — set only on the single GET,
   * which is the response that actually delivers the section's content.
   */
  private async toDtoFor(
    user: User,
    draft: DraftWithCase,
    options: { includeSensitiveSection?: boolean; auditView?: boolean } = {},
  ): Promise<FormDraftDto> {
    const dto = this.toDto(draft);
    const template = getFormTemplate(draft.formCode);
    if (!template || !hasSensitiveSection(template)) return dto;

    if (options.includeSensitiveSection) {
      // Computed from the UNREDACTED values: the item count and activation are
      // facts about the draft, stated as counts, never as content.
      dto.sensitiveSection = await this.sensitiveSectionFor(user, draft.id, template, dto.values);
    }
    if (!user.sensitiveMaterialAccess) {
      dto.values = redactSensitiveValues(template, dto.values);
    } else if (options.auditView && dto.values[SENSITIVE_MATERIAL_FLAG_KEY] === true) {
      await this.audit.record(user.id, 'SENSITIVE_SECTION_VIEWED', draft.id, {
        formCode: draft.formCode,
      });
    }
    return dto;
  }

  /** The SensitiveSectionDto for one user on one draft — see api.types.ts. */
  private async sensitiveSectionFor(
    user: User,
    draftId: string,
    template: FormTemplate,
    values: Record<string, unknown>,
  ): Promise<SensitiveSectionDto> {
    const holders = await this.prisma.user.findMany({
      where: { sensitiveMaterialAccess: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    const sensitiveGroupIds = template.fields
      .filter((f) => f.sensitive === true && f.type === 'group')
      .map((f) => f.id);
    const base: SensitiveSectionDto = {
      active: isSensitiveSectionActive(template, values),
      permitted: user.sensitiveMaterialAccess,
      requiredPermissionLevel: SENSITIVE_PERMISSION_LEVEL,
      permissionHolders: holders.map((h) => h.name),
      sensitiveItemCount: sensitiveGroupIds.reduce((n, id) => n + asRows(values[id]).length, 0),
    };
    if (!base.permitted) return base;

    const piiAck = await this.prisma.sensitiveAcknowledgement.findFirst({
      where: { draftId, userId: user.id, kind: 'PII_STEPS' },
      select: { id: true },
    });
    return {
      ...base,
      handlingInstructions: SENSITIVE_HANDLING_INSTRUCTIONS.map((s) => ({ ...s })),
      handlingNotice: SENSITIVE_HANDLING_NOTICE,
      wordingHash: SENSITIVE_HANDLING_SHA256,
      piiSteps: PII_STEPS.map((s) => ({ ...s })),
      practiceDirection: { ...PII_PRACTICE_DIRECTION },
      piiAcknowledged: piiAck !== null,
    };
  }

  private toDto(draft: DraftWithCase): FormDraftDto {
    return {
      id: draft.id,
      formCode: draft.formCode,
      templateVersion: draft.templateVersion,
      status: draft.status as DraftStatus,
      version: draft.version,
      values: JSON.parse(draft.valuesJson) as Record<string, unknown>,
      autoFill: this.parseAutoFill(draft.autoFillJson),
      caseId: draft.caseId,
      case: draft.case ? this.cases.toDto(draft.case) : null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}

import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  FormFieldDefinition,
  GROUP_ROW_ID_KEY,
  SensitiveSectionDto,
  asRows,
} from '@mgs/shared';
import { DraftsService } from '../../../core/services/drafts.service';
import { SensitiveAccessSession } from './sensitive-access-session';

/**
 * UC-07: the MG6D sensitive-material block — banner, lock, handling
 * instructions, confirmation gate and PII reminder panel.
 *
 * The component renders the section's CHROME and gate; the editable fields
 * themselves are rendered by DynamicForm's ordinary loop, which includes them
 * only after this component reports the unlock — pre-confirmation there is no
 * form control for the section at all, which is what makes the UI genuinely
 * unable to bypass the gate (LER-1244).
 *
 * States, driven by the LIVE activation (the section appears the moment a row
 * is classified sensitive) and the server-computed permission block:
 *  - inactive             -> renders nothing (dormant declaration)
 *  - active, no dto yet   -> banner only (a fresh activation not yet saved)
 *  - active, not permitted-> banner + lock naming the level and its holders;
 *                            the content was never sent to this client
 *  - active, unconfirmed  -> banner + read-only instructions + read-only
 *                            preview of existing rows + confirm gate
 *  - unlocked             -> banner + PII reminder panel with acknowledgement;
 *                            the editable schedule renders below via the form
 */
@Component({
  selector: 'app-sensitive-section',
  imports: [MatButtonModule, MatCheckboxModule],
  templateUrl: './sensitive-section.html',
  styleUrl: './sensitive-section.scss',
})
export class SensitiveSection {
  /** Live activation, computed by DynamicForm from the current form value. */
  readonly active = input.required<boolean>();
  /** Server-computed block from the draft DTO; null while none has arrived. */
  readonly section = input<SensitiveSectionDto | null>(null);
  readonly draftId = input<string | null>(null);
  /** The sensitive fields, for the read-only pre-confirmation preview. */
  readonly fields = input<readonly FormFieldDefinition[]>([]);
  /** The draft's stored values (permitted users receive the sensitive keys). */
  readonly values = input<Record<string, unknown>>({});
  /** Fired with the confirmation id once the gate is passed. */
  readonly unlocked = output<string>();

  private readonly drafts = inject(DraftsService);
  protected readonly session = inject(SensitiveAccessSession);

  protected readonly readConfirmed = signal(false);
  protected readonly confirming = signal(false);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly acknowledgingPii = signal(false);
  /** Local overlay over the DTO's piiAcknowledged after a successful POST. */
  private readonly piiAckedNow = signal(false);

  protected readonly permitted = computed(() => this.section()?.permitted === true);
  protected readonly isUnlocked = computed(() => {
    const id = this.draftId();
    return id !== null && this.session.isUnlocked(id);
  });
  protected readonly piiAcknowledged = computed(
    () => this.piiAckedNow() || this.section()?.piiAcknowledged === true,
  );

  /** "Ask Alex Marlowe" — or the honest empty case. */
  protected readonly holdersLine = computed(() => {
    const holders = this.section()?.permissionHolders ?? [];
    return holders.length > 0
      ? `In this firm it is held by: ${holders.join(', ')}.`
      : 'Nobody in this firm currently holds it.';
  });

  /** Read-only preview rows for the pre-confirmation state. */
  protected readonly previewRows = computed(() => {
    return this.fields()
      .filter((f) => f.type === 'group')
      .map((field) => ({
        field,
        columns: field.columns ?? [],
        rows: asRows(this.values()[field.id]).map((row) =>
          (field.columns ?? []).map((c) => {
            const v = row[c.id];
            return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
          }),
        ),
      }));
  });

  protected confirm(): void {
    const draftId = this.draftId();
    if (!draftId || !this.readConfirmed() || this.confirming()) return;
    this.confirming.set(true);
    this.confirmError.set(null);
    this.drafts.confirmSensitive(draftId, { kind: 'HANDLING_INSTRUCTIONS' }).subscribe({
      next: (res) => {
        this.confirming.set(false);
        this.session.unlock(draftId, res.id);
        this.unlocked.emit(res.id);
      },
      error: () => {
        this.confirming.set(false);
        // Nothing optimistic: the section stays locked and says why.
        this.confirmError.set(
          'The confirmation could not be recorded, so the section stays locked. Try again.',
        );
      },
    });
  }

  protected acknowledgePii(): void {
    const draftId = this.draftId();
    if (!draftId || this.acknowledgingPii() || this.piiAcknowledged()) return;
    this.acknowledgingPii.set(true);
    this.drafts.confirmSensitive(draftId, { kind: 'PII_STEPS' }).subscribe({
      next: () => {
        this.acknowledgingPii.set(false);
        this.piiAckedNow.set(true);
      },
      error: () => this.acknowledgingPii.set(false),
    });
  }
}

import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  AutoFillFieldOutcome,
  AutoFillProvenance,
  FormFieldDefinition,
  FormTemplate,
  GROUP_ROW_ID_KEY,
  GroupRow,
  SensitiveSectionDto,
  asRows,
  hasSensitiveRow,
  findDuplicateReferences,
  formatFor,
  isBlockingFormat,
  isFieldValueComplete,
  isGroupValueComplete,
  validateFieldFormat,
} from '@mgs/shared';
import { NarrativeField } from '../../features/form-fill/narrative-field/narrative-field';
import { SensitiveSection } from '../../features/form-fill/sensitive-section/sensitive-section';
import { SensitiveAccessSession } from '../../features/form-fill/sensitive-section/sensitive-access-session';
import { RowDeleteDialog, RowDeleteDialogData } from './row-delete-dialog';

interface FieldSection {
  title: string | null;
  fields: FormFieldDefinition[];
}

/** Only ISO dates are comparable; anything else is another validator's problem. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Disallows dates after today (e.g. dates of birth, statement dates). */
function noFutureDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    // Unparseable input carries the adapter's sentinel and already reports
    // matDatepickerParse — do not stack a second, misleading message on it.
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
    const today = new Date().toISOString().slice(0, 10);
    return value > today ? { futureDate: true } : null;
  };
}

/**
 * A required group must have at least one row with every required column filled.
 * The row controls' own validators cover the second half; this exists for the
 * first, because an empty FormArray is otherwise perfectly valid.
 */
function groupCompleteValidator(field: FormFieldDefinition): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    isGroupValueComplete(field, control.value) ? null : { groupIncomplete: true };
}

/**
 * No two rows may share this column's value. The rule lives in libs/shared so
 * the API, the UI and the tests agree on which row is the duplicate: the first
 * occurrence stays valid and later ones are flagged, so the user is pointed at
 * the row they just typed rather than at both.
 */
function uniqueInGroupValidator(columnId: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const row = control.parent as FormGroup | null;
    const array = row?.parent as FormArray | null;
    if (!row || !array) return null;
    const index = array.controls.indexOf(row);
    if (index < 0) return null;
    return findDuplicateReferences(asRows(array.getRawValue()), columnId).includes(index)
      ? { duplicateInGroup: true }
      : null;
  };
}

/**
 * Renders any FormTemplate from libs/shared as a reactive form.
 * Builds the FormGroup from the template's field definitions and emits it via
 * `formReady` so the host page can drive progress tracking and autosave.
 */
@Component({
  selector: 'app-dynamic-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    NarrativeField,
    SensitiveSection,
  ],
  templateUrl: './dynamic-form.html',
  styleUrl: './dynamic-form.scss',
})
export class DynamicForm implements OnInit {
  readonly template = input.required<FormTemplate>();
  readonly initialValues = input<Record<string, unknown>>({});
  /** UC-02 provenance map from the draft — drives "Auto-filled" badges. */
  readonly autoFill = input<Record<string, AutoFillProvenance>>({});
  /** UC-02 outcomes of the latest population run — drives skip notes. */
  readonly outcomes = input<AutoFillFieldOutcome[]>([]);
  /**
   * Render only these fields, in template order. The FormGroup is always built
   * from the whole template, so hidden fields keep their values and validators —
   * this only narrows what is displayed. Null renders everything (the default).
   * Used by the MG11 wizard (UC-03) to show one step at a time.
   */
  readonly visibleFieldIds = input<readonly string[] | null>(null);
  /**
   * Render the per-section headings. The MG11 wizard turns these off because its
   * step titles already group the fields, so the headings would just repeat them.
   */
  readonly showSectionTitles = input(true);
  /**
   * UC-06: the draft being edited, so an accepted language suggestion can be
   * recorded in the audit trail. Null renders everything exactly as before; only
   * the audit record is skipped.
   */
  readonly draftId = input<string | null>(null);
  /** UC-07: the server-computed sensitive-section block from the draft DTO. */
  readonly sensitiveSection = input<SensitiveSectionDto | null>(null);
  readonly formReady = output<FormGroup>();

  protected form!: FormGroup;

  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sensitiveAccess = inject(SensitiveAccessSession);

  /** UC-07: the declared sensitive fields (MG6D's section), template order. */
  protected readonly sensitiveFields = computed(() =>
    this.template().fields.filter((f) => f.sensitive === true),
  );

  /** The non-sensitive schedule whose classification column raises the flag. */
  private readonly sensitivityTrigger = computed(
    () =>
      this.template().fields.find(
        (f) => f.type === 'group' && f.sensitivityFlag !== undefined && f.sensitive !== true,
      ) ?? null,
  );

  /**
   * UC-07 live activation: recomputed on every value change so the section
   * appears the MOMENT a row is classified sensitive — no save round-trip,
   * no manual step, every time without exception (LER-1240/DoD 1).
   */
  protected readonly sensitiveActive = signal(false);

  /**
   * UC-07: whether this rendering context has passed the confirmation gate.
   * Until it flips, the sensitive fields have NO form controls — nothing to
   * type into and nothing for autosave to send (LER-1244), which is also why
   * `sections()` excludes them below.
   */
  protected readonly sensitiveUnlocked = signal(false);

  /** Fields grouped by their (optional) section headings, in template order. */
  protected readonly sections = computed<FieldSection[]>(() => {
    const visible = this.visibleFieldIds();
    const fields = (
      visible
        ? this.template().fields.filter((f) => visible.includes(f.id))
        : this.template().fields
    ).filter((f) => f.sensitive !== true || this.sensitiveUnlocked());

    const sections: FieldSection[] = [];
    for (const field of fields) {
      const last = sections.length > 0 ? sections[sections.length - 1] : undefined;
      if (!last || (field.section && field.section !== last.title)) {
        sections.push({ title: field.section ?? null, fields: [field] });
      } else {
        last.fields.push(field);
      }
    }
    return sections;
  });

  private readonly openHelp = signal<ReadonlySet<string>>(new Set());

  private readonly outcomeById = computed(
    () => new Map(this.outcomes().map((o) => [o.fieldId, o])),
  );

  ngOnInit(): void {
    this.form = this.buildForm(this.template(), this.initialValues());

    // UC-07: live activation, from the same shared rule the server derives the
    // stored flag with. Recomputed on every change so it also DEACTIVATES when
    // the last sensitive row goes (stored MG6D values stay, dormant).
    const updateActive = () => {
      const trigger = this.sensitivityTrigger();
      this.sensitiveActive.set(
        trigger ? hasSensitiveRow(trigger, this.form.get(trigger.id)?.value) : false,
      );
    };
    updateActive();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updateActive);

    this.formReady.emit(this.form);
  }

  /**
   * UC-07: the gate has been passed for this access — NOW the sensitive fields
   * get controls (seeded from the latest server values) and join the ordinary
   * autosave, whose PATCH carries the confirmation id from the session.
   */
  protected onSensitiveUnlocked(): void {
    for (const field of this.sensitiveFields()) {
      if (this.form.get(field.id)) continue;
      this.form.addControl(
        field.id,
        field.type === 'group'
          ? this.buildGroupArray(field, this.initialValues()[field.id])
          : new FormControl(
              this.initialValues()[field.id] ?? (field.type === 'checkbox' ? false : ''),
              this.validatorsFor(field),
            ),
      );
    }
    this.sensitiveUnlocked.set(true);
  }

  private buildForm(template: FormTemplate, values: Record<string, unknown>): FormGroup {
    const controls: Record<string, AbstractControl> = {};
    for (const field of template.fields) {
      // UC-07: sensitive fields are NOT built here. Their controls are added by
      // onSensitiveUnlocked() after the recorded confirmation — before that
      // there is nothing to edit and autosave has no key to send, so a locked
      // or unconfirmed client can never trip (or need) the API guard.
      if (field.sensitive === true) continue;
      controls[field.id] =
        field.type === 'group'
          ? this.buildGroupArray(field, values[field.id])
          : new FormControl(
              values[field.id] ?? (field.type === 'checkbox' ? false : ''),
              this.validatorsFor(field),
            );
    }
    return new FormGroup(controls);
  }

  /** A repeating group is a FormArray of row FormGroups, one per stored row. */
  private buildGroupArray(field: FormFieldDefinition, value: unknown): FormArray {
    const array = new FormArray(
      asRows(value).map((row) => this.buildRow(field, row)),
      field.required ? [groupCompleteValidator(field)] : [],
    );

    // Uniqueness spans rows, so editing one row can make another valid or
    // invalid. Angular only revalidates the control that changed, so the
    // unique columns are re-checked here — without emitting, or this would
    // recurse through its own subscription.
    const uniqueColumns = (field.columns ?? []).filter((c) => c.validation?.uniqueInGroup);
    if (uniqueColumns.length > 0) {
      array.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        for (const row of array.controls) {
          for (const column of uniqueColumns) {
            row.get(column.id)?.updateValueAndValidity({ emitEvent: false, onlySelf: true });
          }
        }
      });
    }
    return array;
  }

  /**
   * One row. `__id` is generated once and then travels with the control, so it
   * survives edits, reordering and renumbering — audit entries and (later) UC-07
   * sensitivity decisions attach to it, never to the displayed number.
   */
  private buildRow(field: FormFieldDefinition, row: GroupRow = {}): FormGroup {
    const controls: Record<string, FormControl> = {
      [GROUP_ROW_ID_KEY]: new FormControl(
        typeof row[GROUP_ROW_ID_KEY] === 'string' ? row[GROUP_ROW_ID_KEY] : crypto.randomUUID(),
      ),
    };
    for (const column of field.columns ?? []) {
      const validators = this.validatorsFor(column);
      if (column.validation?.uniqueInGroup) validators.push(uniqueInGroupValidator(column.id));
      controls[column.id] = new FormControl(
        row[column.id] ?? (column.type === 'checkbox' ? false : ''),
        validators,
      );
    }
    return new FormGroup(controls);
  }

  private validatorsFor(field: FormFieldDefinition): ValidatorFn[] {
    const validators: ValidatorFn[] = [];
    if (field.required) {
      validators.push(field.type === 'checkbox' ? Validators.requiredTrue : Validators.required);
    }
    const v = field.validation;
    if (v) {
      if (v.minLength !== undefined) validators.push(Validators.minLength(v.minLength));
      if (v.maxLength !== undefined) validators.push(Validators.maxLength(v.maxLength));
      if (v.pattern) validators.push(Validators.pattern(v.pattern));
      // UC-05: a named format becomes a hard validator ONLY when its provenance
      // entitles it to error severity. An advisory format renders as a hint and
      // must never invalidate the control — see isBlockingFormat.
      if (isBlockingFormat(field)) {
        validators.push(Validators.pattern(formatFor(field)!.pattern));
      }
      if (v.min !== undefined) validators.push(Validators.min(v.min));
      if (v.max !== undefined) validators.push(Validators.max(v.max));
      if (v.noFutureDate) validators.push(noFutureDateValidator());
    }
    return validators;
  }

  protected control(id: string): FormControl {
    return this.form.get(id) as FormControl;
  }

  /**
   * UC-06: whether this field gets the narrative treatment — the highlight layer
   * and the Legal Language Assistant.
   *
   * Read from the template's declaration and never inferred. Most of the 57
   * textareas across the eleven templates are not prose (`witnessAddress` holds
   * an address, `chargesList` holds charges), so inferring from `type` or `rows`
   * would attach a statement assistant to a postcode.
   */
  protected isNarrative(field: FormFieldDefinition): boolean {
    return field.type === 'textarea' && field.narrative === true;
  }

  // ── repeating groups ──────────────────────────────────────────────────────

  protected rowsOf(field: FormFieldDefinition): FormGroup[] {
    const array = this.form.get(field.id);
    return array instanceof FormArray ? (array.controls as FormGroup[]) : [];
  }

  protected rowIdOf(row: FormGroup): string {
    return row.get(GROUP_ROW_ID_KEY)?.value ?? '';
  }

  protected addRow(field: FormFieldDefinition): void {
    const array = this.form.get(field.id);
    if (!(array instanceof FormArray)) return;
    array.push(this.buildRow(field));
    array.markAsDirty();
  }

  /**
   * Deletion is confirmed first, because it destroys the row's data and changes
   * every later row's number. Cancel does nothing at all — not a re-render, not
   * a touch — so the form is left exactly as the user found it.
   */
  protected requestRowDelete(field: FormFieldDefinition, index: number): void {
    const array = this.form.get(field.id);
    if (!(array instanceof FormArray)) return;
    const data: RowDeleteDialogData = {
      ordinal: index + 1,
      summary: this.rowSummary(field, array.at(index) as FormGroup),
      renumbering: array.length - index - 1,
      noun: this.rowNoun(field),
    };
    this.dialog
      .open(RowDeleteDialog, { data, width: '460px', autoFocus: 'dialog' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed !== true) return;
        array.removeAt(index);
        array.markAsDirty();
      });
  }

  /**
   * Reorder by moving the control itself rather than rebuilding a row from its
   * value: the FormGroup instance carries `__id`, so identity survives the move.
   */
  protected moveRow(field: FormFieldDefinition, from: number, to: number): void {
    const array = this.form.get(field.id);
    if (!(array instanceof FormArray)) return;
    if (to < 0 || to >= array.length || from === to) return;
    const row = array.at(from);
    array.removeAt(from, { emitEvent: false });
    array.insert(to, row);
    array.markAsDirty();
  }

  /** The first text-ish column's value, used to name a row in the delete prompt. */
  private rowSummary(field: FormFieldDefinition, row: FormGroup): string | null {
    for (const column of field.columns ?? []) {
      const value = row.get(column.id)?.value;
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
    return null;
  }

  /** "Unused material schedule" -> "item". Groups may override with `rowNoun`. */
  protected rowNoun(field: FormFieldDefinition): string {
    return field.rowNoun ?? 'item';
  }

  protected rowControl(row: FormGroup, columnId: string): FormControl {
    return row.get(columnId) as FormControl;
  }

  /** The message for one cell, including the cross-row duplicate case. */
  protected cellError(
    field: FormFieldDefinition,
    column: FormFieldDefinition,
    row: FormGroup,
  ): string | null {
    const control = row.get(column.id);
    if (!control || control.valid || !control.touched) return null;
    if (control.hasError('duplicateInGroup')) {
      return `Already used by an earlier ${this.rowNoun(field)} — each must be unique`;
    }
    return this.messageFor(column, control);
  }

  /** Whether the group as a whole should read as incomplete. */
  protected groupError(field: FormFieldDefinition): string | null {
    const array = this.form.get(field.id);
    if (!(array instanceof FormArray) || !field.required) return null;
    if (array.length === 0 && array.touched) {
      return `Add at least one ${this.rowNoun(field)}`;
    }
    return null;
  }

  protected isHelpOpen(id: string): boolean {
    return this.openHelp().has(id);
  }

  protected toggleHelp(id: string): void {
    const next = new Set(this.openHelp());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.openHelp.set(next);
  }

  /** True while the field still holds exactly what auto-fill wrote — editing
   *  it (or clearing it) turns the value manual and the badge disappears. */
  protected isAutoFilled(field: FormFieldDefinition): boolean {
    const provenance = this.autoFill()[field.id];
    if (!provenance) return false;
    const control = this.control(field.id);
    if (!control || !isFieldValueComplete(control.value)) return false;
    return JSON.stringify(control.value) === JSON.stringify(provenance.value);
  }

  /**
   * UC-05: the advisory hint for a field whose format looks wrong.
   *
   * Advisory only — the control stays valid, progress is unaffected, and the
   * draft still saves. Shown on the same blur-gated basis as an error so the two
   * behave consistently.
   */
  protected advisoryHint(field: FormFieldDefinition): string | null {
    const control = this.form.get(field.id);
    if (!control) return null;
    // Deliberately NOT gated on `touched`, unlike an error. An advisory fires
    // only when there is a value to be wrong about, so it cannot nag an untouched
    // empty field — and a bad value restored from a saved draft should be flagged
    // as soon as it is on screen, not only after the user happens to visit it.
    const finding = validateFieldFormat(field, control.value);
    return finding && finding.severity === 'advisory' ? finding.message : null;
  }

  /**
   * UC-05: the format hint the scope asks for — "invalid format shows format
   * hint". Shown while a date field is focused and holds nothing usable, so it
   * guides before the value is wrong rather than only scolding afterwards.
   */
  protected formatHint(field: FormFieldDefinition): string | null {
    if (field.type !== 'date') return null;
    if (this.focusedField() !== field.id) return null;
    const control = this.form.get(field.id);
    const value = control?.value;
    const unusable = value === '' || value === null || value === undefined || value === 'invalid';
    return unusable ? 'Enter the date as DD/MM/YYYY' : null;
  }

  protected readonly focusedField = signal<string | null>(null);

  protected onFieldFocus(fieldId: string): void {
    this.focusedField.set(fieldId);
  }

  protected onFieldBlur(fieldId: string): void {
    if (this.focusedField() === fieldId) this.focusedField.set(null);
  }

  /** Reason a mapped field was not auto-filled — hidden once the user types. */
  protected autoFillNote(field: FormFieldDefinition): string | null {
    const outcome = this.outcomeById().get(field.id);
    if (!outcome || outcome.outcome === 'filled' || !outcome.reason) return null;
    const control = this.control(field.id);
    if (control && isFieldValueComplete(control.value)) return null;
    return outcome.reason;
  }

  protected clearField(field: FormFieldDefinition): void {
    const control = this.control(field.id);
    control.setValue(field.type === 'checkbox' ? false : '');
    control.markAsDirty();
  }

  protected errorMessage(field: FormFieldDefinition): string | null {
    const control = this.form.get(field.id);
    if (!control || control.valid || !control.touched) return null;
    return this.messageFor(field, control);
  }

  private messageFor(field: FormFieldDefinition, control: AbstractControl): string | null {
    // Checked before `required`: Material reports an unparseable date as an
    // empty value, so the required message would otherwise mask the real cause.
    if (control.hasError('matDatepickerParse')) {
      return 'Enter a real date as DD/MM/YYYY';
    }
    if (control.hasError('required') || control.hasError('requiredTrue')) {
      return 'This field is required';
    }
    if (control.hasError('minlength')) {
      return `Must be at least ${field.validation?.minLength} characters`;
    }
    if (control.hasError('maxlength')) {
      return `Must be at most ${field.validation?.maxLength} characters`;
    }
    if (control.hasError('pattern')) {
      // A named format carries its own message; only a raw `pattern` rule falls
      // back. Without this, converting a field to the registry would silently
      // downgrade "Enter a valid telephone number" to "Invalid format".
      return formatFor(field)?.hint ?? field.validation?.patternMessage ?? 'Invalid format';
    }
    if (control.hasError('min')) {
      return `Must be at least ${field.validation?.min}`;
    }
    if (control.hasError('max')) {
      return `Must be at most ${field.validation?.max}`;
    }
    if (control.hasError('futureDate')) {
      return 'Date cannot be in the future';
    }
    return 'Invalid value';
  }
}

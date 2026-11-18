import type { GaugeChanges } from '@/data';
import type { Curve } from '@/domain';

/**
 * The autosave of the gauge page. It has no React code, so that the unit
 * tests can run it with fake timers.
 *
 * - A choice (`change(…, 'now')`) saves at once. A text (`'later'`) saves
 *   after a quiet time, or at `flush()`, for example on blur or when the
 *   user leaves the page.
 * - It writes only the fields that the user changed, and only when the
 *   value is valid and differs from the stored value. So two members who
 *   change different fields do not overwrite each other.
 * - A new value from the server (`setStored`) does not change a field that
 *   the user changed and that is not saved yet (`isTouched`).
 */

/** The quiet time after the last key press, before a text saves. */
export const AUTOSAVE_DELAY_MS = 600;

export type AutosaveField = 'name' | 'repeatDays' | 'curve';

/** The fields of the gauge in the data. */
export interface StoredFields {
  name: string;
  repeatDays: number;
  curve: Curve;
}

/** The fields in the form. `repeatDays` is `null` when the free number is not valid. */
export interface DraftFields {
  name: string;
  repeatDays: number | null;
  curve: Curve;
}

/**
 * - `idle`: nothing saved yet on this page.
 * - `saving`: a change waits for the quiet time, or a write is not done.
 * - `saved`: all the writes are done.
 * - `error`: the last write failed. The change is not saved.
 */
export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  /** The error of the failed write, when `status` is `error`. */
  error: unknown;
}

export interface GaugeAutosaverOptions {
  /** Writes the changed fields. */
  write: (changes: GaugeChanges) => Promise<void>;
  /** Called on each change of the status. */
  onState: (state: AutosaveState) => void;
  /** The most characters in a name. A longer name does not save. */
  nameMax: number;
  delayMs?: number;
}

const FIELDS: readonly AutosaveField[] = ['name', 'repeatDays', 'curve'];

export class GaugeAutosaver {
  private stored: StoredFields;
  private readonly draft: DraftFields;
  private readonly touched = new Set<AutosaveField>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private open = 0;
  private savedOnce = false;
  private error: unknown = null;
  private failed = false;
  private stopped = false;
  private last: AutosaveStatus = 'idle';

  constructor(
    stored: StoredFields,
    private readonly options: GaugeAutosaverOptions,
  ) {
    this.stored = { ...stored };
    this.draft = { ...stored };
  }

  /** `true` while the user changed the field and the change is not written yet. */
  isTouched(field: AutosaveField): boolean {
    return this.touched.has(field);
  }

  /** Takes the newest values from the data, for example after a change of another member. */
  setStored(stored: StoredFields): void {
    this.stored = { ...stored };
    for (const field of FIELDS) {
      if (!this.touched.has(field)) this.setDraft(field, stored[field]);
    }
  }

  /** Records a change of the user. `now` saves at once; `later` saves after the quiet time. */
  change(patch: Partial<DraftFields>, when: 'now' | 'later'): void {
    if (this.stopped) return;
    for (const field of FIELDS) {
      if (field in patch) {
        this.setDraft(field, patch[field] as DraftFields[typeof field]);
        this.touched.add(field);
      }
    }
    if (when === 'now') {
      this.flush();
      return;
    }
    this.clearTimer();
    if (Object.keys(this.pendingChanges()).length > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.options.delayMs ?? AUTOSAVE_DELAY_MS);
    }
    this.emit();
  }

  /** Writes the pending changes now. The page calls it on blur and when the user leaves. */
  flush(): void {
    this.clearTimer();
    const changes = this.pendingChanges();
    const fields = Object.keys(changes) as AutosaveField[];
    if (fields.length === 0) {
      this.emit();
      return;
    }
    // The data shows the new values at once (the local cache), so the
    // fields are no longer touched, unless the write fails.
    this.stored = { ...this.stored, ...changes };
    fields.forEach((field) => this.touched.delete(field));
    this.track(this.options.write(changes), fields);
  }

  /**
   * Shows the status of another write of the page, for example a label.
   * `fields` become touched again if the write fails.
   */
  track(promise: Promise<unknown>, fields: readonly AutosaveField[] = []): void {
    this.open += 1;
    this.emit();
    promise.then(
      () => {
        this.open -= 1;
        this.savedOnce = true;
        this.failed = false;
        this.error = null;
        this.emit();
      },
      (error: unknown) => {
        this.open -= 1;
        this.failed = true;
        this.error = error;
        // Keep the text of the user, so that the next flush tries again.
        fields.forEach((field) => this.touched.add(field));
        this.emit();
      },
    );
  }

  /** Drops the pending changes, for example before a delete. */
  cancel(): void {
    this.clearTimer();
    this.touched.clear();
    this.stopped = true;
  }

  /** The valid changes of the touched fields that differ from the data. */
  pendingChanges(): GaugeChanges {
    const changes: GaugeChanges = {};
    if (this.touched.has('name')) {
      const name = this.draft.name.trim();
      if (name.length > 0 && name.length <= this.options.nameMax && name !== this.stored.name) changes.name = name;
    }
    if (this.touched.has('repeatDays')) {
      const days = this.draft.repeatDays;
      if (days !== null && Number.isInteger(days) && days >= 1 && days !== this.stored.repeatDays) {
        changes.repeatDays = days;
      }
    }
    if (this.touched.has('curve') && this.draft.curve !== this.stored.curve) changes.curve = this.draft.curve;
    return changes;
  }

  private setDraft<F extends AutosaveField>(field: F, value: DraftFields[F]): void {
    this.draft[field] = value;
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    const status: AutosaveStatus =
      this.timer !== null || this.open > 0
        ? 'saving'
        : this.failed
          ? 'error'
          : this.savedOnce
            ? 'saved'
            : 'idle';
    if (status === this.last && status !== 'error') return;
    this.last = status;
    this.options.onState({ status, error: status === 'error' ? this.error : null });
  }
}

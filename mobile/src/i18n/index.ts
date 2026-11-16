import { en, type Strings } from './en';
import { makeRelativeFormatter, type RelativeFormatter } from './format';

export type { Strings } from './en';
export * from './format';
export { errorMessage } from './errors';
export { dateLocale, type DateLocale, dateLocaleTag, readDateLocale } from './locale';
export { formatClockTime, formatReminderWhen, reminderContent, reminderNames, shortName } from './reminders';

/**
 * The text of the app. There is one language now. To add one, add a file
 * of the type `Strings` and pick it here from the device locale.
 */
export const t: Strings = en;

/** The relative time formatter for `t.locale`, or `null` when the engine has none. */
export const relativeFormatter: RelativeFormatter | null = makeRelativeFormatter(t.locale);

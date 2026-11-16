/**
 * TypeScript reads this file. Metro does not: it picks `scheduler.native.ts`
 * on iOS and Android, and `scheduler.web.ts` on the web. Both files export
 * the same names.
 */
export { configureForeground, devTools, onReminderTap, scheduler } from './scheduler.native';

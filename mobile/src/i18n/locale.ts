import { getCalendars, getLocales } from 'expo-localization';

/**
 * The locale for dates and times. The words stay in the language of the app
 * (English), but the order of the parts and the clock follow the device: in
 * France, "Sat, 14 Nov, 18:05". `hour12` is `undefined` when the device does
 * not say, so that `Intl` uses the default of the region.
 */
export interface DateLocale {
  tag: string;
  hour12?: boolean;
}

/**
 * Makes the locale tag for dates: the language of the app with the region of
 * the device, for example `en-FR`. Without a region, it gives the language.
 */
export function dateLocaleTag(language: string, region: string | null | undefined): string {
  return region && /^[A-Za-z]{2}$|^\d{3}$/.test(region) ? `${language}-${region.toUpperCase()}` : language;
}

/**
 * The `Intl` options for the hour and the minute. A 24-hour clock shows two
 * digits for the hour ("06:05"), a 12-hour clock does not ("6:05 PM"). The
 * 24-hour clock uses `hourCycle: 'h23'`, because `hour12: false` shows
 * midnight as "24:00" in some engines.
 */
export function clockOptions(locale: DateLocale): Intl.DateTimeFormatOptions {
  if (locale.hour12 === true) return { hour: 'numeric', minute: '2-digit', hour12: true };
  if (locale.hour12 === false) return { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return { hour: 'numeric', minute: '2-digit' };
}

/** Reads the region and the clock setting of the device. Falls back to plain English. */
export function readDateLocale(language = 'en'): DateLocale {
  try {
    const tag = dateLocaleTag(language, getLocales()[0]?.regionCode);
    const uses24 = getCalendars()[0]?.uses24hourClock;
    return { tag, hour12: typeof uses24 === 'boolean' ? !uses24 : undefined };
  } catch {
    return { tag: language };
  }
}

/** The date locale of the device, read one time at start. */
export const dateLocale: DateLocale = readDateLocale();

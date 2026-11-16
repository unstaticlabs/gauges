export interface DateTimeFieldProps {
  /** Epoch milliseconds. */
  value: number;
  onChange: (value: number) => void;
  /**
   * The current time, for example the shared `now`. The user cannot pick a
   * later time. The field also clamps each value to the clock at the moment
   * of the change, because `max` can be up to one minute old.
   */
  max: number;
  accessibilityLabel: string;
  testID?: string;
}

/** The shared clock updates each minute. This lets the user pick the current minute. */
export const MAX_SLACK_MS = 60 * 1000;

/** Limits a picked time to the clock now. Call it in event handlers only. */
export function clampToNow(ms: number): number {
  return Math.min(ms, Date.now());
}

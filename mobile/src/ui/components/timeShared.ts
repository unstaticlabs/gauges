export interface TimeOfDayValue {
  /** 0 to 23. */
  hour: number;
  /** 0 to 59. */
  minute: number;
}

export interface TimeFieldProps {
  value: TimeOfDayValue;
  onChange: (value: TimeOfDayValue) => void;
  accessibilityLabel: string;
  testID?: string;
}

/** The local hour and minute of a date. */
export function timeFromDate(date: Date): TimeOfDayValue {
  return { hour: date.getHours(), minute: date.getMinutes() };
}

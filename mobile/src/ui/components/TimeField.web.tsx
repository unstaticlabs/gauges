import { createElement } from 'react';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';
import type { TimeFieldProps } from './timeShared';

export type { TimeFieldProps } from './timeShared';

const pad = (n: number) => String(n).padStart(2, '0');

/** The web version of the time input. It uses the HTML `time` input. */
export function TimeField({ value, onChange, accessibilityLabel, testID }: TimeFieldProps) {
  const { colors, radius, spacing, typography, scheme } = useTheme();

  return createElement('input', {
    type: 'time',
    value: `${pad(value.hour)}:${pad(value.minute)}`,
    'aria-label': accessibilityLabel,
    'data-testid': testID,
    onChange: (event: { target: { value: string } }) => {
      const match = /^(\d{2}):(\d{2})/.exec(event.target.value);
      if (match) onChange({ hour: Number(match[1]), minute: Number(match[2]) });
    },
    style: {
      minHeight: TOUCH_TARGET,
      boxSizing: 'border-box',
      padding: `0 ${spacing.md}px`,
      border: 'none',
      borderRadius: radius.md,
      backgroundColor: colors.field,
      color: colors.text,
      colorScheme: scheme,
      fontFamily: 'inherit',
      fontSize: typography.body.fontSize,
    },
  });
}

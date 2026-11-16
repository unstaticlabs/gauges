import { createElement } from 'react';

import { fromLocalInputValue, toLocalInputValue } from '@/i18n';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';
import { clampToNow, MAX_SLACK_MS, type DateTimeFieldProps } from './dateTimeShared';

/**
 * The web version of the date and time input. It uses the HTML
 * `datetime-local` input, which each modern browser supports.
 */
export function DateTimeField({ value, onChange, max, accessibilityLabel, testID }: DateTimeFieldProps) {
  const { colors, radius, spacing, typography, scheme } = useTheme();

  return createElement('input', {
    type: 'datetime-local',
    value: toLocalInputValue(value),
    max: toLocalInputValue(max + MAX_SLACK_MS),
    'aria-label': accessibilityLabel,
    'data-testid': testID,
    onChange: (event: { target: { value: string } }) => {
      const next = fromLocalInputValue(event.target.value);
      if (next !== null) onChange(clampToNow(next));
    },
    style: {
      alignSelf: 'flex-start',
      minHeight: TOUCH_TARGET,
      boxSizing: 'border-box',
      padding: `0 ${spacing.md}px`,
      border: 'none',
      borderRadius: radius.md,
      backgroundColor: colors.field,
      color: colors.text,
      // Lets the browser draw its picker in the same mode as the app.
      colorScheme: scheme,
      fontFamily: 'inherit',
      fontSize: typography.body.fontSize,
    },
  });
}


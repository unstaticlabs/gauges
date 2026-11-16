import { StyleSheet } from 'react-native';

import { TOUCH_TARGET } from '@/ui/components';

/** The shape that the Google and the custom Apple button share. */
export const loginButtonStyles = StyleSheet.create({
  button: {
    minHeight: TOUCH_TARGET + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  logo: {
    width: 20,
    alignItems: 'center',
  },
});

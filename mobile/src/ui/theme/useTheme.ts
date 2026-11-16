import { useColorScheme } from 'react-native';

import { themes, type Theme } from './tokens';

/** Returns the theme for the color scheme of the device. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? themes.dark : themes.light;
}

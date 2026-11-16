import type { TextStyle } from 'react-native';

/** The three gauge colors of the old app. They are the same in both modes. */
export const gaugeColors = {
  green: '#2AC940',
  orange: '#FA9917',
  red: '#FF3366',
} as const;

export type GaugeTone = keyof typeof gaugeColors;

/** Spacing steps on a 4 pt grid. `page` is the side margin of the old app (20 pt). */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  page: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 22,
  full: 9999,
} as const;

/**
 * The font families. The app uses IBM Plex Sans, the font of the old app.
 * Each weight is a separate family, because Android does not pick a weight
 * of a custom font from `fontWeight`. `app/_layout.tsx` loads the files.
 */
export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
} as const;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontFamily' | 'letterSpacing'>;

/**
 * The type scale. `greeting` is the big title of the home screen: 1.5 em,
 * bold, and a line height of 140 %, as in the old app.
 */
export const typography = {
  greeting: { fontSize: 24, lineHeight: 34, fontFamily: fonts.bold },
  title: { fontSize: 28, lineHeight: 36, fontFamily: fonts.bold },
  heading: { fontSize: 20, lineHeight: 26, fontFamily: fonts.bold },
  /** The name of a gauge or a label in a list. */
  name: { fontSize: 18, lineHeight: 24, fontFamily: fonts.bold },
  body: { fontSize: 17, lineHeight: 24, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 17, lineHeight: 24, fontFamily: fonts.semibold },
  /** The title of a group of controls, for example "Repeat". */
  section: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bold },
  callout: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  captionStrong: { fontSize: 13, lineHeight: 18, fontFamily: fonts.semibold },
} as const satisfies Record<string, TypeStyle>;

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  /** The color behind all content. */
  background: string;
  /** The color of sheets and of a surface that is above the background. */
  surfaceRaised: string;
  /** The color of the hairlines between rows. */
  border: string;
  text: string;
  textMuted: string;
  /** The color of text on the accent color. */
  textOnAccent: string;
  /** The color of links, buttons, and selected controls. */
  accent: string;
  /** A light tint of the accent, for selected chips. */
  accentSoft: string;
  /** The color of destructive actions and errors. */
  danger: string;
  /** The background of text fields and of secondary buttons. */
  field: string;
  /** The background of a toast: the inverse of the background. */
  inverse: string;
  /** The text on `inverse`. */
  textOnInverse: string;
  /** The accent color on `inverse`, for the button of a toast. */
  accentOnInverse: string;
  /** The dim layer behind a sheet. */
  overlay: string;
  /** The empty part of a gauge bar. */
  gaugeTrack: string;
  /** The text on the green panel of a swipe. The old white text fails the contrast check. */
  textOnGreen: string;
  gauge: typeof gaugeColors;
}

// The old app: a white page, black text, and the blue #39F. That blue has a
// contrast of 2.9:1 on white, so light mode uses a darker blue for text and
// buttons. Dark mode uses #39F itself, on black, as the old iOS dark mode.
const light: ThemeColors = {
  background: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E0E0E0',
  text: '#111111',
  textMuted: '#6B6B6B',
  textOnAccent: '#FFFFFF',
  accent: '#0A6FD6',
  accentSoft: '#E6F1FD',
  danger: '#D92D50',
  field: '#F2F2F2',
  inverse: '#1F1F1F',
  textOnInverse: '#F5F5F5',
  accentOnInverse: '#66B2FF',
  overlay: 'rgba(0, 0, 0, 0.4)',
  gaugeTrack: '#F2F2F2',
  textOnGreen: '#0B3814',
  gauge: gaugeColors,
};

const dark: ThemeColors = {
  background: '#000000',
  surfaceRaised: '#1C1C1E',
  border: '#2C2C2E',
  text: '#FFFFFF',
  textMuted: '#9A9A9A',
  textOnAccent: '#000000',
  accent: '#3399FF',
  accentSoft: '#0F2A47',
  danger: '#FF5C7A',
  // Lighter than `surfaceRaised`, so that fields and buttons show on a sheet.
  field: '#2C2C2E',
  inverse: '#F5F5F5',
  textOnInverse: '#111111',
  accentOnInverse: '#0A6FD6',
  overlay: 'rgba(0, 0, 0, 0.6)',
  gaugeTrack: '#262628',
  textOnGreen: '#0B3814',
  gauge: gaugeColors,
};

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', colors: light, spacing, radius, typography },
  dark: { scheme: 'dark', colors: dark, spacing, radius, typography },
};

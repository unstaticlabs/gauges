# UI

This folder holds the shared components and the theme.

- `theme/` holds the design tokens for light and dark mode, and the `useTheme` hook.
- `components/` holds the shared controls: `Gauge`, `Button`, `IconButton`,
  `TextField`, `Segmented`, `Sheet`, `Toast`, `Icon`, `DateTimeField`,
  `TimeField`, `Chip`, `EmojiPicker`, `AvatarStack`, and `QrCode`.
  `avatarLook.ts` gives the initials and the stable color of an avatar.
- `platform/` holds helpers that differ by platform: `confirm` (a system
  alert on native, `window.confirm` on the web) and the haptic feedback.
- A file that ends in `.web.tsx` replaces the file of the same name on the
  web. `DateTimeField.web.tsx` uses the HTML `datetime-local` input, because
  the native picker has no web version.
- Read colors, spacing, radius, and type sizes from `useTheme`. Do not write raw values in a component.

## The look

The app follows the look of the old Gauges app:

- The font is IBM Plex Sans. `app/_layout.tsx` loads four weights from
  `@expo-google-fonts/ibm-plex-sans`. Each weight is a font family in
  `fonts`, because Android does not pick the weight of a custom font from
  `fontWeight`. Set `fontFamily` from `typography`, not `fontWeight`.
- The page is white in light mode and black in dark mode. Lists are flat,
  with hairlines between the rows and a side margin of 20 points
  (`spacing.page`). There are no cards.
- The gauge bar is a rounded track with the fill inside it, 14 points high
  in a row. The fill is at least 3 %, so that an empty gauge shows its red.
- The blue of the old app (`#39F`) has a contrast of 2.9:1 on white. Light
  mode uses `#0A6FD6` for text and buttons. Dark mode uses `#39F` on black.
- The green of a full gauge has a contrast of 2.2:1 with white text. A
  green button and the "done" badge of a row keep the green, with dark
  green text (`textOnGreen`). The "Done" swipe button has white text and
  a white icon, for consistency with the other swipe buttons, at 2.2:1.

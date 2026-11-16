import { Link, type Href } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { WEBSITE_URL } from '@/data';
import { t } from '@/i18n';
import { useTheme } from '@/ui/theme';

const PAGES = [
  { path: '/privacy', label: () => t.links.privacy, testID: 'link-privacy' },
  { path: '/legal', label: () => t.links.legal, testID: 'link-legal' },
  { path: '/support', label: () => t.links.support, testID: 'link-support' },
] as const;

/**
 * The address of a static page of the website. On the web, the path stays
 * on the same site, so the links also work on a preview or the emulator.
 * The pages are not app routes: `target="_blank"` makes the browser load
 * them, and Expo Router does not handle the click.
 */
function pageHref(path: string): Href {
  return (Platform.OS === 'web' ? path : `${WEBSITE_URL}${path}`) as Href;
}

/**
 * Quiet links to the privacy policy, the legal notice, and the help page,
 * in one centered row that wraps on a narrow screen. Settings and the start
 * screen show it.
 */
export function WebsiteLinks() {
  const { colors, spacing, typography } = useTheme();
  const linkStyle = [typography.caption, { color: colors.textMuted, textDecorationLine: 'underline' as const }];

  return (
    <View style={[styles.links, { columnGap: spacing.lg, rowGap: spacing.xs }]} role="navigation">
      {PAGES.map((page) => (
        <Link
          key={page.path}
          href={pageHref(page.path)}
          target="_blank"
          rel="noopener"
          style={linkStyle}
          testID={page.testID}
        >
          {page.label()}
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
});

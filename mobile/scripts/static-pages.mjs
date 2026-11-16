/**
 * Helpers for the static pages of the website: the pages in `public/`.
 *
 * A static page has the tag `<meta name="gauges-static-page" ...>`. The
 * HTML that Expo makes for the app does not have it. Its comments are React
 * markers (`<!--$-->`) that the app needs.
 *
 * The static pages are published as they are, so they must have no HTML
 * comments. `scripts/deploy-web.mjs` and the tests check it.
 */

/** The text of a `<script>` or `<style>` element is not HTML: skip it. */
const RAW_TEXT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;

/** True if the HTML text is a static page from `public/`. */
export function isStaticPage(text) {
  return /<meta name="gauges-static-page" content="[^"]*">/.test(text);
}

/** The HTML comments of the text, outside `<script>` and `<style>` elements. */
export function findComments(text) {
  return text.replace(RAW_TEXT, '').match(COMMENT) ?? [];
}

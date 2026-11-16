// Tests for the static pages of the website. Run with
// `node --test scripts/__tests__/` (`npm test` runs it after Jest).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { findComments, isStaticPage } from '../static-pages.mjs';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="gauges-static-page" content="legal">
<style>
  /* A CSS comment is not an HTML comment. */
  body { margin: 0; }
</style>
<script>var marker = "<!-- not a comment -->";</script>
</head>
<body>
  <p>Text</p>
</body>
</html>
`;

test('finds the static pages by their meta tag', () => {
  assert.ok(isStaticPage(page));
  assert.ok(!isStaticPage('<!doctype html><html><body><!--$--><div id="root"></div><!--/$--></body></html>'));
});

test('finds HTML comments, but not the text of a script or a style', () => {
  assert.deepEqual(findComments(page), []);
  const withNote = page.replace('<p>Text</p>', '<p>Text <!-- a note --></p>\n<!--\n  more\n-->');
  assert.deepEqual(findComments(withNote), ['<!-- a note -->', '<!--\n  more\n-->']);
});

test('each page in public/ is a static page with no HTML comment', () => {
  const pages = readdirSync(publicDir).filter((name) => name.endsWith('.html'));
  assert.ok(pages.length >= 5);
  for (const name of pages) {
    const text = readFileSync(join(publicDir, name), 'utf8');
    assert.ok(isStaticPage(text), `${name} has no gauges-static-page meta tag`);
    assert.deepEqual(findComments(text), [], `${name} has an HTML comment`);
  }
});

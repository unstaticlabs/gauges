// The root HTML of each page of the web app in the static export. It only
// runs in Node.js at build time. The static pages in public/ have their own
// HTML.
import type { ReactNode } from 'react';
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';

/**
 * The same document as the default of Expo Router, plus the title and the
 * head tags of the app. Nothing in the app changes `document.title`, so the
 * title stays "Gauges" on each route, also after a navigation in the app.
 * Add no inline script here: the Content-Security-Policy in `firebase.json`
 * lists the hash of each inline script.
 */
export default function Root({ children }: { children: ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Gauges</title>
        <meta
          name="description"
          content="Gauges shows how long ago you did each chore that comes back. Mark a chore done with a swipe, and share your gauges with the people you live with."
        />
        <meta name="application-name" content="Gauges" />
        <meta name="apple-mobile-web-app-title" content="Gauges" />
        {/* The page background of the theme (src/ui/theme/tokens.ts). */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Disables the scroll of the body, so that a ScrollView works as on the phone. */}
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

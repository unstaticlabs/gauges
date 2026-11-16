#!/usr/bin/env node
/**
 * Builds the website for Firebase Hosting, checks the build, and prints the
 * deploy command. It deploys only with `--deploy`.
 *
 *   node scripts/deploy-web.mjs             # build and check only
 *   node scripts/deploy-web.mjs --deploy    # build, check, then deploy
 *
 * It needs the config of your deployment: `.env.local` with the Firebase
 * web config (see `.env.example`), and `.firebaserc` with the same project
 * (see `.firebaserc.example`). It refuses to build in demo mode.
 *
 * `firebase.json` has the placeholder `${FIREBASE_AUTH_DOMAIN}` in the
 * Content-Security-Policy. The script writes `firebase.deploy.json` with
 * the auth domain of `.env.local`, and the deploy uses that file.
 *
 * Run it from any folder. It writes `mobile/dist/`, the folder that
 * `mobile/firebase.json` serves.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findComments, isStaticPage } from './static-pages.mjs';

const EMULATOR_VAR = 'EXPO_PUBLIC_FIREBASE_EMULATOR_HOST';
const REQUIRED_VARS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_WEBSITE_URL',
];
/** The env files that Expo reads for a production build. */
const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];
const STATIC_PAGES = ['privacy', 'legal', 'delete-account', 'support', '404'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const args = new Set(process.argv.slice(2));
const known = new Set(['--deploy', '--help']);
const unknown = [...args].filter((a) => !known.has(a));

if (args.has('--help') || unknown.length > 0) {
  if (unknown.length > 0) console.error(`Unknown option: ${unknown.join(' ')}`);
  console.log('Usage: node scripts/deploy-web.mjs [--deploy]');
  process.exit(unknown.length > 0 ? 2 : 0);
}

const deploy = args.has('--deploy');
const problems = [];

function fail(message) {
  console.error(`\nSTOP: ${message}`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function read(path) {
  return readFileSync(path, 'utf8');
}

/** Reads `KEY=value` lines. Lines that start with `#` are comments. */
function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

// 1. The config of the deployment. The production build must not use the
// emulator, and must not run in demo mode.
if (process.env[EMULATOR_VAR] !== undefined) {
  fail(`${EMULATOR_VAR} is set in your shell. Run "unset ${EMULATOR_VAR}", then run this script again.`);
}
const env = {};
for (const name of ENV_FILES.filter((n) => existsSync(join(root, n)))) {
  const values = parseEnv(read(join(root, name)));
  if (values[EMULATOR_VAR] !== undefined) {
    fail(`${name} sets ${EMULATOR_VAR}. Expo reads this file during the build. Remove the line.`);
  }
  for (const [key, value] of Object.entries(values)) env[key] ??= value;
}
const missing = REQUIRED_VARS.filter((name) => !env[name] && !process.env[name]);
if (missing.length > 0) {
  fail(`The config of your deployment is missing: ${missing.join(', ')}. Copy .env.example to .env.local and fill it in.`);
}
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID || env.EXPO_PUBLIC_FIREBASE_APP_ID;
if (projectId.startsWith('demo-')) fail(`The project ID "${projectId}" is a demo project. Use your own project.`);

const firebaserc = join(root, '.firebaserc');
if (!existsSync(firebaserc)) fail('.firebaserc is missing. Copy .firebaserc.example to .firebaserc and set your project.');
let hostingProject;
try {
  hostingProject = JSON.parse(read(firebaserc)).projects?.default;
} catch {
  fail('.firebaserc is not valid JSON.');
}
if (hostingProject !== projectId) {
  fail(`.firebaserc names the project "${hostingProject}", but .env.local names "${projectId}". Use the same project.`);
}
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
if (!/^[a-z0-9.-]+$/.test(authDomain)) fail(`EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN "${authDomain}" is not a host name.`);

// The Hosting config with the auth domain of this deployment.
const AUTH_PLACEHOLDER = '${FIREBASE_AUTH_DOMAIN}';
const hostingTemplate = read(join(root, 'firebase.json'));
if (!hostingTemplate.includes(AUTH_PLACEHOLDER)) fail(`firebase.json has no ${AUTH_PLACEHOLDER} placeholder.`);
const hostingConfig = hostingTemplate.split(AUTH_PLACEHOLDER).join(authDomain);
const DEPLOY_CONFIG = 'firebase.deploy.json';
writeFileSync(join(root, DEPLOY_CONFIG), hostingConfig);
const DEPLOY_ARGS = ['firebase-tools@latest', 'deploy', '--only', 'hosting', '--project', projectId, '--config', DEPLOY_CONFIG];

// 2. Build.
rmSync(dist, { recursive: true, force: true });
const buildEnv = { ...process.env, CI: '1', NODE_ENV: 'production' };
delete buildEnv[EMULATOR_VAR];
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], {
  cwd: root,
  env: buildEnv,
  stdio: 'inherit',
});
if (result.status !== 0) fail('The web export failed.');

// 3. Check the build.
const files = walk(dist);
const rel = (path) => relative(dist, path);

for (const page of STATIC_PAGES) {
  const path = join(dist, `${page}.html`);
  if (!existsSync(path)) problems.push(`${page}.html is missing.`);
  else if (!read(path).includes(`<meta name="gauges-static-page" content="${page}">`)) {
    problems.push(`${page}.html is not the static page from public/. An app route can have the same name.`);
  }
}
for (const name of ['apple-app-site-association', 'assetlinks.json']) {
  const path = join(dist, '.well-known', name);
  if (!existsSync(path)) {
    problems.push(`.well-known/${name} is missing.`);
    continue;
  }
  try {
    JSON.parse(read(path));
  } catch {
    problems.push(`.well-known/${name} is not valid JSON.`);
  }
}

const bundle = files
  .filter((f) => f.endsWith('.js'))
  .map(read)
  .join('\n');
if (!existsSync(join(dist, 'index.html'))) problems.push('index.html is missing.');
if (!existsSync(join(dist, 'label', '[id].html'))) problems.push('label/[id].html is missing. Update the rewrites.');
if (!existsSync(join(dist, 'gauge', '[id].html'))) problems.push('gauge/[id].html is missing. Update the rewrites.');

// The emulator must be off. In demo mode, the app uses the emulator on
// 127.0.0.1, so this check also catches a build in demo mode.
if (bundle.includes(EMULATOR_VAR)) problems.push(`The bundle still reads ${EMULATOR_VAR} at run time.`);
for (const host of ['127.0.0.1', '10.0.2.2', 'localhost:8080', 'localhost:9099']) {
  if (bundle.includes(host)) problems.push(`The bundle contains the emulator host ${host}.`);
}
// The bundle must hold the config of the deployment.
for (const [name, value] of [
  ['project ID', projectId],
  ['app ID', appId],
]) {
  if (!bundle.includes(`"${value}"`) && !bundle.includes(`'${value}'`)) {
    problems.push(`The bundle does not contain the ${name} of .env.local. Expo did not read the config.`);
  }
}
if (problems.length === 0) {
  console.log(`Checked: the bundle uses the project ${projectId}, with no emulator host, so the anonymous login of the website is off.`);
}

// Each inline script must match a hash in the Content-Security-Policy.
const config = hostingConfig;
for (const file of files.filter((f) => f.endsWith('.html'))) {
  for (const match of read(file).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim() === '') continue;
    const hash = createHash('sha256').update(match[1]).digest('base64');
    if (!config.includes(`'sha256-${hash}'`)) {
      problems.push(`${rel(file)} has an inline script that the CSP blocks. Add 'sha256-${hash}' to script-src in firebase.json.`);
    }
  }
}

// The static pages must have no HTML comments. The app HTML from Expo keeps
// its comments: React needs them.
for (const file of files.filter((f) => f.endsWith('.html'))) {
  const text = read(file);
  if (isStaticPage(text) && findComments(text).length > 0) {
    problems.push(`${rel(file)} is a static page with an HTML comment. Remove the comment in public/.`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`PROBLEM: ${problem}`);
  fail('The build did not pass the checks. Nothing was deployed.');
}

// 4. Deploy, only on request.
const command = `npx ${DEPLOY_ARGS.join(' ')}`;
console.log(`\nThe website in dist/ passed the checks (${files.length} files).`);
if (!deploy) {
  console.log('To deploy it, run this command in mobile/ (it needs "npx firebase-tools@latest login" one time):');
  console.log(`\n  ${command}\n`);
  console.log('Or run this script again with --deploy.');
  process.exit(0);
}
console.log(`\nRun: ${command}`);
const deployResult = spawnSync('npx', DEPLOY_ARGS, { cwd: root, stdio: 'inherit' });
process.exit(deployResult.status ?? 1);

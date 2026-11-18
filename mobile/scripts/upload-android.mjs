#!/usr/bin/env node
/**
 * Uploads a signed Android App Bundle (.aab) to a track of Google Play with
 * the Google Play Developer API (Android Publisher v3).
 *
 *   node scripts/upload-android.mjs <file.aab>             # upload and release
 *   node scripts/upload-android.mjs --dry-run <file.aab>   # all steps, no release
 *   node scripts/upload-android.mjs --check                # settings only, no network
 *
 * `scripts/build-android.sh --upload` runs `--check` before the build, and
 * the upload after a signed build.
 *
 * Settings in `.env.local`:
 *
 *   PLAY_SERVICE_ACCOUNT_PATH  the JSON key file of a service account,
 *                              outside the repository (`~/` is allowed)
 *   PLAY_TRACK                 optional, the track; the default is `internal`
 *
 * The package name is `expo.android.package` of the app config. The release
 * name is `<expo.version> (<version code>)`.
 *
 * Steps: an OAuth token for the service account, a new edit, the bundle
 * upload, the track update with one release (status `completed`), then the
 * commit. `--dry-run` sends `edits.validate` in place of the commit and then
 * deletes the edit, so nothing changes in Google Play. If a step fails, the
 * script does not commit the edit, so nothing changes in Google Play.
 *
 * The script never prints the key or the token. It prints the email of the
 * service account only. The API output goes to
 * `build/upload-android-<version>-<build>.log`, with no secrets.
 */
import { sign } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
export const TOKEN_URI = 'https://oauth2.googleapis.com/token';
export const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
export const UPLOAD_API = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
export const DEFAULT_TRACK = 'internal';

/** A problem that stops the script, with a message for the user. */
export class StopError extends Error {}

/** An error answer of a Google API. */
export class ApiError extends Error {
  constructor(step, status, message) {
    super(`${step} failed: HTTP ${status}: ${message}`);
    this.step = step;
    this.status = status;
    this.apiMessage = message;
  }
}

/** Reads `KEY=value` lines. Lines that start with `#` are comments. */
export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** Replaces a leading `~/` with the home folder. */
export function expandHome(path, home = homedir()) {
  return path.startsWith('~/') ? join(home, path.slice(2)) : path;
}

/** Gives the key path and the track from the values of `.env.local`. */
export function readSettings(env, home = homedir()) {
  const keyPath = env.PLAY_SERVICE_ACCOUNT_PATH;
  if (!keyPath) {
    throw new StopError(
      'PLAY_SERVICE_ACCOUNT_PATH has no value in .env.local. Set the path of the JSON key file of your service account (see README.md).',
    );
  }
  const track = env.PLAY_TRACK || DEFAULT_TRACK;
  if (!/^[A-Za-z0-9:_-]+$/.test(track)) throw new StopError(`PLAY_TRACK "${track}" is not a track name.`);
  return { keyPath: expandHome(keyPath, home), track };
}

/** True when `path` is in the folder `dir` or in a folder below it. */
export function isInside(path, dir) {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Checks the text of a service account key file. Gives the fields that the
 * script uses. The messages never contain the key.
 */
export function parseServiceAccount(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StopError('The key file in PLAY_SERVICE_ACCOUNT_PATH is not valid JSON.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new StopError('The key file in PLAY_SERVICE_ACCOUNT_PATH is not a JSON object.');
  }
  if (data.type !== undefined && data.type !== 'service_account') {
    throw new StopError(`The key file in PLAY_SERVICE_ACCOUNT_PATH has the type "${data.type}". Use the JSON key of a service account.`);
  }
  for (const field of ['client_email', 'private_key']) {
    if (typeof data[field] !== 'string' || data[field] === '') {
      throw new StopError(`The key file in PLAY_SERVICE_ACCOUNT_PATH has no "${field}". Use the JSON key of a service account.`);
    }
  }
  if (!data.private_key.includes('PRIVATE KEY')) {
    throw new StopError('The "private_key" in the key file is not a PEM private key.');
  }
  return {
    clientEmail: data.client_email,
    privateKey: data.private_key,
    privateKeyId: typeof data.private_key_id === 'string' ? data.private_key_id : undefined,
    tokenUri: typeof data.token_uri === 'string' && data.token_uri ? data.token_uri : TOKEN_URI,
  };
}

/** Reads and checks the key file. It must be readable and outside the repository. */
export function loadServiceAccount(keyPath, repoRoot) {
  if (!existsSync(keyPath)) throw new StopError('PLAY_SERVICE_ACCOUNT_PATH in .env.local does not name a file that exists.');
  try {
    accessSync(keyPath, constants.R_OK);
  } catch {
    throw new StopError('PLAY_SERVICE_ACCOUNT_PATH in .env.local names a file that you cannot read.');
  }
  if (isInside(realpathSync(keyPath), realpathSync(repoRoot))) {
    throw new StopError('The key file in PLAY_SERVICE_ACCOUNT_PATH is inside the repository. Move it outside the repository.');
  }
  return parseServiceAccount(readFileSync(keyPath, 'utf8'));
}

function base64url(data) {
  return Buffer.from(data).toString('base64url');
}

/** Makes the signed JWT (RS256) for the OAuth JWT bearer grant. */
export function createJwt({ clientEmail, privateKey, privateKeyId, tokenUri = TOKEN_URI }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT', ...(privateKeyId ? { kid: privateKeyId } : {}) };
  const claims = { iss: clientEmail, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign('sha256', Buffer.from(input), privateKey);
  return `${input}.${signature.toString('base64url')}`;
}

/** Gives the error message in the body of a Google answer. */
export function errorMessage(body) {
  if (body && typeof body === 'object') {
    if (body.error && typeof body.error === 'object' && body.error.message) return body.error.message;
    if (typeof body.error === 'string') return body.error_description ? `${body.error}: ${body.error_description}` : body.error;
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 500);
  return 'no error message';
}

/** Gives a plain hint for the common API errors, or undefined. */
export function errorHint(status, message = '') {
  if (/version code.*already.*used/i.test(message)) {
    return 'Google Play already has a bundle with this version code. Set the next build number in app.json (expo.android.versionCode), build again, and upload again.';
  }
  if (/draft app/i.test(message)) {
    return 'The app is a draft in Google Play. Do the first release of the app by hand in Play Console.';
  }
  if (status === 404 || /package not found/i.test(message)) {
    return 'Google Play has no app with this package name. Check expo.android.package in app.json, and create the app in Play Console.';
  }
  if (status === 401 || status === 403) {
    return (
      'The service account has no access. Check that the "Google Play Android Developer API" is enabled in the Google Cloud project ' +
      'of the service account, and that Play Console > Users and permissions gives the service account access to this app ' +
      'with the permission to release to testing tracks.'
    );
  }
  if (/invalid_grant/i.test(message)) {
    return 'Google refused the key. The key can be deleted or disabled, or the clock of this computer can be wrong. Create a new key, or set the clock.';
  }
  return undefined;
}

async function readBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Removes the token from a token answer, for the log. */
function withoutSecrets(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  for (const key of ['access_token', 'id_token', 'refresh_token']) if (key in copy) copy[key] = '<removed>';
  return copy;
}

/**
 * Runs the API steps. `fetch` is the fetch function. `log` gets one entry
 * for each request. Gives the version code and the track.
 */
export async function upload({ fetch, account, packageName, track, version, bundle, dryRun = false, log = () => {}, say = () => {}, now }) {
  async function call(step, url, init) {
    const response = await fetch(url, init);
    const body = await readBody(response);
    log({ step, method: init.method, url, status: response.status, body: withoutSecrets(body) });
    if (!response.ok) throw new ApiError(step, response.status, errorMessage(body));
    return body;
  }

  say('Get an access token');
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: createJwt(account, now),
  });
  const token = await call('Token', account.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!token || typeof token.access_token !== 'string') throw new ApiError('Token', 200, 'the answer has no access token');
  const auth = { Authorization: `Bearer ${token.access_token}` };
  const json = { ...auth, 'Content-Type': 'application/json' };
  const app = encodeURIComponent(packageName);

  say('Create an edit');
  const edit = await call('edits.insert', `${API}/${app}/edits`, { method: 'POST', headers: json, body: '{}' });
  const editUrl = `${API}/${app}/edits/${encodeURIComponent(edit.id)}`;

  // The edit is not committed. Delete it, so that it does not stay open. A
  // failure here changes nothing in Google Play, so the script ignores it.
  async function deleteEdit() {
    try {
      await call('edits.delete', editUrl, { method: 'DELETE', headers: auth });
    } catch {
      // The edit expires by itself.
    }
  }

  let committing = false;
  try {
    say(`Upload the bundle (${(bundle.length / 1048576).toFixed(1)} MB)`);
    const uploaded = await call('edits.bundles.upload', `${UPLOAD_API}/${app}/edits/${encodeURIComponent(edit.id)}/bundles?uploadType=media`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/octet-stream' },
      body: bundle,
    });
    const versionCode = String(uploaded.versionCode ?? '');
    if (!/^\d+$/.test(versionCode)) throw new ApiError('edits.bundles.upload', 200, 'the answer has no version code');

    say(`Set the release on the "${track}" track`);
    const release = { name: `${version} (${versionCode})`, versionCodes: [versionCode], status: 'completed' };
    await call('edits.tracks.update', `${editUrl}/tracks/${encodeURIComponent(track)}`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ track, releases: [release] }),
    });

    if (dryRun) {
      say('Validate the edit (dry run, no commit)');
      await call('edits.validate', `${editUrl}:validate`, { method: 'POST', headers: auth });
    } else {
      say('Commit the edit');
      committing = true;
      await call('edits.commit', `${editUrl}:commit`, { method: 'POST', headers: auth });
    }
    if (dryRun) await deleteEdit();
    return { versionCode, track };
  } catch (error) {
    if (error && typeof error === 'object') {
      error.afterInsert = true;
      // Without an HTTP answer to the commit, the script cannot tell if Google Play got it.
      error.commitUnknown = committing && !(error instanceof ApiError);
    }
    await deleteEdit();
    throw error;
  }

}

/** Gives the package name and the version of the app config. */
export function appInfo(root) {
  const require = createRequire(join(root, 'package.json'));
  const appJson = require(join(root, 'app.json'));
  const configPath = join(root, 'app.config.js');
  const config = existsSync(configPath) ? require(configPath)({ config: appJson.expo }) : appJson.expo;
  const packageName = config.android?.package;
  if (!packageName) throw new StopError('The app config has no expo.android.package.');
  return { packageName, version: config.version, versionCode: config.android?.versionCode };
}

/** Reads the settings and the key file. Never uses the network. */
export function prepare(root) {
  const envPath = join(root, '.env.local');
  if (!existsSync(envPath)) throw new StopError('.env.local is missing. Copy .env.example to .env.local and fill it in.');
  const { keyPath, track } = readSettings(parseEnv(readFileSync(envPath, 'utf8')));
  const account = loadServiceAccount(keyPath, resolve(root, '..'));
  return { account, track, ...appInfo(root) };
}

const USAGE = 'Usage: node scripts/upload-android.mjs [--dry-run] <file.aab>\n       node scripts/upload-android.mjs --check';

async function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const flags = argv.filter((a) => a.startsWith('-'));
  const files = argv.filter((a) => !a.startsWith('-'));
  const unknown = flags.filter((f) => !['--dry-run', '--check', '--help', '-h'].includes(f));
  if (flags.includes('--help') || flags.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const check = flags.includes('--check');
  if (unknown.length > 0 || (check ? files.length > 0 : files.length !== 1)) {
    if (unknown.length > 0) console.error(`Unknown option: ${unknown.join(' ')}`);
    console.error(USAGE);
    return 2;
  }
  const dryRun = flags.includes('--dry-run');

  const settings = prepare(root);
  const { account, track, packageName, version } = settings;
  if (check) {
    console.log(`Google Play upload: service account ${account.clientEmail}, package ${packageName}, track "${track}".`);
    return 0;
  }

  const aab = resolve(files[0]);
  if (!aab.endsWith('.aab') || !existsSync(aab)) throw new StopError(`${files[0]} is not an .aab file.`);
  if (/DEBUG-SIGNED/.test(basename(aab))) throw new StopError('This bundle has the debug key. Google Play refuses it.');
  const bundle = readFileSync(aab);

  console.log(`\n== Upload to Google Play${dryRun ? ' (dry run)' : ''}`);
  console.log(`Bundle: ${aab}`);
  console.log(`Package: ${packageName}, track "${track}", service account ${account.clientEmail}`);

  const entries = [];
  let result;
  let failure;
  try {
    result = await upload({
      fetch: globalThis.fetch,
      account,
      packageName,
      track,
      version,
      bundle,
      dryRun,
      log: (entry) => entries.push(entry),
      say: (text) => console.log(`- ${text}`),
    });
  } catch (error) {
    failure = error;
  }

  const build = result?.versionCode ?? settings.versionCode ?? 'unknown';
  const logPath = join(root, 'build', `upload-android-${version}-${build}.log`);
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${JSON.stringify(entries, null, 2)}\n`);

  if (failure) {
    console.error(`\n${failure?.message ?? failure}`);
    const hint = failure instanceof ApiError ? errorHint(failure.status, failure.apiMessage) : undefined;
    if (hint) console.error(`Hint: ${hint}`);
    if (failure?.commitUnknown) {
      console.error('The commit got no answer. Look at the track in Play Console to see if the release is there.');
    } else if (failure?.afterInsert) {
      console.error('The script did not commit the edit, so nothing changed in Google Play.');
    }
    console.error(`The API output is in ${logPath}.`);
    throw new StopError('The upload to Google Play failed.');
  }

  console.log(`The API output is in ${logPath}.`);
  if (dryRun) {
    console.log(`\nDRY RUN OK: Google Play accepts version ${version}, build ${build} for the "${track}" track. Nothing was released.`);
  } else {
    console.log(`\nUPLOAD OK: version ${version}, build ${build} is on the "${track}" track of Google Play.`);
  }
  return 0;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`\nSTOP: ${error?.message ?? error}`);
      process.exit(1);
    },
  );
}

// Tests for scripts/upload-android.mjs. Run with
// `node --test scripts/__tests__/` (`npm test` runs it after Jest).
//
// The tests make a new RSA key pair and give a stand-in for fetch to the
// upload. So they use no network and no real key.
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import {
  API,
  ApiError,
  createJwt,
  errorHint,
  expandHome,
  loadServiceAccount,
  parseServiceAccount,
  readSettings,
  SCOPE,
  StopError,
  TOKEN_URI,
  upload,
  UPLOAD_API,
} from '../upload-android.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const EMAIL = 'uploader@example-project.iam.gserviceaccount.com';
const KEY_JSON = { type: 'service_account', client_email: EMAIL, private_key: PEM, private_key_id: 'kid-1', token_uri: TOKEN_URI };
const ACCOUNT = parseServiceAccount(JSON.stringify(KEY_JSON));
const TOKEN = 'ya29.FAKE-ACCESS-TOKEN';
const PKG = 'com.example.gauges';

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function decode(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

test('createJwt makes an RS256 JWT for the token endpoint with a valid signature', () => {
  const now = Date.UTC(2026, 0, 2, 3, 4, 5);
  const jwt = createJwt(ACCOUNT, now);
  const [header, claims, signature] = jwt.split('.');
  assert.deepEqual(decode(header), { alg: 'RS256', typ: 'JWT', kid: 'kid-1' });
  assert.deepEqual(decode(claims), { iss: EMAIL, scope: SCOPE, aud: TOKEN_URI, iat: now / 1000, exp: now / 1000 + 3600 });
  assert.ok(verify('sha256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url')));
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
  assert.ok(!verify('sha256', Buffer.from(`${header}.${claims}`), other, Buffer.from(signature, 'base64url')));
});

test('parseServiceAccount accepts a service account key and refuses other files, with no key in the message', () => {
  assert.equal(ACCOUNT.clientEmail, EMAIL);
  assert.equal(ACCOUNT.tokenUri, TOKEN_URI);
  const { token_uri: _, ...noUri } = KEY_JSON;
  assert.equal(parseServiceAccount(JSON.stringify(noUri)).tokenUri, TOKEN_URI);
  for (const [text, message] of [
    ['not json', /not valid JSON/],
    ['[]', /not a JSON object/],
    [JSON.stringify({ ...KEY_JSON, type: 'authorized_user' }), /type "authorized_user"/],
    [JSON.stringify({ ...KEY_JSON, client_email: undefined }), /no "client_email"/],
    [JSON.stringify({ ...KEY_JSON, private_key: '' }), /no "private_key"/],
    [JSON.stringify({ ...KEY_JSON, private_key: 'abc' }), /not a PEM private key/],
  ]) {
    assert.throws(
      () => parseServiceAccount(text),
      (error) => error instanceof StopError && message.test(error.message) && !error.message.includes('PRIVATE KEY'),
    );
  }
});

test('readSettings needs the key path, expands ~/, and uses the internal track by default', () => {
  assert.throws(() => readSettings({}), /PLAY_SERVICE_ACCOUNT_PATH has no value/);
  assert.deepEqual(readSettings({ PLAY_SERVICE_ACCOUNT_PATH: '~/keys/play.json' }, '/home/user'), {
    keyPath: '/home/user/keys/play.json',
    track: 'internal',
  });
  assert.equal(readSettings({ PLAY_SERVICE_ACCOUNT_PATH: '/k.json', PLAY_TRACK: 'beta' }).track, 'beta');
  assert.throws(() => readSettings({ PLAY_SERVICE_ACCOUNT_PATH: '/k.json', PLAY_TRACK: 'a b' }), /not a track name/);
  assert.equal(expandHome('/abs/path', '/home/user'), '/abs/path');
});

test('loadServiceAccount refuses a missing file, an unreadable file, and a file in the repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'upload-android-'));
  roots.push(root);
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'mobile'), { recursive: true });
  const outside = join(root, 'play.json');
  writeFileSync(outside, JSON.stringify(KEY_JSON));
  assert.equal(loadServiceAccount(outside, repo).clientEmail, EMAIL);

  assert.throws(() => loadServiceAccount(join(root, 'none.json'), repo), /does not name a file that exists/);
  const inside = join(repo, 'mobile', 'play.json');
  writeFileSync(inside, JSON.stringify(KEY_JSON));
  assert.throws(() => loadServiceAccount(inside, repo), /inside the repository/);
  if (process.getuid?.() !== 0) {
    const locked = join(root, 'locked.json');
    writeFileSync(locked, JSON.stringify(KEY_JSON));
    chmodSync(locked, 0o000);
    assert.throws(() => loadServiceAccount(locked, repo), /cannot read/);
  }
});

test('errorHint gives a plain hint for the common errors', () => {
  assert.match(errorHint(403, 'The caller does not have permission'), /Users and permissions/);
  assert.match(errorHint(401, 'Request had invalid authentication credentials.'), /Google Play Android Developer API/);
  assert.match(errorHint(403, 'APK specifies a version code that has already been used.'), /next build number/);
  assert.match(errorHint(400, 'Version code 20 has already been used.'), /expo\.android\.versionCode/);
  assert.match(errorHint(404, 'Package not found: com.example.gauges.'), /package name/);
  assert.match(errorHint(400, 'Only releases with status draft may be created on draft app.'), /first release/);
  assert.match(errorHint(400, 'invalid_grant: Invalid JWT Signature.'), /refused the key/);
  assert.equal(errorHint(500, 'Internal error'), undefined);
});

/** A stand-in for fetch. `fail` names the step that answers with an error. */
function fakeFetch({ fail, failStatus = 403, failMessage = 'The caller does not have permission' } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const step = stepOf(url, init.method);
    calls.push({ step, url, init });
    if (step === fail) return response(failStatus, { error: { code: failStatus, message: failMessage } });
    const bodies = {
      token: { access_token: TOKEN, expires_in: 3599, token_type: 'Bearer' },
      insert: { id: 'edit-7', expiryTimeSeconds: '1' },
      upload: { versionCode: 42, sha1: 'a', sha256: 'b' },
      track: { track: 'internal' },
      validate: { id: 'edit-7' },
      commit: { id: 'edit-7' },
      delete: '',
    };
    return response(200, bodies[step]);
  };
  return { fetch, calls, steps: () => calls.map((c) => c.step) };
}

function stepOf(url, method) {
  if (url === TOKEN_URI) return 'token';
  if (url.startsWith(`${UPLOAD_API}/`)) return 'upload';
  if (url.endsWith(':commit')) return 'commit';
  if (url.endsWith(':validate')) return 'validate';
  if (url.includes('/tracks/')) return 'track';
  if (method === 'DELETE') return 'delete';
  if (url === `${API}/${PKG}/edits`) return 'insert';
  return `unknown ${method} ${url}`;
}

function response(status, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

const BUNDLE = Buffer.from('fake bundle');
const ARGS = { account: ACCOUNT, packageName: PKG, track: 'internal', version: '2.1.0', bundle: BUNDLE };

test('upload sends token, insert, upload, track, commit, in this order, with the right requests', async () => {
  const fake = fakeFetch();
  const log = [];
  const result = await upload({ ...ARGS, fetch: fake.fetch, log: (e) => log.push(e) });
  assert.deepEqual(result, { versionCode: '42', track: 'internal' });
  assert.deepEqual(fake.steps(), ['token', 'insert', 'upload', 'track', 'commit']);

  const [token, , up, track, commit] = fake.calls;
  const form = new URLSearchParams(token.init.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(form.get('assertion').split('.').length, 3);
  assert.equal(up.url, `${UPLOAD_API}/${PKG}/edits/edit-7/bundles?uploadType=media`);
  assert.equal(up.init.headers['Content-Type'], 'application/octet-stream');
  assert.equal(up.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(up.init.body, BUNDLE);
  assert.equal(track.init.method, 'PUT');
  assert.equal(track.url, `${API}/${PKG}/edits/edit-7/tracks/internal`);
  assert.deepEqual(JSON.parse(track.init.body), {
    track: 'internal',
    releases: [{ name: '2.1.0 (42)', versionCodes: ['42'], status: 'completed' }],
  });
  assert.equal(commit.url, `${API}/${PKG}/edits/edit-7:commit`);

  const text = JSON.stringify(log);
  assert.ok(!text.includes(TOKEN), 'the log has no token');
  assert.ok(!text.includes('PRIVATE KEY') && !text.includes(form.get('assertion')), 'the log has no key and no JWT');
});

test('a failure in the middle stops the upload, never commits, and deletes the edit', async () => {
  for (const fail of ['upload', 'track']) {
    const fake = fakeFetch({ fail, failStatus: 403, failMessage: 'Version code 42 has already been used.' });
    await assert.rejects(
      upload({ ...ARGS, fetch: fake.fetch }),
      (error) => error instanceof ApiError && error.status === 403 && error.afterInsert && /already been used/.test(error.message),
    );
    assert.ok(!fake.steps().includes('commit'), fake.steps().join(' '));
    assert.equal(fake.steps().at(-1), 'delete');
  }
});

test('a failure of the token or of the insert stops before the upload', async () => {
  for (const fail of ['token', 'insert']) {
    const fake = fakeFetch({ fail, failStatus: 401 });
    await assert.rejects(upload({ ...ARGS, fetch: fake.fetch }), (error) => error instanceof ApiError && !error.afterInsert);
    assert.ok(!fake.steps().includes('upload') && !fake.steps().includes('commit'));
  }
});

test('a dry run validates the edit, never commits, and deletes the edit', async () => {
  const fake = fakeFetch();
  const result = await upload({ ...ARGS, fetch: fake.fetch, dryRun: true });
  assert.equal(result.versionCode, '42');
  assert.deepEqual(fake.steps(), ['token', 'insert', 'upload', 'track', 'validate', 'delete']);
});

test('a network error at the commit says that the result is not known', async () => {
  const fake = fakeFetch();
  const fetch = async (url, init) => {
    if (url.endsWith(':commit')) throw new TypeError('fetch failed');
    return fake.fetch(url, init);
  };
  await assert.rejects(upload({ ...ARGS, fetch }), (error) => error.commitUnknown === true);
  const early = async (url, init) => {
    if (url.includes('/tracks/')) throw new TypeError('fetch failed');
    return fake.fetch(url, init);
  };
  await assert.rejects(upload({ ...ARGS, fetch: early }), (error) => error.afterInsert && !error.commitUnknown);
});

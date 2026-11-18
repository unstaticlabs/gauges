// Tests for the --upload option of scripts/build-android.sh. Run with
// `node --test scripts/__tests__/` (`npm test` runs it after Jest).
//
// Each test copies the scripts into a new temporary folder with a fake
// config, and puts stand-in tools for npx, java, and keytool first on PATH.
// The stand-in for npx makes a fake gradlew that writes a fake bundle. A
// module that Node loads first (NODE_OPTIONS) replaces fetch with a
// stand-in. So the tests build and upload nothing, use no network, and
// never read a real .env.local or a real key.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const EMAIL = 'uploader@example-project.iam.gserviceaccount.com';
const TOKEN = 'ya29.FAKE-ACCESS-TOKEN';

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const BASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY=key',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID=example-project',
  'EXPO_PUBLIC_FIREBASE_APP_ID=1:2:android:3',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=client',
  'EXPO_PUBLIC_WEBSITE_URL=https://gauges.example.com',
];

const TOOLS = {
  npx: `echo "npx $*" >> "$FAKE_LOG"
mkdir -p android
cat > android/gradlew <<'EOF'
#!/bin/sh
echo "gradlew $*" >> "$FAKE_LOG"
mkdir -p app/build/outputs/bundle/release
echo bundle > app/build/outputs/bundle/release/app-release.aab
EOF
chmod +x android/gradlew`,
  java: 'echo \'openjdk version "17.0.9"\' >&2',
  keytool: 'echo "Owner: ${FAKE_SIGNER:-CN=Upload}"',
};

// The stand-in for fetch. It writes one line for each request to FAKE_LOG.
// FAKE_FAIL names the step that answers with HTTP 403.
const FETCH_STUB = `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const step = u.includes('oauth2') ? 'token' : u.includes('/upload/') ? 'upload' : u.endsWith(':commit') ? 'commit'
    : u.endsWith(':validate') ? 'validate' : u.includes('/tracks/') ? 'track' : init.method === 'DELETE' ? 'delete' : 'insert';
  appendFileSync(process.env.FAKE_LOG, 'fetch ' + step + ' ' + u + '\\n');
  if (step === process.env.FAKE_FAIL) {
    return new Response(JSON.stringify({ error: { code: 403, message: 'The caller does not have permission' } }), { status: 403 });
  }
  const bodies = { token: { access_token: '${TOKEN}' }, insert: { id: 'edit-1' }, upload: { versionCode: 42 } };
  return new Response(JSON.stringify(bodies[step] ?? {}), { status: 200 });
};
`;

/**
 * Makes a folder with the scripts, a fake config, and the stand-in tools.
 * The repository is root/repo, the key file is root/keys/play.json, and
 * HOME is root.
 */
function setup({ env = ['PLAY_SERVICE_ACCOUNT_PATH=~/keys/play.json'], key = { client_email: EMAIL, private_key: PEM }, keystore = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'build-android-'));
  roots.push(root);
  const mobile = join(root, 'repo', 'mobile');
  mkdirSync(join(mobile, 'scripts'), { recursive: true });
  for (const name of ['build-android.sh', 'upload-android.mjs']) copyFileSync(join(MOBILE, 'scripts', name), join(mobile, 'scripts', name));
  copyFileSync(join(MOBILE, 'app.config.js'), join(mobile, 'app.config.js'));
  writeFileSync(
    join(mobile, 'app.json'),
    JSON.stringify({ expo: { version: '2.1.0', android: { package: 'com.example.gauges', versionCode: 42 } } }),
  );
  writeFileSync(join(mobile, 'package.json'), '{}');
  writeFileSync(join(mobile, 'google-services.json'), '{}');
  if (keystore) writeFileSync(join(mobile, 'keystore.properties'), 'storeFile=x\n');
  mkdirSync(join(root, 'keys'));
  if (key) writeFileSync(join(root, 'keys', 'play.json'), typeof key === 'string' ? key : JSON.stringify(key));
  const lines = [...BASE_ENV, ...env.map((line) => line.replace('<repo>', join(root, 'repo')))];
  writeFileSync(join(mobile, '.env.local'), `${lines.join('\n')}\n`);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [name, body] of Object.entries(TOOLS)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  mkdirSync(join(root, 'sdk', 'platforms'), { recursive: true });
  const stub = join(root, 'fetch-stub.mjs');
  writeFileSync(stub, FETCH_STUB);
  return { root, mobile, bin, stub, log: join(root, 'tools.log') };
}

function run(ctx, args, extraEnv = {}) {
  const env = { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}`, HOME: ctx.root, ANDROID_HOME: join(ctx.root, 'sdk'), FAKE_LOG: ctx.log };
  delete env.JAVA_HOME;
  delete env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  env.NODE_OPTIONS = `--import=${ctx.stub}`;
  const result = spawnSync('sh', [join(ctx.mobile, 'scripts', 'build-android.sh'), ...args], {
    encoding: 'utf8',
    env: { ...env, ...extraEnv },
  });
  const calls = existsSync(ctx.log) ? readFileSync(ctx.log, 'utf8').trim().split('\n') : [];
  return { status: result.status, out: `${result.stdout}${result.stderr}`, calls };
}

test('without --upload, it builds and uploads nothing, as before', () => {
  const ctx = setup();
  const { status, out, calls } = run(ctx, []);
  assert.equal(status, 0, out);
  assert.ok(calls.some((c) => c.startsWith('gradlew bundleRelease')), calls.join('\n'));
  assert.ok(!calls.some((c) => c.startsWith('fetch')));
  assert.match(out, /run this script with --upload/);
});

test('--upload builds, then uploads the bundle and commits the edit', () => {
  const ctx = setup();
  const { status, out, calls } = run(ctx, ['--upload']);
  assert.equal(status, 0, out);
  const steps = calls.map((c) => c.split(' ').slice(0, 2).join(' '));
  const build = steps.indexOf('gradlew bundleRelease');
  assert.ok(build >= 0 && steps.indexOf('fetch token') > build, steps.join('\n'));
  assert.deepEqual(
    steps.filter((s) => s.startsWith('fetch')),
    ['fetch token', 'fetch insert', 'fetch upload', 'fetch track', 'fetch commit'],
  );
  assert.ok(calls.some((c) => c.includes('/applications/com.example.gauges/edits/edit-1/tracks/internal')));
  assert.match(out, /UPLOAD OK: version 2\.1\.0, build 42 is on the "internal" track of Google Play\./);
  assert.match(out, new RegExp(EMAIL.replace(/\./g, '\\.')));
  assert.ok(!out.includes(TOKEN) && !out.includes('PRIVATE KEY'), 'the output shows no token and no key');
  const logFile = join(ctx.mobile, 'build', 'upload-android-2.1.0-42.log');
  const logText = readFileSync(logFile, 'utf8');
  assert.ok(!logText.includes(TOKEN) && !logText.includes('PRIVATE KEY'), 'the log has no token and no key');
});

test('--upload uses PLAY_TRACK', () => {
  const ctx = setup({ env: ['PLAY_SERVICE_ACCOUNT_PATH=~/keys/play.json', 'PLAY_TRACK=alpha'] });
  const { status, out, calls } = run(ctx, ['--upload']);
  assert.equal(status, 0, out);
  assert.ok(calls.some((c) => c.includes('/tracks/alpha')));
  assert.match(out, /on the "alpha" track/);
});

test('--upload stops with a hint, a non-zero exit, and no commit when a step fails', () => {
  const ctx = setup();
  const { status, out, calls } = run(ctx, ['--upload'], { FAKE_FAIL: 'upload' });
  assert.equal(status, 1, out);
  assert.match(out, /edits\.bundles\.upload failed: HTTP 403: The caller does not have permission/);
  assert.match(out, /Hint: .*Users and permissions/);
  assert.match(out, /nothing changed in Google Play/);
  assert.match(out, /STOP: The upload to Google Play failed/);
  assert.doesNotMatch(out, /UPLOAD OK/);
  assert.ok(!calls.some((c) => c.startsWith('fetch commit')));
});

test('--upload stops before the build when a setting or the key file is wrong', () => {
  for (const [options, message] of [
    [{ env: [] }, /PLAY_SERVICE_ACCOUNT_PATH has no value in \.env\.local/],
    [{ key: null }, /does not name a file that exists/],
    [{ key: 'not json' }, /is not valid JSON/],
    [{ key: { client_email: EMAIL } }, /has no "private_key"/],
    [{ env: ['PLAY_SERVICE_ACCOUNT_PATH=<repo>/mobile/.env.local'] }, /inside the repository/],
    [{ keystore: false }, /--upload needs a bundle signed with the upload key/],
  ]) {
    const ctx = setup(options);
    const { status, out, calls } = run(ctx, ['--upload']);
    assert.equal(status, 1, out);
    assert.match(out, message);
    assert.deepEqual(calls, [], 'no prebuild, no build, no request');
  }
});

test('--upload refuses a bundle that has the debug key', () => {
  const ctx = setup();
  const { status, out, calls } = run(ctx, ['--upload'], { FAKE_SIGNER: 'CN=Android Debug, O=Android, C=US' });
  assert.equal(status, 1, out);
  assert.match(out, /STOP: --upload does not upload a bundle with the debug key/);
  assert.ok(!calls.some((c) => c.startsWith('fetch')));
});

test('upload-android.mjs --dry-run alone validates, does not commit, and says that nothing was released', () => {
  const ctx = setup();
  const aab = join(ctx.root, 'gauges.aab');
  writeFileSync(aab, 'bundle');
  const result = spawnSync('node', [join(ctx.mobile, 'scripts', 'upload-android.mjs'), '--dry-run', aab], {
    encoding: 'utf8',
    env: { ...process.env, HOME: ctx.root, FAKE_LOG: ctx.log, NODE_OPTIONS: `--import=${ctx.stub}` },
  });
  const out = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, out);
  const steps = readFileSync(ctx.log, 'utf8').trim().split('\n').map((c) => c.split(' ')[1]);
  assert.deepEqual(steps, ['token', 'insert', 'upload', 'track', 'validate', 'delete']);
  assert.match(out, /DRY RUN OK: .*Nothing was released\./);
});

test('--upload still refuses demo mode', () => {
  const ctx = setup();
  const { status, out, calls } = run(ctx, ['--upload'], { EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1' });
  assert.equal(status, 1);
  assert.match(out, /STOP: EXPO_PUBLIC_FIREBASE_EMULATOR_HOST is set/);
  assert.deepEqual(calls, []);
});

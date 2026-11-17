// Tests for the options of scripts/build-ios.sh. Run with
// `node --test scripts/__tests__/` (`npm test` runs it after Jest).
//
// Each test copies the script into a new temporary folder with a fake
// config, and puts stand-in tools for npx, pod, xcodebuild, and xcrun first
// on PATH. The stand-ins record their arguments. So the tests build,
// sign, and upload nothing, and they never read a real .env.local.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build-ios.sh');
const KEY_CONTENT = 'FAKE-PRIVATE-KEY-CONTENT';

/** The temporary folders of the tests. They go away at the end. */
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const BASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY=key',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID=example-project',
  'EXPO_PUBLIC_FIREBASE_APP_ID=1:2:ios:3',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=client',
  'EXPO_PUBLIC_WEBSITE_URL=https://gauges.example.com',
  'APPLE_TEAM_ID=TEAM123456',
];

const TOOLS = {
  npx: 'echo "npx $*" >> "$FAKE_LOG"',
  pod: 'echo "pod $*" >> "$FAKE_LOG"',
  // The archive makes the archive folder. The export makes an .ipa, unless FAKE_NO_IPA is set.
  xcodebuild: `echo "xcodebuild $*" >> "$FAKE_LOG"
prev=
for a in "$@"; do
  if [ "$prev" = -archivePath ] && [ "$1" = archive ]; then mkdir -p "$a"; fi
  if [ "$prev" = -exportPath ] && [ -z "\${FAKE_NO_IPA:-}" ]; then mkdir -p "$a" && touch "$a/Gauges.ipa"; fi
  prev=$a
done`,
  xcrun: 'echo "xcrun $*" >> "$FAKE_LOG"; echo "upload output"; exit "${FAKE_UPLOAD_EXIT:-0}"',
};

/** Makes a folder with the script, a fake config, and the stand-in tools. */
function setup({ env = [], keyFile = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'build-ios-'));
  roots.push(root);
  const mobile = join(root, 'mobile');
  mkdirSync(join(mobile, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(mobile, 'scripts', 'build-ios.sh'));
  writeFileSync(join(mobile, 'app.json'), JSON.stringify({ expo: { version: '2.1.0', ios: { buildNumber: '42' } } }));
  writeFileSync(join(mobile, 'package.json'), '{}');
  writeFileSync(join(mobile, 'GoogleService-Info.plist'), 'plist');
  const keyPath = join(root, 'keys', 'AuthKey_KEY1234567.p8');
  if (keyFile) {
    mkdirSync(dirname(keyPath));
    writeFileSync(keyPath, KEY_CONTENT);
  }
  const lines = [...BASE_ENV, ...env.map((line) => line.replace('<key>', keyPath))];
  writeFileSync(join(mobile, '.env.local'), `${lines.join('\n')}\n`);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [name, body] of Object.entries(TOOLS)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { root, mobile, keyPath, bin, log: join(root, 'tools.log') };
}

function run(ctx, args, extraEnv = {}) {
  const result = spawnSync('sh', [join(ctx.mobile, 'scripts', 'build-ios.sh'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}`, FAKE_LOG: ctx.log, ...extraEnv },
  });
  const calls = existsSync(ctx.log) ? readFileSync(ctx.log, 'utf8').trim().split('\n') : [];
  return { status: result.status, out: `${result.stdout}${result.stderr}`, calls };
}

const KEY_ENV = ['ASC_KEY_ID=KEY1234567', 'ASC_ISSUER_ID=00000000-1111-2222-3333-444444444444', 'ASC_KEY_PATH=<key>'];
const KEY_FLAGS =
  '-authenticationKeyPath <key> -authenticationKeyID KEY1234567 -authenticationKeyIssuerID 00000000-1111-2222-3333-444444444444';

test('without a key and without --upload, it signs with the account in Xcode, as before', () => {
  const ctx = setup();
  const { status, calls } = run(ctx, []);
  assert.equal(status, 0);
  const xcode = calls.filter((c) => c.startsWith('xcodebuild'));
  assert.equal(xcode.length, 2);
  assert.ok(xcode.every((c) => c.includes('-allowProvisioningUpdates') && !c.includes('-authenticationKey')));
  assert.ok(!calls.some((c) => c.startsWith('xcrun')));
});

test('with the three key values, the archive and the export sign with the key', () => {
  const ctx = setup({ env: KEY_ENV });
  const { status, calls, out } = run(ctx, []);
  assert.equal(status, 0, out);
  const flags = KEY_FLAGS.replace('<key>', ctx.keyPath);
  const [archive, exportCall] = calls.filter((c) => c.startsWith('xcodebuild'));
  assert.match(archive, /^xcodebuild archive /);
  assert.ok(archive.includes(`-allowProvisioningUpdates ${flags}`), archive);
  assert.match(exportCall, /^xcodebuild -exportArchive /);
  assert.ok(exportCall.includes(`-allowProvisioningUpdates ${flags}`), exportCall);
  assert.ok(!calls.some((c) => c.startsWith('xcrun')), 'no upload without --upload');
});

test('--upload uploads the .ipa after the export, with the same key, and says so', () => {
  const ctx = setup({ env: KEY_ENV });
  const { status, calls, out } = run(ctx, ['--upload']);
  assert.equal(status, 0, out);
  const exportIndex = calls.findIndex((c) => c.startsWith('xcodebuild -exportArchive'));
  const uploadIndex = calls.findIndex((c) => c.startsWith('xcrun'));
  assert.ok(exportIndex >= 0 && uploadIndex > exportIndex, calls.join('\n'));
  assert.equal(
    calls[uploadIndex],
    `xcrun altool --upload-package ${join(ctx.mobile, 'build', 'Gauges-2.1.0-42', 'Gauges.ipa')} --api-key KEY1234567 ` +
      `--api-issuer 00000000-1111-2222-3333-444444444444 --p8-file-path ${ctx.keyPath} --output-format normal`,
  );
  assert.match(out, /UPLOAD OK: version 2\.1\.0, build 42/);
  assert.ok(!out.includes(KEY_CONTENT) && !out.includes(ctx.keyPath), 'the output shows no key and no key path');
});

test('--upload stops with a failure line and a non-zero exit when the upload fails', () => {
  const ctx = setup({ env: KEY_ENV });
  const { status, out } = run(ctx, ['--upload'], { FAKE_UPLOAD_EXIT: '1' });
  assert.equal(status, 1);
  assert.match(out, /STOP: The upload failed/);
  assert.doesNotMatch(out, /UPLOAD OK/);
});

test('--upload does not upload when the export makes no .ipa', () => {
  const ctx = setup({ env: KEY_ENV });
  const { status, out, calls } = run(ctx, ['--upload'], { FAKE_NO_IPA: '1' });
  assert.equal(status, 1);
  assert.match(out, /STOP: The export made no \.ipa/);
  assert.ok(!calls.some((c) => c.startsWith('xcrun')));
});

test('--upload without the key stops before the build', () => {
  const ctx = setup();
  const { status, out, calls } = run(ctx, ['--upload']);
  assert.equal(status, 1);
  assert.match(out, /STOP: --upload needs an App Store Connect API key/);
  assert.deepEqual(calls, [], 'no prebuild, no xcodebuild');
});

test('stops before the build for a partial key, a missing key file, or --upload with --unsigned', () => {
  for (const [options, args, message] of [
    [{ env: KEY_ENV.slice(0, 2) }, [], /Set all three of ASC_KEY_ID/],
    [{ env: KEY_ENV, keyFile: false }, [], /ASC_KEY_PATH in \.env\.local does not name a readable file/],
    [{ env: KEY_ENV }, ['--upload', '--unsigned'], /--upload needs a signed build/],
  ]) {
    const ctx = setup(options);
    const { status, out, calls } = run(ctx, args);
    assert.equal(status, 1, out);
    assert.match(out, message);
    assert.deepEqual(calls, []);
    assert.ok(!out.includes(ctx.keyPath));
  }
});

test('still refuses demo mode, also with --upload', () => {
  const ctx = setup({ env: KEY_ENV });
  const { status, out, calls } = run(ctx, ['--upload'], { EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1' });
  assert.equal(status, 1);
  assert.match(out, /STOP: EXPO_PUBLIC_FIREBASE_EMULATOR_HOST is set/);
  assert.deepEqual(calls, []);
  const noConfig = setup({ env: KEY_ENV });
  writeFileSync(join(noConfig.mobile, '.env.local'), '');
  const empty = run(noConfig, ['--upload']);
  assert.equal(empty.status, 1);
  assert.match(empty.out, /has no value in \.env\.local/);
  assert.deepEqual(empty.calls, []);
});

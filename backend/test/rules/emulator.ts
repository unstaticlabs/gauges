/**
 * Helpers for the tests that run against the local Firestore emulator.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The rules file in `backend/`. */
const RULES_FILE = 'firestore.rules';

/** Gives the text of `firestore.rules`. */
export function rulesText(): string {
  return readFileSync(resolve(__dirname, '../..', RULES_FILE), 'utf8');
}

export function hostAndPort(): { host: string; port: number } {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  return { host, port: Number(port) };
}

/**
 * Loads `firestore.rules` into the emulator for the project `demo-gauges`.
 * The data tests call it, because they do not use `initializeTestEnvironment`,
 * and a rules test that ran before can leave other rules in the emulator.
 */
export async function loadRules(): Promise<void> {
  const { host, port } = hostAndPort();
  const res = await fetch(`http://${host}:${port}/emulator/v1/projects/demo-gauges:securityRules`, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: RULES_FILE, content: rulesText() }] } }),
  });
  if (!res.ok) throw new Error(`Could not load ${RULES_FILE}: ${res.status} ${await res.text()}`);
}

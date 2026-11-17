import type { Strings } from './en';

/**
 * Gives the text for an error of a write. `error` is usually a `DataError`.
 * Set `transaction` for a write that needs a connection: `date` for
 * `editExecution` (also `true`), `pause` for `pauseGauge` and `resumeGauge`.
 */
export function errorMessage(
  error: unknown,
  strings: Strings,
  options: { transaction?: boolean | 'date' | 'pause' } = {},
): string {
  const code = error != null && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'unavailable':
      if (options.transaction === 'pause') return strings.errors.offlinePause;
      return options.transaction ? strings.errors.offlineTransaction : strings.errors.offline;
    case 'permission-denied':
      return strings.errors.permission;
    case 'not-found':
      return strings.errors.notFound;
    case 'invalid-argument':
      return strings.errors.invalid;
    case 'unauthenticated':
      return strings.errors.signedOut;
    case 'credential-in-use':
      return strings.errors.credentialInUse;
    case 'account-exists':
      return strings.errors.accountExists;
    case 'requires-recent-login':
      return strings.errors.recentLogin;
    default:
      return strings.errors.unknown;
  }
}

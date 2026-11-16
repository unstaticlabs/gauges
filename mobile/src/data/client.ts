/**
 * TypeScript reads this file. Metro does not: it picks `client.native.ts` on
 * iOS and Android, and `client.web.ts` on the web. Both files export the same
 * `getRepository` function and the same flags.
 */
export { anonymousAllowed, getRepository, loginProviders, signsInAutomatically } from './client.web';

# Data

This folder holds data access behind one interface. Screens import from
`@/data` only. They never import a Firebase SDK.

```ts
import { getRepository } from '@/data';

const repo = getRepository();
const stop = repo.subscribeMyGauges((gauges) => setGauges(gauges));
await repo.markDone(gaugeId);
```

## Files

| File | What it does |
|---|---|
| `repository.ts` | The `Repository` interface, its input types, and `DataError`. |
| `firestoreRepository.ts` | The shared logic. It works on a `Platform` (see `port.ts`). |
| `port.ts` | The small database and auth interface that a driver implements. |
| `mapping.ts` | Converts documents to app types and back. Checks names and fields. |
| `plans.ts` | Pure functions that give the writes of one batch. |
| `account.ts` | Login, account link, account merge, and account delete. |
| `providers.ts` | The names of the login providers, and the user conversion. |
| `nativeLogin.ts` | Gets the Google and Apple credentials on iOS and Android. |
| `invite.ts` | Builds and reads invite links. |
| `config.ts` | The settings of the deployment (`EXPO_PUBLIC_*` variables), demo mode, and the emulator switch. |
| `client.native.ts` | The iOS and Android driver (React Native Firebase, offline cache). |
| `client.web.ts` | The web driver (Firebase JS SDK). |
| `client.ts` | Lets TypeScript resolve `./client`. Metro picks the platform file. |

The drivers also export three flags:

| Flag | Native | Web |
|---|---|---|
| `signsInAutomatically` | `true`: the first start signs in anonymously. | `false`: the web shows the login screen. |
| `anonymousAllowed` | `true` | Only with the emulator (a development path). |
| `loginProviders` | Apple first on iOS, Google first on Android. | Google, then Apple. |

The live website never makes an anonymous user: the web driver refuses
`signInAnonymously` without the emulator. It also never runs as one:
an earlier web app of the same Firebase project can leave an anonymous
login in the browser, and `withoutAnonymous.ts` signs that user out at once. The
repository then sees no user, so it writes and deletes nothing.

## Database

| Path | Fields |
|---|---|
| `users/{uid}` | `name`, and `hasCompletedTutorial` from the old app |
| `gauges/{gaugeId}` | The fields of `Gauge`, plus `joinVia` (see below) |
| `labels/{labelId}` | The fields of `Label`, plus `joinCode` for a short time after a join |
| `labels/{labelId}/invites/{code}` | `createdBy`, `createdAt`, `expiresAt` (`null` for no expiry) |
| `handovers/{code}` | `from`, `createdAt`, `expiresAt`, and `to` after the new account takes it |

Gauges and labels can also have `claimVia`: the code of the hand-over that
moved them to another account (see "Account merge").

A label can have `emoji`: one emoji that the user picked. It is optional. A
label of the old app, or one with no pick, has none, and the app shows a
default emoji (`DEFAULT_LABEL_EMOJI`). `createLabel(name, emoji)` sets it,
and `setLabelEmoji(labelId, emoji)` changes it for all members. `null`
removes it. The app writes one emoji only (`singleEmoji` in
`src/domain/emoji.ts`). The rules accept a string of 1 to 32 characters, or
`null`.

The database stores times as Firestore timestamps. The app types use epoch
milliseconds. `mapping.ts` converts them.

`backend/firestore.rules` controls the access. Keep `plans.ts` and the rules
in step: the rules accept exactly the writes that the plans make.

## Sharing

1. A member creates an invite. The repository gives a link such as
   `gauges://invite?label=<labelId>&code=<code>`. An https link with the same
   path and query works the same way.
2. The other user opens the link. `joinByInvite` adds the user to the label.
   The write carries the code in `joinCode`, and the rules check that the
   invite exists and did not expire.
3. Then the repository adds the user to each gauge in `label.gaugeIds`. Each
   write carries the label ID in `joinVia`. The rules accept a write that adds
   only the caller, when the caller is a member of that label and the label is
   on the gauge.

## Accounts

A user is anonymous until they link a login. The user ID is the account.
Each login (Google, Apple) is a provider of Firebase Auth on the same user,
so one user can have several logins. `AuthUser.logins` lists them.

| Case | What `logIn` does |
|---|---|
| No user (the website, or the phone after a log-out) | Signs in with the provider. A new login makes a new account. |
| Anonymous user, new login | Links the login. The user ID and the data stay. |
| Anonymous user, the login has an account, no data on the device | Switches to that account. No question. |
| Anonymous user, the login has an account, data on the device | Asks `decide`: merge, leave out, or cancel. |
| User with a login, the new login has another account | Rejects with `credential-in-use`. Two accounts with logins do not merge. |

To add a provider (for example an email link), add its name to
`LoginProvider`, map it in `providers.ts`, get its credential in the
drivers, and add a button and its text.

### Account merge

The old anonymous account cannot learn the new user ID before the sign-in,
and the device cannot write as the old account after it. So the merge
uses a hand-over:

1. As the old account, the device writes a record to its store: a new
   secret code and the list of its gauges and labels. Then it creates
   `handovers/{code}` with `from`, and deletes the old profile.
2. The device signs in to the new account.
3. As the new account, the device sets `to` on the hand-over. From now on,
   only this account can use the code. For each label and gauge in the
   record, it adds itself next to the old account and takes its place as
   creator (`claimVia` names the code for the rules). Then it removes the
   old account and gives the old executions to the new account.
4. It copies the old name if the new account has none, and deletes the
   hand-over and the record.

Each step can run again. If the app stops after step 1, `resumeMerge` ends
the merge on the next start (`AppGate` calls it). If the app stops before
the sign-in, `resumeMerge` undoes step 1. A hand-over expires after 7 days
if the new account did not take it.

Other members of a shared label see the new account in place of the old
one, with no duplicate. The old anonymous user stays in Firebase Auth with
no data and no profile.

"Leave out" deletes the data of the old account first: it leaves the
shared labels and deletes the private gauges and labels.

### Account delete

`deleteAccount` leaves the shared labels, deletes the gauges that only the
user has, leaves the gauges of others, deletes the private labels and the
profile, then deletes the auth user. A gauge that the user created and
that other members use stays with them: the rules keep its creator in
`members`, so the deleted user ID stays on it. On iOS, the driver first
asks Apple again and revokes the Apple tokens (App Store rule). If the
server needs a fresh login, the call rejects with `requires-recent-login`:
call `reauthenticate`, then call it again.

## Creates do not wait

`createGauge` and `createLabel` return `{ id, saved }` at once. The client
makes the ID, and the local cache shows the new document at once, also
offline. `saved` resolves when the server accepts the writes. Screens close
the form at once and show a toast when `saved` rejects.

The rules accept a new gauge with no labels and no executions only. So
`createGauge` queues one batch for the create, one for the first execution,
and one for each label. The SDK sends them to the server in that order. If
a label write fails, the gauge exists without that label, and `saved`
rejects. A single batch cannot do it: Firestore checks the merged result of
a batch as one create.

`createGauge` and `addLabelToGauge` take the members of a label from the
live list of labels when it runs, so that they do not wait for a read.

## Errors

Each write returns a promise that rejects with a `DataError`. Its `code` is
`unauthenticated`, `permission-denied`, `not-found`, `invalid-argument`,
`unavailable`, or `unknown`.

## Tests

- `__tests__/` holds unit tests for the pure code. `npm test` runs them.
- `backend/test/data/` runs the shared code and the web driver against the
  Firebase emulator. Run `npm test` in `backend/`.

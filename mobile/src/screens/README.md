# Screens

This folder holds the screens. The routes in `app/` stay thin: each route
renders one screen from here.

| Folder or file | What it holds |
|---|---|
| `home/` | The home screen: the greeting, all active gauges or one row for each label, search, the swipe rows (`GaugeRow`, rules in `swipe.ts`), "Add a gauge" at the end (`AddGaugeRow`), and the empty states (`EmptyHome`). `GaugeList`, `useMarkDone`, and `useGaugeActions` are shared with the label page and the gauge page. |
| `gauge/` | The gauge page (state, settings, history, archive, delete) and the create form, with the labels (`LabelPicker`), the switch "Remind me about this gauge", and the form logic in `form.ts`. |
| `labels/` | The label row, the label page, the page of gauges with no label, the edit sheet (emoji, name, leave, delete), and the member avatars. |
| `share/` | The share sheet (QR code and link), the join screen (scan or paste), the name sheet that comes before a share or a join, and the QR scanner. |
| `settings/` | The name of the user, the labels, the reminders (`RemindersSection`), the archived gauges, the account, and the app version. |
| `account/` | The start screen (the login gate on the web), the login buttons, the Account section of Settings, and the question before a merge. |
| `AppGate.tsx` | Shows the screens only after sign-in. With no user, it shows the start screen. It also ends a merge that stopped. |
| `StatusView.tsx` | The full-screen view for loading, an error, or a message. |
| `Section.tsx` | A titled group of controls, with a short bold title and no box. |
| `WebsiteLinks.tsx` | The links to the privacy policy, the legal notice, and help on the website. Settings and the start screen show them. |

## Home and the gauge page

- The greeting states a fact: "Hey Sam, 2 gauges are low." A low gauge is
  red. The name opens Settings. With no name, the line starts with the
  number.
- At the top right: the switch "All gauges / By label" and Settings. The
  search opens from the icon at the top left. The search field takes the
  focus when it opens, so the keyboard opens at once. "Cancel" and the
  icon close the search and the keyboard. The home list adds the height of
  the keyboard at its end, so the last rows and "Add a gauge" stay in
  reach. The two buttons of the
  switch tell screen readers and the browser which one is on
  (`aria-pressed`). The two views stay mounted after the first time they
  show, so that the switch is fast: a new mount of 35 rows took 2 seconds
  on the Android emulator.
- "Add a gauge" is the last row of the list, as in the old app, in both
  views. During a search it reads `Add “text”` and fills in the name of the
  new gauge, also when no gauge matches. The label page has it too, with
  the label preset, and the page of gauges with no label.
- The rows work as in a mail app (`home/swipe.ts`):
  - A short swipe to the right shows a green "Done" button. It stays open
    until a tap. A full swipe to the right marks the gauge done.
  - A short swipe to the left shows Delete, Archive, and Edit. Delete asks
    first. Archive shows a toast with "Undo". A full swipe to the left
    opens the gauge page.
  - One row is open at a time. A scroll, a tap on a row, or a move to
    another screen closes it (`home/openRow.ts`).
  - A tap on a row does nothing else, and the row has no pressed color.
- Marking done: the bar fills, a green check and a short burst of sparks
  show (none with "reduce motion"), then the row moves to its new place,
  and a toast offers "Undo". The phone gives a success feedback: the system
  success pattern on iOS, and on Android the system "confirm" effect and a
  strong pulse (the success pattern of `expo-haptics` is weak on Android).
- A vertical drag always scrolls, also when it starts on a row and is a
  little diagonal. The swipe starts only after 14 points to the side, and
  it fails after 10 points up or down (`failOffsetY`). On the website, the
  row has `touch-action: pan-y`, so that the browser scrolls the page. The
  gesture config sets it, because in gesture-handler 3.3 the detector
  prop alone gets lost on the web.
- Screen readers get the actions "Mark as done", "Edit", "Archive", and
  "Delete" on each row. The website also shows a small "⋯" button at the
  end of the bar of each row, for a mouse and a keyboard. It opens a menu
  with the same four actions. It shows on all screen sizes of the website,
  because a phone browser has no screen reader actions either.
- Until the first swipe on the device, a line above the home list explains
  both directions, and the first row opens a little to the right, then to
  the left, one time in each app start (`STORAGE_KEYS.swipeLearned`). The
  label page has no hint line.
- With no active gauge, the home screen offers "Add your first gauge". A
  user with no login (on the phone) also gets the Google and Apple buttons
  there, with the line "Log in to bring back your gauges." When the user
  has a gauge, the home screen shows no login buttons.
- Each row gets the level as a whole number and the last time as text, and
  the data layer keeps the objects of the gauges that did not change
  (`reuseUnchanged`). A memoized row then renders again only when it
  changes, not on each tick of the clock or on each snapshot.
- The gauge page has the state (the same bar as the rows), the settings of
  the gauge, the switch "Remind me about this gauge", the history (the 5
  most recent executions, and "I did it on…"), then Archive and Delete. It
  has no "Done" button: the row has the action. Save shows only when there
  is a change. A press on an execution opens a sheet to change its time or
  to remove it.
- A form with changes asks "Discard your changes?" before it closes
  (`usePreventRemove`).
- A toast that is older than 0.7 seconds goes away when the screen changes,
  so that it does not cover a button of the next screen.

## Rules

- Read the data from the hooks in `@/state`. Write through `getRepository()`
  from `@/data`.
- Take each user-visible string from `t` in `@/i18n`.
- A write that the local cache shows at once (for example `markDone`) does
  not block the screen. Its error comes back as a toast. `editExecution` is a
  transaction and needs a connection, so the screen waits for it and shows
  the error.
- Unit-test the pure logic, for example in `gauge/__tests__/form.test.ts`.

## Labels and sharing

- The home toggle switches between all gauges and one row for each label.
  `HomeViewProvider` stores the choice on the device.
- A label row shows the emoji of the label, the aggregated level
  (`labelLevel` in the mode of the label), the number of active gauges, and
  the avatars when the label has more than one member. The worst label
  comes first. The gauges
  with no label of the user get a last row, "No label", with 📋. It is
  hidden when it is empty.
- Each label has an emoji. A new label gets an emoji from its name when a
  word matches (`suggestEmoji`, French and English), else the default 🏷️.
  The edit sheet of the label has a grid of 24 emoji and a field for any
  other emoji from the system keyboard. The field keeps the last emoji only.
- The edit sheet of a label has two parts: "Name" (the emoji, the name,
  the leave, and the delete) and "Level" (`LevelModePicker`). The level
  mode says which gauges make the level of the label: the worst gauge, the
  lower half (the default), the typical gauge (the median), or the average.
  Each option draws the gauges of the label from low to high, with the
  gauges that count in color, a line at the level of that mode, and the bar
  of the label. A label with fewer than two gauges shows an example. One
  Save writes the changes of both parts, for all members. The label page
  names the mode in a line below its bar. That line opens the sheet on
  "Level".
- Settings lists the labels. A row opens the label page, where the user
  shares or edits the label.
- The search in the view by label shows the labels whose name matches,
  then the gauges whose name matches. Both ignore case and accents.
- Avatars show on a gauge row only when the gauge has more than one member.
  The order is the last person who did the chore first. Names come from
  `ProfilesProvider`. It loads them again when the app comes back to the
  front, and every 5 minutes. A member with no name gets a person icon.
- The device keeps one invite for each label until it has less than one
  hour left (`state/inviteStore.ts`). A new invite is valid for 7 days.
- A join and a new invite need the server. The screens stop the wait after
  15 seconds (`share/timeout.ts`) and say that the device is offline. The
  queued join still ends when the device is online again; the join screen
  then shows "You are already a member".
- The routes are `/label/[id]`, `/unlabeled`, and `/invite`. The invite
  route takes `label` and `code`, so `gauges://invite?label=…&code=…` opens
  it.

## Account

- On the phone, the first start signs in anonymously, with no login wall.
  Settings shows why a login helps, and the Google and Apple buttons.
- A log-out leads to the start screen: log in, or continue without an
  account. The phone keeps this choice after a restart
  (`STORAGE_KEYS.loggedOut`). A purely anonymous user cannot log out: they
  would lose everything.
- The website shows the start screen as the login gate. Only the emulator
  build shows "Continue without an account".
- `useLogIn` runs a login and asks the merge question in a sheet with
  three choices. The result comes back as a toast.
- iOS uses the system Apple button (`AppleLoginButton.ios.tsx`). Android
  and the web draw the button with the Apple logo, as Apple allows. The
  Google button follows the Google brand colors.

## Reminders

- Settings → Reminders has the switch, the time (`TimeField`), and a line
  with the next reminder, for example "Next: today at 18:00 — Change the
  sheets and Water the plants". Before the system prompt, the line asks for
  the permission, with the button "Allow notifications". If the system
  shows no prompt anymore, the line explains it, and a button opens the
  notification settings of the app (on Android, the page of the app
  notifications directly).
- On the web, the section has one line only: "Reminders work in the
  Gauges app on your phone."
- The gauge page has the switch "Remind me about this gauge". It calls
  `setMuted` and shows on the web too, because the choice is for the phone
  app of the same user.

## Dates and times

- The text is in English, but a date and a time follow the device:
  `src/i18n/locale.ts` reads the region and the 12-hour or 24-hour setting
  with `expo-localization`, and makes a tag such as `en-FR`. In France, a
  date reads "Sat, 14 Nov, 18:05".
- The JavaScript engine alone does not know the 24-hour setting of the
  phone, so the app needs `expo-localization` for it.
- "N days ago" counts calendar days: a time on the date three days before
  is "3 days ago", also when it was later in the day than now.

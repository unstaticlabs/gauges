import { WEBSITE_URL } from '../data/config';

/**
 * The English text of the app. Each user-visible string is here, so that a
 * second language needs one more file of the same shape (`Strings`).
 */
export const en = {
  locale: 'en',

  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    undo: 'Undo',
    retry: 'Try again',
    close: 'Close',
    continue: 'Continue',
    rename: 'Rename',
  },

  app: {
    loading: 'Loading…',
    loadError: 'Could not load your gauges.',
    signInError: 'Could not sign in.',
  },

  account: {
    // The start screen: the login gate on the web, and the start after a sign-out on the phone.
    startTitle: 'Gauges',
    startBody: 'See at a glance which chores need you, and share them with the people you live with.',
    startBodyWeb: 'Log in to see your gauges.',
    continueWith: (provider: string) => `Continue with ${provider}`,
    withoutAccount: 'Continue without an account',
    withoutAccountHelp: 'Your gauges stay on this phone only. You can log in later in Settings.',
    providers: { google: 'Google', apple: 'Apple' },
    // Settings
    section: 'Account',
    anonymousBody:
      'Your gauges are only on this phone. Log in to keep them safe and to see them on your other devices.',
    loggedInWith: 'Your logins',
    loginRow: (provider: string, email: string | null) => (email ? `${provider}, ${email}` : provider),
    noEmail: 'Email hidden',
    addLogin: 'Add another login, to log in with either one.',
    unlink: 'Remove',
    unlinkLabel: (provider: string) => `Remove the ${provider} login`,
    unlinkConfirmTitle: (provider: string) => `Remove the ${provider} login?`,
    unlinkConfirmBody: 'You can still log in with your other login.',
    unlinked: (provider: string) => `${provider} login removed`,
    signOut: 'Log out',
    signOutConfirmTitle: 'Log out?',
    signOutConfirmBody: 'Your gauges stay in your account. Log in again to see them.',
    deleteAccount: 'Delete my account',
    deleteConfirmTitle: 'Delete your account?',
    deleteConfirmBody:
      'This deletes your account, your gauges, your labels, and your name. You leave your shared labels. Gauges that you created and share with others stay with them. You cannot undo this.',
    deleteConfirmBodyAnonymous:
      'This deletes all your gauges, your labels, and your name from this phone. You leave your shared labels. You cannot undo this.',
    deleteReauthTitle: 'Log in again',
    deleteReauthBody: 'To delete your account, log in one more time.',
    deleted: 'Your account is deleted.',
    // The results of a login
    linked: (provider: string) => `${provider} login added`,
    switched: 'You are logged in.',
    merged: (n: number) => (n === 1 ? '1 gauge added to your account' : `${n} gauges added to your account`),
    mergedLabels: 'The labels of this phone are now in your account.',
    mergeError: 'Could not add all the gauges of this phone. Try again later.',
    // The question before a merge
    mergeTitle: (n: number) =>
      n === 1 ? 'Add the gauge on this phone to your account?' : `Add the ${n} gauges on this phone to your account?`,
    mergeTitleLabels: 'Add the labels on this phone to your account?',
    mergeBody:
      'This account exists already. The gauges that you add are in your account on all your devices. Shared labels stay shared.',
    mergeAdd: 'Add to my account',
    mergeDiscard: 'Leave them out',
    mergeDiscardHelp: 'The gauges that you leave out are deleted.',
  },

  home: {
    title: 'Gauges',
    // The greeting: "Hey Sam, 2 gauges are low." It states a fact, never a slogan.
    hey: 'Hey',
    lowStatus: (low: number) =>
      low === 0 ? 'nothing is low.' : low === 1 ? '1 gauge is low.' : `${low} gauges are low.`,
    /** The greeting for a user with no name: the status with a capital letter. */
    statusAlone: (status: string) => status.charAt(0).toUpperCase() + status.slice(1),
    search: 'Search',
    searchPlaceholder: 'Search',
    clearSearch: 'Clear search',
    addGauge: 'Add a gauge',
    settings: 'Settings',
    viewLabel: 'View',
    viewAll: 'All gauges',
    viewLabels: 'By label',
    emptyTitle: 'No gauges yet',
    emptyBody: 'A gauge shows how long ago you did a chore. It empties over time and fills again when you mark it done.',
    emptyAction: 'Add your first gauge',
    noResultTitle: 'No gauge found',
    noResultBody: (query: string) => `No gauge name contains “${query}”.`,
    markDone: 'Mark as done',
    swipeDone: 'Done',
    swipeHint: 'Swipe right when you do a chore. Swipe left to pause or edit.',
    doneToast: (name: string) => `${name}: done`,
    rowHint: 'Swipe right to mark it as done. Swipe left to pause or edit.',
    // The buttons that a swipe to the left shows, and the menu of a row on the website.
    // An active row has "Pause", and a paused row has "Archive". Delete is on the gauge page only.
    edit: 'Edit',
    archive: 'Archive',
    rowActions: (name: string) => `Actions for ${name}`,
    // The pause of a gauge. A paused gauge does not empty and gets no reminder.
    pause: 'Pause',
    resume: 'Resume',
    swipeResume: 'Resume',
    rowHintPaused: 'Swipe right to resume it. Swipe left to archive or edit.',
    /** The heading above the paused gauges at the end of a list. */
    pausedSection: 'Paused',
    /** The second line of a paused row, in place of "Done … ago". */
    pausedSince: (date: string) => `Paused since ${date}`,
    pausedSpoken: 'paused',
    pausedToast: (name: string) => `${name}: paused`,
    resumedToast: (name: string) => `${name}: resumed`,
    /** The action at the end of the list during a search: it creates a gauge with this name. */
    addNamed: (name: string) => `Add “${name}”`,
    // The empty home of a user with no login.
    loginTitle: 'Used Gauges before?',
    loginBody: 'Log in to bring back your gauges.',
    noLabelsTitle: 'No labels yet',
    noLabelsBody: 'Add labels such as “Home” or “Car” to your gauges. Each label then gets one row here.',
    noLabelsAction: 'Show all gauges',
    labelsSection: 'Labels',
    gaugesSection: 'Gauges',
    noResultBodyLabels: (query: string) => `No label or gauge name contains “${query}”.`,
  },

  labels: {
    noLabel: 'No label',
    gaugeCount: (n: number) => (n === 1 ? '1 gauge' : `${n} gauges`),
    noGauges: 'No gauges',
    /** The number of paused gauges of a label, after the number of gauges. */
    pausedCount: (n: number) => `${n} paused`,
    /** In place of the level of a label whose gauges are all paused. */
    allPaused: 'All paused',
    cardHint: 'Opens the gauges with this label',
    sharedWith: (names: string) => `Shared with ${names}`,
    someone: 'Someone',
    you: 'You',
    onlyYou: 'Only you',
    members: (n: number) => (n === 1 ? '1 member' : `${n} members`),
    pageEmptyTitle: 'No gauges with this label',
    pageEmptyBody: 'Add a gauge here, or add this label to a gauge.',
    unlabeledEmpty: 'Each gauge has a label.',
    shareLabel: (name: string) => `Share ${name}`,
    edit: (name: string) => `Edit ${name}`,
    notFound: 'This label does not exist anymore, or you left it.',
    waitingForLabel: 'Opening the label…',
    // The form
    formPlaceholder: 'Add a label',
    formHelp: 'Type a name and press Enter. A new name creates a label.',
    formCreate: (name: string) => `Create “${name}”`,
    formRemove: (name: string) => `Remove the label ${name}`,
    formAdd: (name: string) => `Add the label ${name}`,
    formMax: (max: number) => `A gauge can have ${max} labels at most.`,
    // Edit
    emoji: 'Emoji',
    emojiOther: 'Other emoji',
    emojiDefault: (emoji: string) => `Use ${emoji}`,
    emojiInvalid: 'Type one emoji, for example from the emoji keyboard.',
    renameField: 'Name',
    // The level mode, in the edit sheet and on the label page
    tabName: 'Name',
    tabLevel: 'Level',
    tabsLabel: 'What to edit',
    levelTitle: 'How the label level counts',
    levelIntro: 'The bar of the label comes from the bars of its gauges. Choose which gauges count.',
    levelLine: (mode: string) => `Level: ${mode}`,
    levelLineHint: 'Changes how the level of the label counts',
    levelShown: (shown: number, total: number) => `Shows ${shown} of ${total} gauges, from low to high.`,
    levelSample: 'An example with 5 gauges. With more gauges, this shows your own.',
    levelOption: (mode: string, percent: number, help: string) => `${mode}: ${percent}%. ${help}`,
    levelModes: {
      worst: {
        label: 'Worst gauge',
        line: 'worst gauge',
        help: 'As low as the lowest gauge. For a label where every chore matters, such as Pets.',
      },
      lowerHalf: {
        label: 'Lower half',
        line: 'lower half',
        help: 'The mean of the lower half. One late chore pulls it down, but not alone.',
      },
      median: {
        label: 'Typical gauge',
        line: 'typical gauge',
        help: 'The gauge in the middle. A few late chores do not change it. For a big label such as Home.',
      },
      average: {
        label: 'Average',
        line: 'average',
        help: 'The mean of all the gauges: the overall state.',
      },
    },
    saved: 'Label saved',
    deleteLabel: 'Delete label',
    deleteConfirmTitle: (name: string) => `Delete the label ${name}?`,
    deleteConfirmShared:
      'The gauges stay, but the label goes away for all members. Members lose the gauges that they have only through this label.',
    deleteConfirmPrivate: 'The gauges stay. Only the label goes away.',
    deleted: (name: string) => `${name}: deleted`,
    leave: 'Leave label',
    leaveConfirmTitle: (name: string) => `Leave ${name}?`,
    leaveConfirmBody:
      'You lose access to the gauges that you have only through this label. The gauges that you created stay with you. To come back, you need a new invite.',
    left: (name: string) => `You left ${name}`,
    deleteHelpCreator: 'Only the creator of a shared label can delete it.',
  },

  share: {
    title: (name: string) => `Share ${name}`,
    intro: 'Scan this code with the other phone, or send the link. Then you both see and update all the gauges with this label.',
    qrLabel: 'QR code of the invite link',
    copy: 'Copy link',
    copied: 'Link copied',
    shareLink: 'Send link',
    shareMessage: (name: string, url: string) => `Join my label “${name}” in Gauges: ${url}`,
    expires: (date: string) => `The link works until ${date}.`,
    reset: 'Reset link',
    resetHelp: 'The old link and QR code stop working.',
    resetConfirmTitle: 'Reset the link?',
    resetDone: 'New link ready',
    membersTitle: 'Members',
    creating: 'Making the link…',
    createError: 'Could not make a link.',
  },

  join: {
    title: 'Join a label',
    menu: 'Join a shared label',
    intro: 'Scan the QR code on the other phone, or paste the link that you got.',
    scan: 'Scan a QR code',
    scanTitle: 'Scan the QR code',
    scanHelp: 'Point the camera at the QR code.',
    cameraDenied: 'Gauges cannot use the camera. Allow it in the settings of your phone, or paste the link.',
    cameraAllow: 'Allow the camera',
    openSettings: 'Open settings',
    pasteLabel: 'Invite link',
    pastePlaceholder: `${WEBSITE_URL}/invite?…`,
    paste: 'Paste',
    next: 'Next',
    notALink: 'This is not an invite link of Gauges.',
    confirmTitle: 'Join this shared label?',
    confirmBody:
      'You get access to all the gauges with this label. The other members see your name and when you mark a gauge as done.',
    confirm: 'Join',
    joining: 'Joining…',
    joined: (name: string) => `You joined ${name}`,
    alreadyMember: 'You are already a member of this label.',
    invalidTitle: 'This link does not work',
    invalidBody: 'It expired, or a member made a new link. Ask for a new one.',
    offlineTitle: 'You are offline',
    offlineBody: 'Joining a label needs a connection. If you keep this screen open, the join ends when you are online again.',
    errorTitle: 'Could not join',
    otherLink: 'Use another link',
  },

  name: {
    title: 'What is your name?',
    bodyShare: 'The members of a shared label see this name on their gauges.',
    field: 'Your name',
    save: 'Save and continue',
  },

  gauge: {
    newTitle: 'New gauge',
    editTitle: 'Edit gauge',
    name: 'Name',
    namePlaceholder: 'For example: Water the plants',
    nameRequired: 'Enter a name.',
    nameTooLong: (max: number) => `Use ${max} characters or fewer.`,
    interval: 'Repeat every … days',
    intervalOther: 'Other number of days',
    intervalDaysInput: 'Number of days',
    intervalInvalid: (max: number) => `Enter a whole number from 1 to ${max}.`,
    curve: 'How it empties',
    curves: {
      linear: { label: 'Steady', help: 'Empties at the same speed all the time.' },
      late: { label: 'Last minute', help: 'Stays full for a long time, then empties fast.' },
      ease: { label: 'Gradual', help: 'Empties slowly, then faster, then slowly again.' },
    },
    redAfter: (days: number) =>
      days <= 1 ? 'Turns red after about 1 day.' : `Turns red after about ${days} days.`,
    redIn: (days: number) =>
      days === 0 ? 'Turns red today.' : days === 1 ? 'Turns red tomorrow.' : `Turns red in about ${days} days.`,
    levelLabel: 'Level',
    lastDone: 'When did you last do this?',
    lastDoneNow: 'Now',
    history: 'History',
    historyEmpty: 'Not done yet.',
    addPast: 'I did it on…',
    showMore: (count: number) => `Show ${count} more`,
    byMe: 'You',
    bySomeone: 'Someone else',
    changeDate: 'Change the date',
    changeDateHint: 'Changes the date, or removes this entry',
    removeExecution: 'Remove',
    removeExecutionConfirm: 'Remove this entry from the history?',
    executionDate: 'Date and time',
    futureDate: 'The date cannot be in the future.',
    pause: 'Pause',
    resume: 'Resume',
    pauseHelp: 'A paused gauge stops emptying and gets no reminder.',
    pausedHelp: 'This gauge does not empty and gets no reminder until you resume it.',
    archive: 'Archive',
    archivedToast: (name: string) => `${name}: archived. Restore it in Settings.`,
    deleteGauge: 'Delete gauge',
    deleteConfirmTitle: (name: string) => `Delete ${name}?`,
    deleteConfirmBody: 'This removes the gauge and its history for all members. You cannot undo it.',
    unsavedTitle: 'Discard your changes?',
    unsavedBody: 'You did not save them.',
    discard: 'Discard',
    keepEditing: 'Keep editing',
    notFound: 'This gauge does not exist anymore.',
    labels: 'Labels',
    saved: 'Saved',
  },

  settings: {
    title: 'Settings',
    myName: 'Your name',
    myNamePlaceholder: 'Your name',
    myNameHelp: 'Other members see this name.',
    nameSaved: 'Name saved',
    labels: 'Labels',
    labelsEmpty: 'No labels yet. Add one to a gauge on its page. Share a label to share all its gauges.',
    labelRowHint: 'Opens the label, to share or edit it',
    archived: 'Archived gauges',
    archivedEmpty: 'No archived gauges.',
    archivedAgo: (relative: string) => `Archived ${relative}`,
    restore: 'Restore',
    restoredToast: (name: string) => `${name}: restored`,
    version: (version: string) => `Gauges ${version}`,
    versionHint: 'Copies a support code with your user ID',
    supportCode: (version: string, platform: string, uid: string) => `Gauges ${version} (${platform}) user ID: ${uid}`,
    supportCodeCopied: 'Support code copied. It contains your user ID.',
  },

  /** The links to the static pages of the website, in Settings and on the start screen. */
  links: {
    privacy: 'Privacy policy',
    legal: 'Legal notice',
    support: 'Help',
  },

  reminders: {
    // Settings
    section: 'Reminders',
    toggle: 'Daily reminder',
    toggleHelp: 'One notification a day, only on days when a gauge is red.',
    time: 'Time',
    timeLabel: 'Time of the daily reminder',
    next: (when: string, names: string) => `Next: ${when} — ${names}`,
    nonePlanned: (days: number) => `No reminder planned: nothing turns red in the next ${days} days.`,
    today: (time: string) => `today at ${time}`,
    tomorrow: (time: string) => `tomorrow at ${time}`,
    onDay: (day: string, time: string) => `${day} at ${time}`,
    denied: 'Notifications are off for Gauges. Turn them on in the settings of your phone.',
    openSettings: 'Open notification settings',
    notAsked: 'Gauges needs your permission to show the reminder.',
    allow: 'Allow notifications',
    web: 'Reminders work in the Gauges app on your phone.',
    // The Android channel, in the system settings of the app.
    channel: 'Daily reminder',
    // The notification
    title: (n: number) => (n === 1 ? '1 gauge is low' : `${n} gauges are low`),
    /** `shown` has one name or more. `more` is the number of names that are left out. */
    list: (shown: string[], more: number) => {
      if (more > 0) return `${shown.join(', ')}, and ${more} more`;
      if (shown.length <= 2) return shown.join(' and ');
      return `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`;
    },
    // The gauge page
    mute: 'Remind me about this gauge',
    muteHelp: 'Your daily reminder can name this gauge when it is red. This choice is only for you.',
    muteHelpWeb: 'For the daily reminder of the Gauges app on your phone. This choice is only for you.',
  },

  time: {
    justNow: 'just now',
    never: 'Never done',
    lastDone: (relative: string) => `Done ${relative}`,
    every: (days: number) => (days === 1 ? 'Every day' : `Every ${days} days`),
    days: (days: number) => (days === 1 ? '1 day' : `${days} days`),
    // Used when `Intl.RelativeTimeFormat` is missing.
    agoFallback: {
      minute: (n: number) => (n === 1 ? '1 minute ago' : `${n} minutes ago`),
      hour: (n: number) => (n === 1 ? '1 hour ago' : `${n} hours ago`),
      day: (n: number) => (n === 1 ? 'yesterday' : `${n} days ago`),
      week: (n: number) => (n === 1 ? 'last week' : `${n} weeks ago`),
      month: (n: number) => (n === 1 ? 'last month' : `${n} months ago`),
      year: (n: number) => (n === 1 ? 'last year' : `${n} years ago`),
    },
  },

  errors: {
    offline: 'You are offline. Try again when you have a connection.',
    offlineTransaction: 'You are offline. Changing a date needs a connection.',
    offlinePause: 'You are offline. A pause or a resume needs a connection.',
    permission: 'You do not have access to this gauge anymore.',
    notFound: 'This item does not exist anymore. Another device changed it.',
    invalid: 'Check the values and try again.',
    signedOut: 'You are signed out.',
    credentialInUse: 'This login belongs to another account. Log out first, then log in with it.',
    accountExists: 'An account with this email exists with another login. Log in with that one first.',
    recentLogin: 'Log in again, then try again.',
    unknown: 'Something went wrong. Try again.',
  },
};

export type Strings = typeof en;

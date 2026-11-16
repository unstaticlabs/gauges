import { getStoredInvite, isUsable, newInviteExpiry, setStoredInvite } from '../inviteStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const DAY = 24 * 60 * 60 * 1000;
const invite = (labelId: string, expiresAt: number | null) => ({
  labelId,
  code: 'c'.repeat(43),
  url: `gauges://invite?label=${labelId}&code=${'c'.repeat(43)}`,
  expiresAt,
});

describe('inviteStore', () => {
  it('gives an expiry 7 days after now', () => {
    expect(newInviteExpiry(1000)).toBe(1000 + 7 * DAY);
  });

  it('shows an invite again only while it has more than one hour left', () => {
    expect(isUsable(invite('a', 10 * DAY), 0)).toBe(true);
    expect(isUsable(invite('a', 30 * 60 * 1000), 0)).toBe(false);
    expect(isUsable(invite('a', null), 0)).toBe(true);
    expect(isUsable(undefined, 0)).toBe(false);
  });

  it('stores one invite for each label and user, and drops expired ones', async () => {
    await setStoredInvite('u1', 'a', invite('a', 5 * DAY), 0);
    await setStoredInvite('u1', 'b', invite('b', 1 * DAY), 0);
    expect(await getStoredInvite('u1', 'a')).toMatchObject({ labelId: 'a' });
    expect(await getStoredInvite('u2', 'a')).toBeUndefined();
    // Two days later, the invite of b expired. A write drops it.
    await setStoredInvite('u1', 'a', null, 2 * DAY);
    expect(await getStoredInvite('u1', 'a')).toBeUndefined();
    expect(await getStoredInvite('u1', 'b')).toBeUndefined();
  });
});

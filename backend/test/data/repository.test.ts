/**
 * Runs the shared repository code and the web driver of the app
 * (`mobile/src/data`) against the local Firestore and Auth emulators. Each
 * user has their own Firebase app, as on two phones.
 */
import { createWebRepository, disposeWebApps } from '../../../mobile/src/data/client.web';
import { type EmulatorConfig, WEBSITE_URL } from '../../../mobile/src/data/config';
import type { Gauge, Label } from '../../../mobile/src/domain/types';
import { gaugeLevel } from '../../../mobile/src/domain/level';
import { isPaused } from '../../../mobile/src/domain/pause';
import { makeGauge as makeGaugeStub } from '../../../mobile/src/domain/__testSupport__/makeGauge';
import { type Created, DataError, type Repository } from '../../../mobile/src/data/repository';

import { loadRules } from '../rules/emulator';

const PROJECT = 'demo-gauges';

function emulator(): EmulatorConfig {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  const authPort = (process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099').split(':')[1];
  return { host, firestorePort: Number(port), authPort: Number(authPort) };
}

async function clearEmulators(): Promise<void> {
  const e = emulator();
  await fetch(
    `http://${e.host}:${e.firestorePort}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  await fetch(`http://${e.host}:${e.authPort}/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  });
}

/** Waits until the server accepts a create, and gives the new ID. */
async function saved<Id extends string>(created: Created<Id>): Promise<Id> {
  await created.saved;
  return created.id;
}

let counter = 0;

/** Makes a signed-in user with their own Firebase app. `now` replaces the clock of the repository. */
async function newUser(now?: () => number): Promise<{ repo: Repository; uid: string }> {
  counter += 1;
  const repo = createWebRepository({ appName: `user-${counter}`, emulator: emulator(), now });
  const user = await repo.signInAnonymously();
  return { repo, uid: user.uid };
}

/** Waits until the live list matches `predicate`, then stops the subscription. */
function waitFor<T>(
  subscribe: (onData: (items: T[]) => void, onError: (e: DataError) => void) => () => void,
  predicate: (items: T[]) => boolean,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    let done = false;
    let stop: (() => void) | null = null;
    const timer = setTimeout(() => {
      done = true;
      stop?.();
      reject(new Error('Timeout: the live list did not reach the expected state.'));
    }, 10000);
    stop = subscribe(
      (items) => {
        if (done || !predicate(items)) return;
        done = true;
        clearTimeout(timer);
        setTimeout(() => stop?.(), 0);
        resolve(items);
      },
      (error) => {
        done = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const gaugesOf = (repo: Repository) => repo.subscribeMyGauges.bind(repo);
const labelsOf = (repo: Repository) => repo.subscribeMyLabels.bind(repo);
const byId = (id: string) => (gauges: Gauge[]) => gauges.find((g) => g.id === id);

async function gaugeAs(repo: Repository, id: string): Promise<Gauge> {
  const list = await waitFor(gaugesOf(repo), (gs) => gs.some((g) => g.id === id));
  return byId(id)(list)!;
}

beforeAll(() => {
  // The SDK logs each denied write. Some tests expect denied writes.
  const warn = console.warn;
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('@firebase/firestore')) return;
    warn(...args);
  });
});

// The data layer must work with the final rules.
beforeAll(async () => {
  await loadRules();
});

beforeEach(async () => {
  await clearEmulators();
});

afterAll(async () => {
  await disposeWebApps();
});

describe('repository on the emulator', () => {
  it('creates a gauge and shows it in the live list', async () => {
    const alice = await newUser();
    const id = await saved(alice.repo.createGauge({ name: ' Water plants ', repeatDays: 3, curve: 'late' }));
    const g = await gaugeAs(alice.repo, id);
    expect(g).toMatchObject({
      id,
      name: 'Water plants',
      repeatDays: 3,
      curve: 'late',
      members: [alice.uid],
      createdBy: alice.uid,
      labelIds: [],
      executions: [],
      archivedAt: null,
    });
    expect(typeof g.createdAt).toBe('number');
  });

  it('gives the ID of a new gauge before the server answers', async () => {
    const alice = await newUser();
    const created = alice.repo.createGauge({ name: 'Bins', repeatDays: 7, curve: 'linear' });
    // The call returns at once, with a client ID and a pending promise.
    expect(created.id).toMatch(/^[A-Za-z0-9]{20}$/);
    let settled = false;
    void created.saved.then(() => (settled = true));
    expect(settled).toBe(false);
    await created.saved;
    expect((await gaugeAs(alice.repo, created.id)).name).toBe('Bins');
  });

  it('creates a gauge with two labels, a new label, and a first execution', async () => {
    const alice = await newUser();
    const existing = await saved(alice.repo.createLabel('Home'));
    // A label from the same moment, not yet on the server.
    const fresh = alice.repo.createLabel('Plants');
    const created = alice.repo.createGauge({
      name: 'Water',
      repeatDays: 3,
      curve: 'linear',
      labelIds: [existing, fresh.id],
      doneAt: 5000,
    });
    await Promise.all([fresh.saved, created.saved]);
    const g = await waitFor(gaugesOf(alice.repo), (gs) => byId(created.id)(gs)?.labelIds.length === 2);
    expect(byId(created.id)(g)).toMatchObject({
      labelIds: expect.arrayContaining([existing, fresh.id]),
      executions: [{ at: 5000, by: alice.uid }],
    });
    const labels = await waitFor(labelsOf(alice.repo), (ls: Label[]) =>
      ls.length === 2 && ls.every((l) => l.gaugeIds.includes(created.id)),
    );
    expect(labels).toHaveLength(2);
  });

  it('gives the members of a shared label to a new gauge with that label', async () => {
    const { alice, bob, labelId } = await sharedGauge();
    // Alice holds a live copy of the label, as the app does.
    const stop = alice.repo.subscribeMyLabels(() => {});
    await waitFor(labelsOf(alice.repo), (ls: Label[]) => ls[0]?.members.length === 2);
    const created = alice.repo.createGauge({ name: 'Trash', repeatDays: 2, curve: 'linear', labelIds: [labelId] });
    await created.saved;
    stop();
    expect((await gaugeAs(bob.repo, created.id)).members.sort()).toEqual([alice.uid, bob.uid].sort());
  });

  it('refuses a create with no user or an empty name at once', async () => {
    const alice = await newUser();
    expect(() => alice.repo.createGauge({ name: ' ', repeatDays: 1, curve: 'linear' })).toThrow(DataError);
    await alice.repo.signOut();
    expect(() => alice.repo.createLabel('Home')).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
  });

  it('gives an empty list to another user', async () => {
    const alice = await newUser();
    await saved(alice.repo.createGauge({ name: 'Mine', repeatDays: 1, curve: 'linear' }));
    const bob = await newUser();
    expect(await waitFor(gaugesOf(bob.repo), () => true)).toEqual([]);
  });

  it('keeps both executions when two clients mark done at once', async () => {
    const { alice, bob, gaugeId } = await sharedGauge();
    // Both clients hold a copy of the gauge before they write.
    await Promise.all([gaugeAs(alice.repo, gaugeId), gaugeAs(bob.repo, gaugeId)]);
    await Promise.all([alice.repo.markDone(gaugeId, 1000), bob.repo.markDone(gaugeId, 2000)]);
    const g = await waitFor(gaugesOf(alice.repo), (gs) => byId(gaugeId)(gs)?.executions.length === 2);
    expect(byId(gaugeId)(g)!.executions).toEqual(
      expect.arrayContaining([
        { at: 1000, by: alice.uid },
        { at: 2000, by: bob.uid },
      ]),
    );
  });

  it('edits and removes one execution', async () => {
    const alice = await newUser();
    const id = await saved(alice.repo.createGauge({ name: 'Bins', repeatDays: 7, curve: 'linear' }));
    await alice.repo.markDone(id, 1000);
    await alice.repo.markDone(id, 2000);
    await alice.repo.editExecution(id, { at: 1000, by: alice.uid }, 1500);
    // The local cache shows a transaction only after the server confirms it.
    let g = byId(id)(
      await waitFor(gaugesOf(alice.repo), (gs) => byId(id)(gs)?.executions[0]?.at === 1500),
    )!;
    expect(g.executions).toEqual([
      { at: 1500, by: alice.uid },
      { at: 2000, by: alice.uid },
    ]);
    await alice.repo.removeExecution(id, { at: 2000, by: alice.uid });
    g = byId(id)(await waitFor(gaugesOf(alice.repo), (gs) => byId(id)(gs)?.executions.length === 1))!;
    expect(g.executions).toEqual([{ at: 1500, by: alice.uid }]);
    await expect(alice.repo.editExecution(id, { at: 9, by: alice.uid }, 10)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      alice.repo.editExecution(id, { at: 1500, by: alice.uid }, Date.now() + 60_000),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('archives, unarchives, updates, mutes, and deletes a gauge', async () => {
    const alice = await newUser();
    const id = await saved(alice.repo.createGauge({ name: 'Car', repeatDays: 90, curve: 'ease' }));
    await alice.repo.archiveGauge(id);
    expect((await gaugeAs(alice.repo, id)).archivedAt).toEqual(expect.any(Number));
    await alice.repo.unarchiveGauge(id);
    await alice.repo.updateGauge(id, { name: 'Car service', repeatDays: 180 });
    await alice.repo.setMuted(id, true);
    const g = await gaugeAs(alice.repo, id);
    expect(g).toMatchObject({ archivedAt: null, name: 'Car service', repeatDays: 180, mutedBy: [alice.uid] });
    await alice.repo.deleteGauge(id);
    expect(await waitFor(gaugesOf(alice.repo), (gs) => gs.length === 0)).toEqual([]);
  });

  describe('pause', () => {
    const DAY = 86400000;

    /** Alice and bob share a gauge that alice did 10 days ago. Each has their own clock. */
    async function sharedGauge() {
      const clock = { alice: Date.now(), bob: Date.now() };
      const alice = await newUser(() => clock.alice);
      const bob = await newUser(() => clock.bob);
      const labelId = await saved(alice.repo.createLabel('Garden'));
      const id = await saved(
        alice.repo.createGauge({
          name: 'Fertilize',
          repeatDays: 30,
          curve: 'linear',
          labelIds: [labelId],
          doneAt: Date.now() - 10 * DAY,
        }),
      );
      await bob.repo.joinByInvite(await alice.repo.createInvite(labelId));
      await gaugeAs(bob.repo, id);
      return { alice, bob, clock, id };
    }

    it('pauses a shared gauge, and the other member sees it live and resumes it', async () => {
      const { alice, bob, clock, id } = await sharedGauge();
      const live = waitFor(gaugesOf(bob.repo), (gs) => isPaused(byId(id)(gs) ?? makeGaugeStub()));
      clock.alice = Date.now() - 4 * DAY;
      await alice.repo.pauseGauge(id);
      const [seen] = (await live).filter((g) => g.id === id);
      expect(seen.pausedAt).toBe(clock.alice);
      // The frozen level: 6 days of 36 (30 days x 1.2) are gone.
      expect(gaugeLevel(seen, Date.now() + 100 * DAY)).toBeCloseTo(100 - (100 * 6) / 36, 3);

      // A second pause does nothing: the start stays.
      clock.alice = Date.now();
      await alice.repo.pauseGauge(id);
      const again = await waitFor(gaugesOf(alice.repo), (gs) => byId(id)(gs)?.pausedAt != null);
      expect(byId(id)(again)?.pausedAt).toBe(seen.pausedAt);

      clock.bob = Date.now();
      await bob.repo.resumeGauge(id);
      const resumed = await waitFor(gaugesOf(alice.repo), (gs) => byId(id)(gs)?.pausedAt == null);
      const g = byId(id)(resumed)!;
      expect(isPaused(g)).toBe(false);
      expect(g.pausedMs).toBe(clock.bob - (seen.pausedAt as number));
      expect(gaugeLevel(g, clock.bob)).toBeCloseTo(100 - (100 * 6) / 36, 3);
      // A resume of an active gauge does nothing.
      await alice.repo.resumeGauge(id);
      const still = await waitFor(gaugesOf(alice.repo), (gs) => byId(id)(gs)?.pausedMs !== undefined);
      expect(byId(id)(still)?.pausedMs).toBe(g.pausedMs);
    });

    it('counts the paused time one time when two members resume at once', async () => {
      const { alice, bob, clock, id } = await sharedGauge();
      const start = Date.now() - 5 * DAY;
      clock.alice = start;
      await alice.repo.pauseGauge(id);
      await waitFor(gaugesOf(bob.repo), (gs) => byId(id)(gs)?.pausedAt === start);
      const end = Date.now();
      clock.alice = end;
      clock.bob = end + 1000;
      await Promise.all([alice.repo.resumeGauge(id), bob.repo.resumeGauge(id)]);
      const g = byId(id)(await waitFor(gaugesOf(alice.repo), (gs) => byId(id)(gs)?.pausedMs !== undefined))!;
      expect(g.pausedAt ?? null).toBeNull();
      // One of the two resumes wrote. The other one read it and wrote nothing.
      expect([end - start, end + 1000 - start]).toContain(g.pausedMs);
    });

    it('ends the pause when a member marks the gauge done, as an earlier app version does', async () => {
      const { alice, bob, clock, id } = await sharedGauge();
      clock.alice = Date.now() - 2 * DAY;
      await alice.repo.pauseGauge(id);
      clock.alice = Date.now() - DAY;
      await alice.repo.resumeGauge(id);
      clock.alice = Date.now() - DAY / 2;
      await alice.repo.pauseGauge(id);
      // markDone writes only the execution, the same write as an app that does not know the pause.
      const doneAt = Date.now();
      await bob.repo.markDone(id, doneAt);
      const g = byId(id)(
        await waitFor(gaugesOf(alice.repo), (gs) => byId(id)(gs)?.executions.length === 2),
      )!;
      expect(g.pausedAt).toBeDefined();
      expect(g.pausedMs).toBeGreaterThan(0);
      expect(isPaused(g)).toBe(false);
      // The gauge empties from the new execution. The old paused time does not count.
      expect(gaugeLevel(g, doneAt + 3.6 * DAY)).toBeCloseTo(90, 3);
    });

    it('refuses a pause by a user who is not a member', async () => {
      const { id } = await sharedGauge();
      const stranger = await newUser();
      await expect(stranger.repo.pauseGauge(id)).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  it('surfaces a write error to the caller', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const id = await saved(alice.repo.createGauge({ name: 'Private', repeatDays: 1, curve: 'linear' }));
    await expect(bob.repo.markDone(id)).rejects.toBeInstanceOf(DataError);
    await expect(bob.repo.markDone(id)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(alice.repo.updateGauge(id, { repeatDays: 0 })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('adds a label, then a second user joins by invite and sees the gauges', async () => {
    const alice = await newUser();
    const g1 = await saved(alice.repo.createGauge({ name: 'Dishes', repeatDays: 1, curve: 'linear' }));
    const labelId = await saved(alice.repo.createLabel('Home'));
    await alice.repo.addLabelToGauge(g1, labelId);
    expect((await gaugeAs(alice.repo, g1)).labelIds).toEqual([labelId]);

    const invite = await alice.repo.createInvite(labelId);
    expect(invite.url).toBe(`${WEBSITE_URL}/invite?label=${labelId}&code=${invite.code}`);

    const bob = await newUser();
    const result = await bob.repo.joinByInvite(invite);
    expect(result).toEqual({ labelId, joinedGaugeIds: [g1], skippedGaugeIds: [] });
    const g = await gaugeAs(bob.repo, g1);
    expect(g.members.sort()).toEqual([alice.uid, bob.uid].sort());
    const labels = await waitFor(labelsOf(bob.repo), (ls: Label[]) => ls.length === 1);
    expect(labels[0]).toMatchObject({ id: labelId, name: 'Home', gaugeIds: [g1] });

    // A gauge that gets the label later has both members at once.
    const g2 = await saved(alice.repo.createGauge({
      name: 'Laundry',
      repeatDays: 4,
      curve: 'linear',
      labelIds: [labelId],
    }));
    expect((await gaugeAs(bob.repo, g2)).labelIds).toEqual([labelId]);

    // Removing the label removes bob again.
    await alice.repo.removeLabelFromGauge(g2, labelId);
    await waitFor(gaugesOf(bob.repo), (gs) => !gs.some((x) => x.id === g2));
  });

  it('sets the level mode of a shared label, and the other member sees it', async () => {
    const alice = await newUser();
    const labelId = await saved(alice.repo.createLabel('Home', '🏠'));
    const invite = await alice.repo.createInvite(labelId);
    const bob = await newUser();
    await bob.repo.joinByInvite(invite);
    const before = await waitFor(labelsOf(bob.repo), (ls: Label[]) => ls.length === 1);
    expect(before[0]).not.toHaveProperty('aggregate');

    await alice.repo.setLabelAggregate(labelId, 'worst');
    await waitFor(labelsOf(bob.repo), (ls: Label[]) => ls[0]?.aggregate === 'worst');
    // Any member can change it, and the other writes keep it.
    await bob.repo.setLabelAggregate(labelId, 'median');
    await bob.repo.renameLabel(labelId, 'Our home');
    const after = await waitFor(labelsOf(alice.repo), (ls: Label[]) => ls[0]?.name === 'Our home');
    expect(after[0]).toMatchObject({ aggregate: 'median', emoji: '🏠' });

    await expect(alice.repo.setLabelAggregate(labelId, 'best' as never)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    const stranger = await newUser();
    await expect(stranger.repo.setLabelAggregate(labelId, 'average')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses a wrong code, a revoked code, and an expired time', async () => {
    const alice = await newUser();
    const labelId = await saved(alice.repo.createLabel('Home'));
    const bob = await newUser();
    await expect(
      bob.repo.joinByInvite({ labelId, code: 'x'.repeat(43) }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(bob.repo.joinByInvite({ labelId, code: 'short' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    const invite = await alice.repo.createInvite(labelId, { expiresAt: Date.now() + 60000 });
    await alice.repo.revokeInvite(labelId, invite.code);
    await expect(bob.repo.joinByInvite(invite)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      alice.repo.createInvite(labelId, { expiresAt: Date.now() - 1 }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('lets a member leave a label and its gauges', async () => {
    const { alice, bob, gaugeId, labelId } = await sharedGauge();
    await gaugeAs(bob.repo, gaugeId);
    await bob.repo.leaveLabel(labelId);
    await waitFor(gaugesOf(bob.repo), (gs) => gs.length === 0);
    await waitFor(labelsOf(bob.repo), (ls) => ls.length === 0);
    const g = await gaugeAs(alice.repo, gaugeId);
    expect(g.members).toEqual([alice.uid]);
    // The last member deletes the label when they leave.
    await alice.repo.leaveLabel(labelId);
    await waitFor(labelsOf(alice.repo), (ls) => ls.length === 0);
    expect((await gaugeAs(alice.repo, gaugeId)).labelIds).toEqual([]);
  });

  it('repairs a membership that another member removed by mistake', async () => {
    const { alice, bob, gaugeId } = await sharedGauge();
    // Bob has a second label on the gauge that alice cannot read.
    const bobLabel = await saved(bob.repo.createLabel('Bob only'));
    await bob.repo.addLabelToGauge(gaugeId, bobLabel);
    const aliceLabel = (await gaugeAs(alice.repo, gaugeId)).labelIds.find((id) => id !== bobLabel)!;
    await alice.repo.removeLabelFromGauge(gaugeId, aliceLabel);
    await waitFor(gaugesOf(bob.repo), (gs) => gs.length === 0);
    const results = await bob.repo.repairMemberships();
    expect(results).toEqual([{ labelId: bobLabel, joinedGaugeIds: [gaugeId], skippedGaugeIds: [] }]);
    await gaugeAs(bob.repo, gaugeId);
  });

  it('sets a name and gets profiles by ID', async () => {
    const alice = await newUser();
    const bob = await newUser();
    await alice.repo.setMyName('  Alice ');
    const profiles = await bob.repo.getProfiles([alice.uid, bob.uid, alice.uid]);
    expect(profiles).toEqual([{ id: alice.uid, name: 'Alice' }]);
    await expect(alice.repo.setMyName(' ')).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('follows the auth state in the live lists', async () => {
    const alice = await newUser();
    await saved(alice.repo.createGauge({ name: 'Mine', repeatDays: 1, curve: 'linear' }));
    await waitFor(gaugesOf(alice.repo), (gs) => gs.length === 1);
    const seen: number[] = [];
    const stop = alice.repo.subscribeMyGauges((gs) => seen.push(gs.length));
    await waitFor(gaugesOf(alice.repo), (gs) => gs.length === 1);
    await alice.repo.signOut();
    await new Promise((r) => setTimeout(r, 200));
    stop();
    expect(seen[seen.length - 1]).toBe(0);
    expect(alice.repo.currentUser()).toBeNull();
  });
});

/** Alice owns a gauge with her label. Bob joined the label by invite. */
async function sharedGauge() {
  const alice = await newUser();
  const gaugeId = await saved(alice.repo.createGauge({ name: 'Shared', repeatDays: 2, curve: 'linear' }));
  const labelId = await saved(alice.repo.createLabel('Flat'));
  await alice.repo.addLabelToGauge(gaugeId, labelId);
  const invite = await alice.repo.createInvite(labelId);
  const bob = await newUser();
  await bob.repo.joinByInvite(invite);
  return { alice, bob, gaugeId, labelId };
}

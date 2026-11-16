import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AppState } from 'react-native';

import { getRepository } from '@/data';
import type { UserId } from '@/domain';

import { useSession } from './SessionProvider';

/** The time between two loads of the names while the app is open. */
const NAMES_REFRESH_MS = 5 * 60 * 1000;

/** A name, `null` for a user with no name, or `undefined` while the app loads it. */
export type ProfileName = string | null | undefined;

interface ProfilesValue {
  names: ReadonlyMap<UserId, string | null>;
  /** Loads the names that are not in the cache. `force` loads them again. */
  load: (ids: readonly UserId[], options?: { force?: boolean }) => void;
  /** Saves the name of the current user and puts it in the cache. */
  saveMyName: (name: string) => Promise<void>;
}

const ProfilesContext = createContext<ProfilesValue>({
  names: new Map(),
  load: () => {},
  saveMyName: async () => {},
});

/**
 * Keeps the names of the users that the app shows on avatars. A name loads
 * one time, and again when the app comes back to the front, so that a new
 * name of another member shows without a restart. Other members see the
 * name of the current user, so the screens ask for it before a share or a
 * join.
 */
export function ProfilesProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const uid = user?.uid ?? null;
  // The cache belongs to one user. A cache of another user counts as empty.
  const [cache, setCache] = useState<{ uid: string | null; names: ReadonlyMap<UserId, string | null> }>({
    uid,
    names: new Map(),
  });
  const names = useMemo(() => (cache.uid === uid ? cache.names : new Map<UserId, string | null>()), [cache, uid]);
  const loading = useRef(new Set<UserId>());

  const load = useCallback(
    (ids: readonly UserId[], options: { force?: boolean } = {}) => {
      const wanted = [...new Set(ids)].filter(
        (id) => id && !loading.current.has(id) && (options.force || !names.has(id)),
      );
      if (wanted.length === 0) return;
      wanted.forEach((id) => loading.current.add(id));
      getRepository()
        .getProfiles(wanted)
        .then((profiles) => {
          setCache((previous) => {
            const next = new Map(previous.uid === uid ? previous.names : []);
            for (const id of wanted) next.set(id, null);
            for (const profile of profiles) next.set(profile.id, profile.name.trim() || null);
            return { uid, names: next };
          });
        })
        .catch(() => {
          // Offline: the avatars show the icon for no name. A later call tries again.
        })
        .finally(() => wanted.forEach((id) => loading.current.delete(id)));
    },
    [names, uid],
  );

  const saveMyName = useCallback(
    async (name: string) => {
      if (!uid) return;
      await getRepository().setMyName(name);
      setCache((previous) => ({
        uid,
        names: new Map(previous.uid === uid ? previous.names : []).set(uid, name.trim()),
      }));
    },
    [uid],
  );

  // Another member can change their name. The app loads the names again when
  // it comes back to the front, and every few minutes while it is open.
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const next = () => setRefresh((n) => n + 1);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') next();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') next();
    }, NAMES_REFRESH_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);
  const known = useRef(names);
  useEffect(() => {
    known.current = names;
  }, [names]);
  useEffect(() => {
    if (refresh > 0) load([...known.current.keys()], { force: true });
    // Only a new tick loads again. A change of `load` alone does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const value = useMemo(() => ({ names, load, saveMyName }), [names, load, saveMyName]);
  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

/** Gives the names of the users in `ids`, and loads the missing ones. */
export function useProfileNames(ids: readonly UserId[]): ReadonlyMap<UserId, string | null> {
  const { names, load } = useContext(ProfilesContext);
  const key = [...ids].sort().join(',');
  useEffect(() => {
    if (key) load(key.split(','));
  }, [key, load]);
  return names;
}

/** Gives the name of the current user: a name, `null` for none, or `undefined` while it loads. */
export function useMyName(): { name: ProfileName; save: (name: string) => Promise<void> } {
  const { user } = useSession();
  const { names, load, saveMyName } = useContext(ProfilesContext);
  const uid = user?.uid;
  useEffect(() => {
    if (uid) load([uid]);
  }, [uid, load]);
  return { name: uid ? names.get(uid) : undefined, save: saveMyName };
}

/** Loads the names again, for example when the share sheet opens. */
export function useReloadProfiles(): (ids: readonly UserId[]) => void {
  const { load } = useContext(ProfilesContext);
  return useCallback((ids) => load(ids, { force: true }), [load]);
}

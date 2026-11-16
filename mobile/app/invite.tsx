import { useLocalSearchParams } from 'expo-router';

import { JoinScreen } from '@/screens';

/**
 * Opens for `https://<website>/invite?label=...&code=...`, for
 * `gauges://invite?...`, and from Settings. On the website, a visitor with no
 * login sees the login first. The address keeps the query, so the join
 * continues after the login.
 */
export default function InviteRoute() {
  const { label, code } = useLocalSearchParams<{ label?: string; code?: string }>();
  return <JoinScreen labelId={label} code={code} />;
}

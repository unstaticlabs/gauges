import type { UserId } from '@/domain';
import { AvatarStack } from '@/ui/components';

import { useAvatarPeople } from './useAvatarPeople';

export interface MemberAvatarsProps {
  /** The members in the order to show: the last person who did the chore first. */
  ids: readonly UserId[];
  size?: number;
  ringColor?: string;
  testID?: string;
}

/** The avatar stack of a shared gauge or label, with the names from the profiles. */
export function MemberAvatars({ ids, size, ringColor, testID }: MemberAvatarsProps) {
  const { people, label } = useAvatarPeople(ids);
  return <AvatarStack people={people} accessibilityLabel={label} size={size} ringColor={ringColor} testID={testID} />;
}

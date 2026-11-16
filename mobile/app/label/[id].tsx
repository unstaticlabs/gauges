import { useLocalSearchParams } from 'expo-router';

import { LabelScreen } from '@/screens';

export default function LabelRoute() {
  const { id, joined } = useLocalSearchParams<{ id: string; joined?: string }>();
  return <LabelScreen id={id} justJoined={joined === '1'} />;
}

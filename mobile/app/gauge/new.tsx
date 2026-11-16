import { useLocalSearchParams } from 'expo-router';

import { NewGaugeScreen } from '@/screens';

export default function NewGaugeRoute() {
  const { label, name } = useLocalSearchParams<{ label?: string; name?: string }>();
  return <NewGaugeScreen labelId={label} name={name} />;
}

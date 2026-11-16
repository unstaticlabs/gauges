import { useLocalSearchParams } from 'expo-router';

import { EditGaugeScreen } from '@/screens';

export default function EditGaugeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditGaugeScreen id={id} />;
}

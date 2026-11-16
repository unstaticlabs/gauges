// This folder holds routes only. Put other code in src/.
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { AppGate } from '@/screens';
import {
  DataProvider,
  HomeViewProvider,
  NowProvider,
  ProfilesProvider,
  RemindersProvider,
  SessionProvider,
  ToastProvider,
} from '@/state';
import { fonts, useTheme } from '@/ui/theme';

// A deep link (for example an invite) opens on top of the home screen, so
// that the back button leads home.
export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const theme = useTheme();
  const { colors } = theme;
  // The app waits for the font of the old app. If a file fails, it uses the system font.
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <NowProvider>
          <SessionProvider>
            <DataProvider>
              <RemindersProvider>
                <ProfilesProvider>
                  <HomeViewProvider>
                    <ToastProvider>
                      <AppGate>
                        <Stack
                          screenOptions={{
                            contentStyle: { backgroundColor: colors.background },
                            headerStyle: { backgroundColor: colors.background },
                            headerTintColor: colors.accent,
                            headerTitleStyle: { color: colors.text, fontFamily: fonts.semibold },
                            headerShadowVisible: false,
                            headerBackButtonDisplayMode: 'minimal',
                          }}
                        >
                          <Stack.Screen name="index" options={{ headerShown: false, title: t.home.title }} />
                          <Stack.Screen name="gauge/new" options={{ title: t.gauge.newTitle, presentation: 'modal' }} />
                          <Stack.Screen name="gauge/[id]" options={{ title: t.gauge.editTitle }} />
                          <Stack.Screen name="settings" options={{ title: t.settings.title }} />
                          <Stack.Screen name="label/[id]" options={{ title: '' }} />
                          <Stack.Screen name="unlabeled" options={{ title: t.labels.noLabel }} />
                          <Stack.Screen name="invite" options={{ title: t.join.title }} />
                        </Stack>
                      </AppGate>
                    </ToastProvider>
                  </HomeViewProvider>
                </ProfilesProvider>
              </RemindersProvider>
            </DataProvider>
          </SessionProvider>
        </NowProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../lib/AppContext';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '600' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="wordbook/[id]/index"
            options={{ title: '单词本' }}
          />
          <Stack.Screen
            name="wordbook/[id]/study"
            options={{ title: '背诵', headerBackTitle: '返回' }}
          />
          <Stack.Screen
            name="wordbook/[id]/quiz"
            options={{ title: '拼写测验', headerBackTitle: '返回' }}
          />
          <Stack.Screen
            name="wordbook/[id]/import"
            options={{ title: '批量导入', headerBackTitle: '返回' }}
          />
        </Stack>
        <StatusBar style="dark" />
      </AppProvider>
    </SafeAreaProvider>
  );
}

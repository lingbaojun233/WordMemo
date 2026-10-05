import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, ColorValue, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../lib/AppContext';
import { colors } from '../lib/theme';

function BackButton({ tintColor }: { tintColor?: ColorValue }) {
  const color = tintColor ?? colors.text;
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      }}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}
    >
      <Ionicons name="chevron-back" size={22} color={color} />
      <Text style={{ fontSize: 16, color }}>返回</Text>
    </Pressable>
  );
}

function RootNavigator() {
  const { isLoggedIn, authReady } = useApp();

  // 会话加载完成前显示启动页，避免登录态闪烁
  if (!authReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          // 统一的自定义返回按钮，保证所有进入的页面都能返回
          headerLeft: ({ tintColor }) => <BackButton tintColor={tintColor} />,
        }}
      >
        {/* 已登录：主界面 */}
        <Stack.Protected guard={isLoggedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="builtin" options={{ title: '内置词库' }} />
          <Stack.Screen name="words" options={{ title: '全部单词' }} />
          <Stack.Screen name="settings" options={{ title: '学习设置' }} />
          <Stack.Screen name="level-test" options={{ title: '词汇水平测验' }} />
          <Stack.Screen name="wordbook/[id]/index" options={{ title: '单词本' }} />
          <Stack.Screen name="wordbook/[id]/reading" options={{ title: 'AI 短文阅读' }} />
          <Stack.Screen name="wordbook/[id]/study" options={{ title: '背诵' }} />
          <Stack.Screen name="wordbook/[id]/import" options={{ title: '批量导入' }} />
        </Stack.Protected>

        {/* 未登录：登录/注册 */}
        <Stack.Protected guard={!isLoggedIn}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen
            name="register"
            options={{
              title: '注册',
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: '#fff',
              headerShadowVisible: false,
            }}
          />
        </Stack.Protected>
      </Stack>
      <StatusBar style={isLoggedIn ? 'dark' : 'light'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}

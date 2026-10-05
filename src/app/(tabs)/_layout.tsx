import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import { colors } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.card,
        },
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '单词本',
          headerRight: () => (
            <Link href="/words" asChild>
              <Pressable hitSlop={8} style={{ marginRight: 16 }}>
                <Ionicons name="albums-outline" size={22} color={colors.primary} />
              </Pressable>
            </Link>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: '统计',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

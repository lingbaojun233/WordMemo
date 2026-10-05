import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { colors, radius, spacing } from '../../lib/theme';
import { formatDate } from '../../lib/utils';
import { Button } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export default function ProfileScreen() {
  const { currentUser, wordbooks, logout } = useApp();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const totalWords = wordbooks.reduce((s, b) => s + b.words.length, 0);

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    setLoggingOut(true);
    await logout();
    // logout 后由 Stack.Protected 自动回到登录页
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(currentUser?.username ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.username}>{currentUser?.username}</Text>
        <Text style={styles.since}>
          {currentUser ? `注册于 ${formatDate(currentUser.createdAt)}` : ''}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{wordbooks.length}</Text>
          <Text style={styles.statLabel}>单词本</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalWords}</Text>
          <Text style={styles.statLabel}>总单词</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.infoText}>
          每个账号的背诵进度相互独立，并保存在本设备本地文件中，无需联网。
        </Text>
      </View>

      <View style={styles.menuCard}>
        <MenuRow
          icon="settings-outline"
          label="学习设置"
          desc="AI Key、每日篇数/词数、词汇水平"
          onPress={() => router.push('/settings')}
        />
        <View style={styles.menuDivider} />
        <MenuRow
          icon="clipboard-outline"
          label="词汇水平测验"
          desc="检测你的词汇量，用于生成可读的短文"
          onPress={() => router.push('/level-test')}
        />
      </View>

      <Button
        label="退出登录"
        variant="outline"
        icon="log-out-outline"
        loading={loggingOut}
        onPress={() => setShowLogoutConfirm(true)}
        style={{ borderColor: colors.danger, marginTop: spacing.md }}
        textStyle={{ color: colors.danger }}
      />

      <ConfirmDialog
        visible={showLogoutConfirm}
        title="退出登录"
        message="确定要退出当前账号吗？进度仍会保留在本地，下次登录可继续。"
        confirmLabel="退出"
        danger
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </ScrollView>
  );
}

function MenuRow({
  icon,
  label,
  desc,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <View style={styles.menuBody}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  header: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: 36, fontWeight: '800', color: '#fff' },
  username: { fontSize: 22, fontWeight: '700', color: colors.text },
  since: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  infoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.primaryDark, lineHeight: 19 },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  menuBody: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  menuDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  menuDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
});

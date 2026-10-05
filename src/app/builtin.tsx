import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../lib/AppContext';
import { BUILTIN_BOOKS, BuiltinBookKey } from '../data/builtinBooks';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from '../components/ui';

export default function BuiltinScreen() {
  const { wordbooks, addBuiltinBook } = useApp();
  const [loadingKey, setLoadingKey] = useState<BuiltinBookKey | null>(null);

  const handleAdd = (key: BuiltinBookKey) => {
    if (loadingKey) return;
    setLoadingKey(key);
    // 先让加载态渲染出来，再执行较重的词库构建
    setTimeout(() => {
      const id = addBuiltinBook(key);
      if (id) {
        router.replace(`/wordbook/${id}`);
      } else {
        setLoadingKey(null);
      }
    }, 60);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '内置词库', headerBackTitle: '返回' }} />

      <Text style={styles.hint}>一键添加官方词库，添加后即可开始背诵</Text>

      {BUILTIN_BOOKS.map((b) => {
        const added = wordbooks.some((wb) => wb.builtinKey === b.key);
        const loading = loadingKey === b.key;
        return (
          <View key={b.key} style={styles.card}>
            <View style={styles.icon}>
              <Text style={styles.iconText}>{b.key === 'cet4' ? '4' : '6'}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{b.name}</Text>
              <Text style={styles.desc} numberOfLines={1}>
                {b.description}
              </Text>
              <Text style={styles.count}>{b.words.length} 词</Text>
            </View>
            <Button
              label={added ? '已添加' : '添加'}
              variant={added ? 'ghost' : 'primary'}
              icon={added ? 'checkmark' : 'add'}
              disabled={added || loading}
              loading={loading}
              onPress={() => handleAdd(b.key)}
              style={{ paddingVertical: 8 }}
              textStyle={{ fontSize: 14 }}
            />
          </View>
        );
      })}

      <View style={styles.noteCard}>
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.noteText}>
          词库数据来自开源四六级大纲词汇，仅保存在本地。添加后可在首页的单词本中查看。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md, paddingHorizontal: spacing.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 22, fontWeight: '800', color: colors.primary },
  info: { flex: 1 },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  desc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  count: { fontSize: 12, color: colors.textLight, marginTop: 2 },
  noteCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  noteText: { flex: 1, fontSize: 13, color: colors.primaryDark, lineHeight: 19 },
});

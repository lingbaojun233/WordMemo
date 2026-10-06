import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../lib/AppContext';
import { BUILTIN_BOOKS, BuiltinBookDef } from '../data/builtinBooks';
import { LEVEL_ORDER, LEVEL_SAMPLES } from '../data/levelTestWords';
import { loadStudySettings, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from '../components/ui';

export default function OnboardingRecommendScreen() {
  const { wordbooks, addBuiltinBook, completeOnboarding } = useApp();
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const level = settings?.level;
  const levelLabel = level
    ? LEVEL_SAMPLES.find((s) => s.level === level)?.label ?? ''
    : '';

  // 根据水平推荐下一级与下下一级的词库
  const recommended: BuiltinBookDef[] = level
    ? LEVEL_ORDER.slice(
        LEVEL_ORDER.indexOf(level) + 1,
        LEVEL_ORDER.indexOf(level) + 3
      )
        .map((key) => BUILTIN_BOOKS.find((b) => b.key === key))
        .filter((b): b is BuiltinBookDef => !!b)
    : [];

  const handleAdd = (key: string) => {
    setAdding(key);
    setTimeout(() => {
      addBuiltinBook(key as BuiltinBookDef['key']);
      setAdding(null);
    }, 60);
  };

  const finish = async () => {
    // 完成引导后，onboardingDone 变为 true，守卫会自动重定向到首页
    await completeOnboarding();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="library" size={36} color={colors.primary} />
        </View>
        <Text style={styles.title}>为你推荐单词本</Text>
        <Text style={styles.subtitle}>
          {level
            ? `你的词汇水平约 ${levelLabel}，推荐学习以下词库（可跳过）`
            : '根据你的水平，推荐以下词库（可跳过）'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {recommended.map((b) => {
          const added = wordbooks.some((wb) => wb.builtinKey === b.key);
          return (
            <View key={b.key} style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{b.name}</Text>
                <Text style={styles.cardDesc} numberOfLines={1}>
                  {b.description}
                </Text>
                <Text style={styles.cardCount}>
                  {b.words.length} 词族 · 共{' '}
                  {b.words.reduce((s, w) => s + 1 + (w.d?.length ?? 0), 0)} 词
                </Text>
              </View>
              <Button
                label={added ? '已添加' : '添加'}
                variant={added ? 'ghost' : 'primary'}
                icon={added ? 'checkmark' : 'add'}
                disabled={added || adding === b.key}
                loading={adding === b.key}
                onPress={() => handleAdd(b.key)}
                style={{ paddingVertical: 8 }}
                textStyle={{ fontSize: 14 }}
              />
            </View>
          );
        })}
        {recommended.length === 0 ? (
          <Text style={styles.empty}>你已掌握所有级别的词汇 🎉</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="完成，进入首页" icon="checkmark" onPress={finish} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  list: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardDesc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cardCount: { fontSize: 12, color: colors.textLight, marginTop: 2 },
  empty: { textAlign: 'center', fontSize: 14, color: colors.textMuted, marginTop: spacing.xl },
  footer: { padding: spacing.lg },
});

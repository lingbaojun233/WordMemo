import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { loadStudySettings, saveStudySettings, StudySettings } from '../../lib/studySettings';
import { colors, radius, spacing } from '../../lib/theme';
import { isDue, isGraduated, isNew } from '../../lib/srs';
import { startOfToday } from '../../lib/utils';
import { Button } from '../../components/ui';
import { StudyStartModal } from '../../components/StudyStartModal';

export default function StudyTab() {
  const { wordbooks } = useApp();
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<StudySettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveStudySettings(next);
  };

  // 当前学习的单词本（持久化；无匹配则回退到第一个词本）
  const currentBook = settings
    ? (wordbooks.find((b) => b.id === settings.currentBookId) ?? wordbooks[0] ?? null)
    : null;

  // 当前词本统计
  const stats = useMemo(() => {
    if (!currentBook) return { totalToLearn: 0, learnedToday: 0, dueCount: 0 };
    const start = startOfToday();
    let total = 0;
    let learned = 0;
    let due = 0;
    for (const w of currentBook.words) {
      if (!isGraduated(w)) total++;
      if (w.lastReviewedAt && w.lastReviewedAt >= start) learned++;
      if (!isNew(w) && isDue(w)) due++;
    }
    return { totalToLearn: total, learnedToday: learned, dueCount: due };
  }, [currentBook]);

  // 目标进度
  const goal = useMemo(() => {
    if (!settings) return null;
    if (settings.goalType === 'daily') {
      const target = settings.dailyGoal;
      const done = stats.learnedToday;
      return { kind: 'daily' as const, target, done, remaining: Math.max(0, target - done) };
    }
    const days = Math.max(1, settings.deadlineDays);
    const perDay = Math.ceil(stats.totalToLearn / days);
    return {
      kind: 'deadline' as const,
      days,
      remaining: stats.totalToLearn,
      perDay,
      todayRemaining: Math.max(0, perDay - stats.learnedToday),
    };
  }, [settings, stats]);

  if (!settings) return <View style={styles.container} />;

  const mode = settings.studyMode ?? 'memorize_quiz';

  const handleStart = () => {
    setShowStartModal(false);
    if (!currentBook) return;
    if (mode === 'memorize_quiz') {
      router.push(`/wordbook/${currentBook.id}/study`);
    } else if (mode === 'ai_reading') {
      router.push(`/wordbook/${currentBook.id}/reading`);
    }
  };

  const startReview = () => {
    if (!currentBook) return;
    router.push(`/wordbook/${currentBook.id}/review`);
  };

  const openProgress = () => {
    if (!currentBook) return;
    router.push(`/wordbook/${currentBook.id}/progress`);
  };

  const needRemind = goal
    ? goal.kind === 'daily'
      ? goal.remaining > 0
      : goal.todayRemaining > 0
    : false;
  const reminderText = goal
    ? goal.kind === 'daily'
      ? `今天还差 ${goal.remaining} 个新词未完成，继续加油！`
      : `今天还需学习约 ${goal.todayRemaining} 词，才能按期学完`
    : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 切换单词本 */}
      <Text style={styles.sectionTitle}>当前单词本</Text>
      {wordbooks.length === 0 ? (
        <Pressable style={styles.emptyBook} onPress={() => router.push('/builtin')}>
          <Ionicons name="library-outline" size={20} color={colors.primary} />
          <Text style={styles.emptyBookText}>还没有单词本，去内置词库添加</Text>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bookSwitch}
        >
          {wordbooks.map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              active={b.id === currentBook?.id}
              onPress={() => update({ currentBookId: b.id })}
            />
          ))}
        </ScrollView>
      )}

      {/* 当前词本统计 */}
      {currentBook ? (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalToLearn}</Text>
            <Text style={styles.statLabel}>总共需学习</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.learnedToday}</Text>
            <Text style={styles.statLabel}>今日已学习</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.dueCount}</Text>
            <Text style={styles.statLabel}>需要复习</Text>
          </View>
        </View>
      ) : null}

      {/* 目标进度 */}
      {goal && currentBook ? (
        <View style={styles.goalCard}>
          <Text style={styles.goalTitle}>
            {goal.kind === 'daily'
              ? `今日目标 ${goal.done}/${goal.target} 词`
              : `截止目标：${goal.days} 天内学完`}
          </Text>
          {goal.kind === 'daily' ? (
            <>
              <View style={styles.goalTrack}>
                <View
                  style={[
                    styles.goalFill,
                    { width: `${goal.target > 0 ? Math.min(100, (goal.done / goal.target) * 100) : 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.goalDesc}>
                {goal.remaining > 0 ? `还差 ${goal.remaining} 词` : '今日目标已达成 🎉'}
              </Text>
            </>
          ) : (
            <Text style={styles.goalDesc}>
              还需 {goal.remaining} 词，每天约 {goal.perDay} 词
            </Text>
          )}
        </View>
      ) : null}

      {/* 提醒横幅 */}
      {needRemind && currentBook ? (
        <View style={styles.reminder}>
          <Ionicons name="notifications" size={18} color={colors.warning} />
          <Text style={styles.reminderText}>{reminderText}</Text>
        </View>
      ) : null}

      {/* 各阶段学习情况 */}
      {currentBook ? (
        <Pressable style={styles.progressLink} onPress={openProgress}>
          <Ionicons name="stats-chart" size={18} color={colors.primary} />
          <Text style={styles.progressLinkText}>查看各阶段学习情况</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
        </Pressable>
      ) : null}

      {/* 开始学习（弹出设置） */}
      <Button
        label="开始学习"
        icon="play"
        onPress={() => setShowStartModal(true)}
        disabled={!currentBook}
        style={{ marginTop: spacing.lg }}
      />

      {/* 复习到期单词 */}
      <Button
        label={stats.dueCount > 0 ? `复习到期单词（${stats.dueCount} 个）` : '暂无到期单词'}
        icon="refresh"
        variant="outline"
        onPress={startReview}
        disabled={!currentBook || stats.dueCount === 0}
        style={{ marginTop: spacing.md }}
      />

      <StudyStartModal
        visible={showStartModal}
        settings={settings}
        onClose={() => setShowStartModal(false)}
        onChange={update}
        onStart={handleStart}
      />
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  bookSwitch: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  goalCard: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  goalTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  goalTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  goalDesc: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: spacing.md,
  },
  reminderText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 19 },
  progressLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  progressLinkText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.primary },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  emptyBook: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  emptyBookText: { flex: 1, fontSize: 14, color: colors.primaryDark },
});

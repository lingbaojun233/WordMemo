import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { loadStudySettings, saveStudySettings, StudySettings } from '../../lib/studySettings';
import { colors, radius, spacing } from '../../lib/theme';
import { isDue, isNew } from '../../lib/srs';
import { startOfToday } from '../../lib/utils';
import { goalPlan } from '../../lib/goal';
import { Button } from '../../components/ui';
import { BookSelector } from '../../components/BookSelector';
import { GoalCard } from '../../components/GoalCard';
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

  // 当前词本统计（目标：所有新词完成初学，即达到 1-初识）
  const stats = useMemo(() => {
    if (!currentBook) return { totalToLearn: 0, learnedToday: 0, dueCount: 0 };
    const start = startOfToday();
    let total = 0;
    let learned = 0;
    let due = 0;
    for (const w of currentBook.words) {
      if (w.box === 0) total++; // 尚未完成初学的新词
      if (w.lastReviewedAt && w.lastReviewedAt >= start) learned++;
      if (!isNew(w) && isDue(w)) due++;
    }
    return { totalToLearn: total, learnedToday: learned, dueCount: due };
  }, [currentBook]);

  // 学习目标全景：剩余天数 / 今日目标 / 连续学习 / 平均速度与预计完成日期
  const plan = useMemo(() => {
    if (!settings) return null;
    return goalPlan({ book: currentBook, books: wordbooks, settings });
  }, [currentBook, wordbooks, settings]);

  if (!settings) return <View style={styles.container} />;

  const mode = settings.studyMode ?? 'memorize_quiz';

  const handleStart = () => {
    if (!currentBook) return;
    if (mode === 'memorize_quiz') {
      router.push(`/wordbook/${currentBook.id}/study`);
    } else if (mode === 'ai_reading') {
      router.push(`/wordbook/${currentBook.id}/reading`);
    } else if (mode === 'ai_questions') {
      router.push(`/wordbook/${currentBook.id}/questions`);
    }
  };

  const startReview = () => {
    if (!currentBook) return;
    router.push(`/wordbook/${currentBook.id}/review`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 当前单词本（与统计页使用同一选择方式） */}
      <Text style={styles.sectionTitle}>当前单词本</Text>
      <BookSelector
        books={wordbooks}
        value={currentBook}
        onChange={(id) => update({ currentBookId: id })}
        onEmptyPress={() => router.push('/builtin')}
      />

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

      {/* 学习目标：首次「制定」，之后「修改」 */}
      {plan ? (
        <>
          <Text style={styles.sectionTitle}>学习目标</Text>
          <GoalCard plan={plan} settings={settings} onChange={update} disabled={!currentBook} />
        </>
      ) : null}

      {/* 开始学习 */}
      <Button
        label={
          mode === 'ai_reading'
            ? '开始阅读学习'
            : mode === 'ai_questions'
            ? '开始 AI 出题'
            : '开始学习'
        }
        icon="play"
        onPress={handleStart}
        disabled={!currentBook}
        style={{ alignSelf: 'stretch', marginTop: spacing.lg }}
      />

      {/* 复习到期单词（AI 出题模式已自动复习，不单独显示） */}
      {mode !== 'ai_questions' ? (
        <Button
          label={stats.dueCount > 0 ? `复习到期单词（${stats.dueCount} 个）` : '暂无到期单词'}
          icon="refresh"
          variant="outline"
          onPress={startReview}
          disabled={!currentBook || stats.dueCount === 0}
          style={{ alignSelf: 'stretch', marginTop: spacing.md }}
        />
      ) : null}

      {/* AI 训练档案 */}
      <Button
        label="AI 训练档案（错题归因 / 提示词库 / A-B）"
        icon="analytics"
        variant="outline"
        onPress={() => router.push('/ai-training')}
        style={{ alignSelf: 'stretch', marginTop: spacing.md }}
      />

      {/* 学习设置 */}
      <Button
        label="学习设置"
        icon="settings"
        variant="ghost"
        onPress={() => setShowStartModal(true)}
        style={{ alignSelf: 'stretch', marginTop: spacing.md }}
      />

      <StudyStartModal
        visible={showStartModal}
        settings={settings}
        onClose={() => setShowStartModal(false)}
        onChange={update}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { loadStudySettings, saveStudySettings, StudySettings } from '../../lib/studySettings';
import { colors, radius, spacing } from '../../lib/theme';
import { isDue, isNew } from '../../lib/srs';
import { startOfToday } from '../../lib/utils';
import { Button } from '../../components/ui';
import { StudyStartModal } from '../../components/StudyStartModal';

export default function StudyTab() {
  const { wordbooks } = useApp();
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);

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

  // 今日需学习进度（每日目标 / 截止日期都折算成「今日需学多少词」）
  const goal = useMemo(() => {
    if (!settings) return null;
    const target =
      settings.goalType === 'daily'
        ? settings.dailyGoal
        : Math.ceil(stats.totalToLearn / Math.max(1, settings.deadlineDays));
    const done = stats.learnedToday;
    return {
      target,
      done,
      remaining: Math.max(0, target - done),
      isDeadline: settings.goalType === 'deadline',
      days: settings.deadlineDays,
    };
  }, [settings, stats]);

  if (!settings) return <View style={styles.container} />;

  const mode = settings.studyMode ?? 'memorize_quiz';

  const handleStart = () => {
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 当前单词本（点击打开列表选择） */}
      <Text style={styles.sectionTitle}>当前单词本</Text>
      {wordbooks.length === 0 ? (
        <Pressable style={styles.emptyBook} onPress={() => router.push('/builtin')}>
          <Ionicons name="library-outline" size={20} color={colors.primary} />
          <Text style={styles.emptyBookText}>还没有单词本，去内置词库添加</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.bookSelector} onPress={() => setShowBookModal(true)}>
          <Ionicons name="book" size={18} color={colors.primary} />
          <Text style={styles.bookSelectorText}>{currentBook?.name ?? '选择单词本'}</Text>
          <Text style={styles.bookSelectorCount}>
            {currentBook ? `${currentBook.words.length} 词` : ''}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textLight} />
        </Pressable>
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

      {/* 今日需学习进度 */}
      {goal && currentBook ? (
        <View style={styles.goalCard}>
          <Text style={styles.goalTitle}>
            今日需学习 {goal.done}/{goal.target} 词
            {goal.isDeadline ? `（${goal.days} 天内完成初学）` : ''}
          </Text>
          <View style={styles.goalTrack}>
            <View
              style={[
                styles.goalFill,
                { width: `${goal.target > 0 ? Math.min(100, (goal.done / goal.target) * 100) : 0}%` },
              ]}
            />
          </View>
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

      {/* 学习目标 */}
      <Text style={styles.sectionTitle}>学习目标</Text>
      <View style={styles.goalSettings}>
        <View style={styles.chipRow}>
          <Chip
            label="每日目标"
            active={settings.goalType === 'daily'}
            onPress={() => update({ goalType: 'daily' })}
          />
          <Chip
            label="截止日期"
            active={settings.goalType === 'deadline'}
            onPress={() => update({ goalType: 'deadline' })}
          />
        </View>
        {settings.goalType === 'daily' ? (
          <Stepper
            label="每天新学单词数"
            value={settings.dailyGoal}
            min={5}
            max={200}
            step={5}
            onChange={(v) => update({ dailyGoal: v })}
          />
        ) : (
          <Stepper
            label="希望在几天内完成初学"
            value={settings.deadlineDays}
            min={7}
            max={365}
            step={7}
            onChange={(v) => update({ deadlineDays: v })}
          />
        )}
        <Text style={styles.goalNote}>
          目标：把所有新词学到「1-初识」等级（完成首次学习），之后的复习提升等级由你自行安排
        </Text>
      </View>

      {/* 开始学习 */}
      <Button
        label="开始学习"
        icon="play"
        onPress={handleStart}
        disabled={!currentBook || mode === 'ai_questions'}
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

      {/* 学习设置 */}
      <Button
        label="学习设置"
        icon="settings"
        variant="ghost"
        onPress={() => setShowStartModal(true)}
        style={{ marginTop: spacing.md }}
      />

      <StudyStartModal
        visible={showStartModal}
        settings={settings}
        onClose={() => setShowStartModal(false)}
        onChange={update}
      />

      {/* 单词本选择弹窗 */}
      <Modal
        visible={showBookModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBookModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>选择单词本</Text>
            <ScrollView style={styles.modalList}>
              {wordbooks.map((b) => (
                <Pressable
                  key={b.id}
                  style={styles.bookRow}
                  onPress={() => {
                    update({ currentBookId: b.id });
                    setShowBookModal(false);
                  }}
                >
                  <Ionicons name="book" size={18} color={colors.primary} />
                  <View style={styles.bookRowBody}>
                    <Text style={styles.bookRowName}>{b.name}</Text>
                    <Text style={styles.bookRowCount}>{b.words.length} 词</Text>
                  </View>
                  {b.id === currentBook?.id ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color={colors.textLight} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Button label="关闭" variant="ghost" onPress={() => setShowBookModal(false)} />
          </View>
        </View>
      </Modal>
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

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);

  const commit = () => {
    if (text == null) return;
    setText(null);
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) return;
    onChange(Math.max(min, Math.min(max, n)));
  };

  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
          onPress={() => onChange(Math.max(min, value - step))}
          hitSlop={6}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>
        <TextInput
          style={styles.stepInput}
          value={text ?? String(value)}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          selectTextOnFocus
          maxLength={4}
          scrollEnabled={false}
        />
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
          onPress={() => onChange(Math.min(max, value + step))}
          hitSlop={6}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  bookSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  bookSelectorText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  bookSelectorCount: { fontSize: 12, color: colors.textMuted },
  goalSettings: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  goalNote: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInput: {
    minWidth: 56,
    height: 34,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modalList: { flexShrink: 1, marginBottom: spacing.md },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bookRowBody: { flex: 1 },
  bookRowName: { fontSize: 15, fontWeight: '600', color: colors.text },
  bookRowCount: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

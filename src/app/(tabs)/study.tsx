import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { loadStudySettings, saveStudySettings, StudyMode, StudySettings } from '../../lib/studySettings';
import { colors, radius, spacing } from '../../lib/theme';
import { PickMode } from '../../lib/types';
import { isDue, isGraduated, isNew } from '../../lib/srs';
import { startOfToday } from '../../lib/utils';
import { Button } from '../../components/ui';

const MODES: {
  key: StudyMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  enabled: boolean;
}[] = [
  { key: 'memorize_quiz', icon: 'albums', title: '先背诵后测验', enabled: true },
  { key: 'ai_reading', icon: 'newspaper', title: 'AI 写短文，阅读后测验', enabled: true },
  { key: 'ai_questions', icon: 'create', title: 'AI 出题，学习后答题', enabled: false },
];

const PICK_MODES: { key: PickMode; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'sequential', title: '按顺序选取单词', icon: 'list' },
  { key: 'random', title: '随机选取单词', icon: 'shuffle' },
];

export default function StudyTab() {
  const { wordbooks } = useApp();
  const [settings, setSettings] = useState<StudySettings | null>(null);

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

  const start = () => {
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

      {/* 学习目标 */}
      <Text style={styles.sectionTitle}>学习目标</Text>
      <View style={styles.card}>
        <View style={styles.goalTypeRow}>
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
            label="希望在几天内学完"
            value={settings.deadlineDays}
            min={7}
            max={365}
            step={7}
            onChange={(v) => update({ deadlineDays: v })}
          />
        )}
      </View>

      {/* 学习方式 */}
      <Text style={styles.sectionTitle}>学习方式</Text>
      <View style={styles.card}>
        {MODES.map((m, i) => (
          <View key={m.key}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              disabled={!m.enabled}
              style={({ pressed }) => [
                styles.modeRow,
                (pressed || !m.enabled) && { opacity: 0.6 },
              ]}
              onPress={() => update({ studyMode: m.key })}
            >
              <Ionicons
                name={m.icon}
                size={20}
                color={m.enabled ? colors.primary : colors.textLight}
              />
              <Text style={[styles.modeText, !m.enabled && { color: colors.textLight }]}>
                {m.title}
              </Text>
              {!m.enabled ? (
                <Text style={styles.soonText}>敬请期待</Text>
              ) : (
                <Ionicons
                  name={mode === m.key ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={mode === m.key ? colors.primary : colors.textLight}
                />
              )}
            </Pressable>
          </View>
        ))}
      </View>

      {/* 本次学习量 */}
      <Text style={styles.sectionTitle}>本次学习量</Text>
      <View style={styles.card}>
        <Stepper
          label="本次学习单词数"
          value={settings.dailyWords}
          min={5}
          max={200}
          step={5}
          onChange={(v) => update({ dailyWords: v })}
        />
        {mode === 'ai_reading' ? (
          <>
            <View style={styles.divider} />
            <Stepper
              label="阅读几篇短文"
              value={settings.dailyPassages}
              min={1}
              max={10}
              onChange={(v) => update({ dailyPassages: v })}
            />
          </>
        ) : null}
      </View>

      {/* 选取方式 */}
      <Text style={styles.sectionTitle}>选取方式</Text>
      <View style={styles.card}>
        {PICK_MODES.map((p, i) => (
          <View key={p.key}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <Pressable style={styles.modeRow} onPress={() => update({ pickMode: p.key })}>
              <Ionicons name={p.icon} size={20} color={colors.primary} />
              <Text style={styles.modeText}>{p.title}</Text>
              <Ionicons
                name={settings.pickMode === p.key ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={settings.pickMode === p.key ? colors.primary : colors.textLight}
              />
            </Pressable>
          </View>
        ))}
      </View>

      {/* 开始学习 */}
      <Button
        label={mode === 'ai_reading' ? '开始阅读学习' : '开始背诵学习'}
        icon="play"
        onPress={start}
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
        <Text style={styles.stepValue}>{value}</Text>
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
  goalTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  modeText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  soonText: { fontSize: 12, color: colors.textLight },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
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
  stepValue: { fontSize: 17, fontWeight: '700', color: colors.text, minWidth: 32, textAlign: 'center' },
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

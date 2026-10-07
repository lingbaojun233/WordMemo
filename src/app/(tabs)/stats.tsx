import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { boxLabel, isMastered } from '../../lib/srs';
import { colors, radius, spacing } from '../../lib/theme';
import { loadStudySettings, saveStudySettings, StudySettings } from '../../lib/studySettings';
import { ReviewResult } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import { BookSelector } from '../../components/BookSelector';
import { Button, EmptyState } from '../../components/ui';
import { loadAiqState } from '../../lib/aiq/store';
import {
  AiqState,
  Attempt,
  ErrorType,
  ERROR_TYPE_LABEL,
  QUESTION_TYPE_LABEL,
} from '../../lib/aiq/types';

type HistoryItem = { term: string; result: ReviewResult; box: number; at: number };
type DayActivity = { day: string; words: HistoryItem[]; attempts: Attempt[] };

export default function StatsScreen() {
  const { wordbooks, currentUser } = useApp();
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [aiq, setAiq] = useState<AiqState | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayActivity | null>(null);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  // 每次进入统计页都重新读取 AI 训练数据
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const userId = currentUser?.id;
      if (userId) {
        loadAiqState(userId).then((s) => {
          if (alive) setAiq(s);
        });
      } else {
        setAiq(null);
      }
      return () => {
        alive = false;
      };
    }, [currentUser?.id])
  );

  const book =
    wordbooks.find((b) => b.id === settings?.currentBookId) ?? wordbooks[0] ?? null;

  const selectBook = async (id: string) => {
    if (!settings) return;
    const next = { ...settings, currentBookId: id };
    setSettings(next);
    await saveStudySettings(next);
  };

  const stats = useMemo(() => {
    if (!book) return null;
    const total = book.words.length;
    const unlearned = book.words.filter((w) => w.box === 0).length;
    const mastered = book.words.filter(isMastered).length;
    const correct = book.words.reduce((s, w) => s + w.correctCount, 0);
    const wrong = book.words.reduce((s, w) => s + w.wrongCount, 0);
    const attempts = correct + wrong;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, unlearned, mastered, accuracy, pct };
  }, [book]);

  // 每日学习历史：单词复习 + AI 答题，按天合并
  const daily = useMemo(() => {
    const map = new Map<string, DayActivity>();
    if (book) {
      for (const w of book.words) {
        for (const r of w.history ?? []) {
          const day = formatDate(r.at);
          const d = map.get(day) ?? { day, words: [], attempts: [] };
          d.words.push({ term: w.term, result: r.result, box: r.box, at: r.at });
          map.set(day, d);
        }
      }
    }
    for (const a of aiq?.attempts ?? []) {
      const day = formatDate(a.at);
      const d = map.get(day) ?? { day, words: [], attempts: [] };
      d.attempts.push(a);
      map.set(day, d);
    }
    return Array.from(map.values())
      .map((d) => ({
        ...d,
        words: d.words.sort((x, y) => y.at - x.at),
        attempts: d.attempts.sort((x, y) => y.at - x.at),
      }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [book, aiq]);

  // AI 训练档案摘要
  const aiqSummary = useMemo(() => {
    if (!aiq) return null;
    const total = aiq.attempts.length;
    const correct = aiq.attempts.filter((a) => a.isCorrect).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const errMap = new Map<string, number>();
    for (const a of aiq.attempts) {
      if (!a.isCorrect && a.errorType) {
        errMap.set(a.errorType, (errMap.get(a.errorType) ?? 0) + 1);
      }
    }
    const weak = Array.from(errMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, c]) => `${ERROR_TYPE_LABEL[t as ErrorType] ?? t} ${c}次`);
    return { total, correct, accuracy, weak, adviceCount: aiq.advice.length };
  }, [aiq]);

  if (wordbooks.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="stats-chart-outline"
          title="暂无数据"
          description="开始学习后，这里会展示你的学习统计"
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.bookSelectorWrap}>
        <BookSelector books={wordbooks} value={book} onChange={(id) => void selectBook(id)} />
      </View>

      {stats && book ? (
        <>
          <View style={styles.grid}>
            <StatCard icon="book" label="总单词数" value={String(stats.total)} color={colors.primary} />
            <StatCard icon="ellipse-outline" label="未学习" value={String(stats.unlearned)} color={colors.warning} />
            <StatCard icon="checkmark-circle" label="已掌握" value={String(stats.mastered)} color={colors.success} />
            <StatCard icon="ribbon" label="正确率" value={stats.accuracy > 0 ? `${stats.accuracy}%` : '—'} color={colors.accent} />
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${stats.pct}%` }]} />
          </View>
        </>
      ) : null}

      {/* AI 训练档案 */}
      <Text style={styles.sectionTitle}>AI 训练档案</Text>
      {aiqSummary ? (
        <View style={styles.aiqCard}>
          <View style={styles.aiqRow}>
            <Text style={styles.aiqLabel}>累计答题</Text>
            <Text style={styles.aiqValue}>{aiqSummary.total} 题 · 正确率 {aiqSummary.accuracy}%</Text>
          </View>
          <View style={styles.aiqRow}>
            <Text style={styles.aiqLabel}>学习建议</Text>
            <Text style={styles.aiqValue}>{aiqSummary.adviceCount} 条</Text>
          </View>
          <View style={styles.aiqRow}>
            <Text style={styles.aiqLabel}>近期薄弱点</Text>
            <Text style={styles.aiqValue}>
              {aiqSummary.weak.length > 0 ? aiqSummary.weak.join('、') : '暂无'}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.emptyHistory}>还没有 AI 训练记录，去「AI 出题」练一练吧</Text>
      )}

      {/* 每日学习历史（点击查看当天详情） */}
      <Text style={styles.sectionTitle}>每日学习历史</Text>
      {daily.length === 0 ? (
        <Text style={styles.emptyHistory}>还没有学习记录</Text>
      ) : (
        daily.map((d) => (
          <Pressable key={d.day} style={styles.dayRow} onPress={() => setSelectedDay(d)}>
            <View style={styles.dayRowBody}>
              <Text style={styles.dayRowTitle}>{d.day}</Text>
              <Text style={styles.dayRowCount}>
                学 {d.words.length} 词 · 答 {d.attempts.length} 题
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
          </Pressable>
        ))
      )}

      {/* 当天历史弹窗 */}
      <Modal
        visible={selectedDay !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedDay?.day} · 学习记录</Text>
            <ScrollView style={styles.modalList}>
              {selectedDay && selectedDay.words.length > 0 ? (
                <Text style={styles.modalSubtitle}>单词学习</Text>
              ) : null}
              {selectedDay?.words.map((r, i) => {
                const good = r.result === 'good';
                return (
                  <View key={`w-${i}`} style={styles.modalRow}>
                    <Text style={styles.historyTerm}>{r.term}</Text>
                    <Text style={[styles.historyStatus, { color: good ? colors.success : colors.danger }]}>
                      {good ? '✓ 答对' : '✗ 答错'} → {boxLabel(r.box)}
                    </Text>
                  </View>
                );
              })}

              {selectedDay && selectedDay.attempts.length > 0 ? (
                <Text style={styles.modalSubtitle}>AI 答题</Text>
              ) : null}
              {selectedDay?.attempts.map((a, i) => {
                const type = QUESTION_TYPE_LABEL[a.questionType] ?? a.questionType;
                return (
                  <View key={`a-${i}`} style={styles.modalRow}>
                    <Text style={styles.attemptPrompt} numberOfLines={1}>
                      [{type}] {a.prompt}
                    </Text>
                    <Text style={[styles.historyStatus, { color: a.isCorrect ? colors.success : colors.danger }]}>
                      {a.isCorrect ? '✓' : '✗'}
                      {!a.isCorrect && a.errorType
                        ? ` ${ERROR_TYPE_LABEL[a.errorType as ErrorType] ?? ''}`
                        : ''}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <Button label="关闭" variant="outline" onPress={() => setSelectedDay(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  bookSelectorWrap: { marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.success },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  emptyHistory: { fontSize: 13, color: colors.textLight },
  aiqCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  aiqRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  aiqLabel: { fontSize: 13, color: colors.textMuted },
  aiqValue: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'right' },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayRowBody: { flex: 1 },
  dayRowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  dayRowCount: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  historyTerm: { fontSize: 15, fontWeight: '600', color: colors.text },
  historyStatus: { fontSize: 13, fontWeight: '600' },
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
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modalList: { flexShrink: 1, marginBottom: spacing.md },
  modalSubtitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attemptPrompt: { flex: 1, fontSize: 13, color: colors.textMuted, marginRight: spacing.sm },
});

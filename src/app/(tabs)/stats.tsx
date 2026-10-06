import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { boxLabel, isMastered } from '../../lib/srs';
import { colors, radius, spacing } from '../../lib/theme';
import { ReviewResult } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import { EmptyState } from '../../components/ui';

type HistoryItem = { term: string; result: ReviewResult; box: number; at: number };

export default function StatsScreen() {
  const { wordbooks } = useApp();
  const [bookId, setBookId] = useState<string | null>(null);

  const book = wordbooks.find((b) => b.id === bookId) ?? wordbooks[0] ?? null;

  // 选中词本的统计（不合并其它词本）
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

  // 每日学习历史：按天分组，每天列出学过的单词及其变动状态
  const dailyHistory = useMemo(() => {
    if (!book) return [];
    const map = new Map<string, HistoryItem[]>();
    for (const w of book.words) {
      for (const r of w.history ?? []) {
        const day = formatDate(r.at);
        const list = map.get(day) ?? [];
        list.push({ term: w.term, result: r.result, box: r.box, at: r.at });
        map.set(day, list);
      }
    }
    return Array.from(map.entries())
      .map(([day, list]) => ({ day, list: list.sort((a, b) => b.at - a.at) }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [book]);

  if (wordbooks.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="stats-chart-outline"
          title="暂无数据"
          description="开始背单词后，这里会展示你的学习统计"
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 选择单词本 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bookSwitch}
      >
        {wordbooks.map((b) => (
          <Pressable
            key={b.id}
            style={[styles.chip, b.id === book?.id && styles.chipActive]}
            onPress={() => setBookId(b.id)}
          >
            <Text style={[styles.chipText, b.id === book?.id && styles.chipTextActive]}>
              {b.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

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

      {/* 每日学习历史 */}
      <Text style={styles.sectionTitle}>每日学习历史</Text>
      {dailyHistory.length === 0 ? (
        <Text style={styles.emptyHistory}>还没有学习记录</Text>
      ) : (
        dailyHistory.map(({ day, list }) => (
          <View key={day} style={styles.dayCard}>
            <Text style={styles.dayTitle}>
              {day} · {list.length} 词
            </Text>
            {list.map((r, i) => {
              const good = r.result === 'good';
              return (
                <View key={`${day}-${i}`} style={styles.historyRow}>
                  <Text style={styles.historyTerm}>{r.term}</Text>
                  <Text style={[styles.historyStatus, { color: good ? colors.success : colors.danger }]}>
                    {good ? '✓ 答对' : '✗ 答错'} → {boxLabel(r.box)}
                  </Text>
                </View>
              );
            })}
          </View>
        ))
      )}
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
  bookSwitch: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2, marginBottom: spacing.md },
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
  dayCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyTerm: { fontSize: 15, fontWeight: '600', color: colors.text },
  historyStatus: { fontSize: 13, fontWeight: '600' },
});

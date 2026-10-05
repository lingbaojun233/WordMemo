import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { dueWords, isMastered } from '../../lib/srs';
import { colors, radius, spacing } from '../../lib/theme';
import { EmptyState } from '../../components/ui';

export default function StatsScreen() {
  const { wordbooks } = useApp();

  const allWords = wordbooks.flatMap((b) => b.words);
  const total = allWords.length;
  const mastered = allWords.filter(isMastered).length;
  const due = dueWords(allWords).length;
  const correct = allWords.reduce((s, w) => s + w.correctCount, 0);
  const wrong = allWords.reduce((s, w) => s + w.wrongCount, 0);
  const attempts = correct + wrong;
  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;

  if (total === 0) {
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
      <View style={styles.grid}>
        <StatCard icon="book" label="总单词数" value={String(total)} color={colors.primary} />
        <StatCard
          icon="checkmark-circle"
          label="已掌握"
          value={String(mastered)}
          color={colors.success}
        />
        <StatCard
          icon="alarm"
          label="待复习"
          value={String(due)}
          color={colors.warning}
        />
        <StatCard
          icon="ribbon"
          label="正确率"
          value={attempts > 0 ? `${accuracy}%` : '—'}
          color={colors.accent}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>各单词本进度</Text>
        {wordbooks.map((b) => {
          const t = b.words.length;
          const m = b.words.filter(isMastered).length;
          const d = dueWords(b.words).length;
          const pct = t > 0 ? Math.round((m / t) * 100) : 0;
          return (
            <View key={b.id} style={styles.bookRow}>
              <View style={styles.bookHead}>
                <Text style={styles.bookName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.bookPct}>{pct}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.bookMeta}>
                {t} 词 · 掌握 {m} · 待复习 {d}
              </Text>
            </View>
          );
        })}
      </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
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
  section: { marginTop: spacing.xl },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  bookRow: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bookHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bookName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  bookPct: { fontSize: 15, fontWeight: '800', color: colors.primary },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  bookMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
});

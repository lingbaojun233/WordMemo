import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { boxColors, colors, radius, spacing } from '../../../lib/theme';
import { BOX_LABELS } from '../../../lib/srs';
import { EmptyState } from '../../../components/ui';

export default function ProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const counts = useMemo(() => {
    if (!book) return [];
    const arr = BOX_LABELS.map((label, box) => ({ box, label, count: 0 }));
    for (const w of book.words) {
      const idx = Math.max(0, Math.min(BOX_LABELS.length - 1, w.box));
      arr[idx].count++;
    }
    return arr;
  }, [book]);

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" description="它可能已被删除" />
      </View>
    );
  }

  const total = book.words.length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '各阶段学习情况' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{total}</Text>
          <Text style={styles.summaryLabel}>{book.name} · 总词数</Text>
        </View>

        {counts.map((c) => {
          const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
          const color = boxColors[c.box] ?? colors.textLight;
          return (
            <View key={c.box} style={styles.row}>
              <View style={styles.rowHead}>
                <View style={styles.labelWrap}>
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <Text style={styles.rowLabel}>
                    {c.box}-{c.label}
                  </Text>
                </View>
                <Text style={styles.rowCount}>{c.count} 词 · {pct}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryValue: { fontSize: 34, fontWeight: '800', color: colors.primary },
  summaryLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowCount: { fontSize: 13, color: colors.textMuted },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: { height: 6, borderRadius: 3 },
});

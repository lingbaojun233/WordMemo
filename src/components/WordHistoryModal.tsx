import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { boxColors, colors, radius, spacing } from '../lib/theme';
import { boxLabel, isDue, isNew } from '../lib/srs';
import { ReviewResult, Word } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import { Button } from './ui';

function accuracy(w: Word): string {
  const total = w.correctCount + w.wrongCount;
  if (total <= 0) return '—';
  return `${Math.round((w.correctCount / total) * 100)}%`;
}

function nextReviewText(w: Word): string {
  if (isNew(w)) return '新词，尚未开始学习';
  if (isDue(w)) return '已到期，可复习';
  return formatDateTime(w.dueAt);
}

function resultLabel(result: ReviewResult): string {
  return result === 'good' ? '✓ 答对' : '✗ 答错';
}

/** 单词学习历史/进度弹窗（点击单词卡查看），含逐次复习时间线 */
export function WordHistoryModal({
  visible,
  word,
  onClose,
}: {
  visible: boolean;
  word: Word | null;
  onClose: () => void;
}) {
  const history = word ? [...(word.history ?? [])].sort((a, b) => a.at - b.at) : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {word ? (
            <>
              <Text style={styles.sectionLabel}>学习历史</Text>
              <View style={styles.head}>
                <View style={styles.termWrap}>
                  <Text style={styles.term}>{word.term}</Text>
                  {word.phonetic ? <Text style={styles.phonetic}>{word.phonetic}</Text> : null}
                </View>
                <View
                  style={[
                    styles.boxBadge,
                    { backgroundColor: `${boxColors[word.box] ?? colors.textLight}22` },
                  ]}
                >
                  <View
                    style={[styles.boxDot, { backgroundColor: boxColors[word.box] ?? colors.textLight }]}
                  />
                  <Text style={[styles.boxText, { color: boxColors[word.box] ?? colors.textLight }]}>
                    {boxLabel(word.box)}
                  </Text>
                </View>
              </View>
              <Text style={styles.meaning}>{word.meaning}</Text>

              <View style={styles.stats}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.success }]}>{word.correctCount}</Text>
                  <Text style={styles.statLabel}>答对</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.danger }]}>{word.wrongCount}</Text>
                  <Text style={styles.statLabel}>答错</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>{accuracy(word)}</Text>
                  <Text style={styles.statLabel}>正确率</Text>
                </View>
              </View>

              <Text style={styles.timelineTitle}>学习历程</Text>
              <ScrollView style={styles.timelineScroll} showsVerticalScrollIndicator>
                {/* 起点：加入单词本 */}
                <View style={styles.timelineRow}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, { backgroundColor: colors.textLight }]} />
                    {history.length > 0 ? <View style={styles.railLine} /> : null}
                  </View>
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineTime}>{formatDateTime(word.createdAt)}</Text>
                    <Text style={styles.timelineJoin}>加入单词本</Text>
                  </View>
                </View>

                {/* 每一次复习/测试 */}
                {history.map((r, i) => {
                  const isLast = i === history.length - 1;
                  return (
                    <View key={`${r.at}-${i}`} style={styles.timelineRow}>
                      <View style={styles.rail}>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: boxColors[r.box] ?? colors.textLight },
                          ]}
                        />
                        {!isLast ? <View style={styles.railLine} /> : null}
                      </View>
                      <View style={styles.timelineBody}>
                        <Text style={styles.timelineTime}>{formatDateTime(r.at)}</Text>
                        <Text style={styles.timelineResult}>
                          {resultLabel(r.result)} → {boxLabel(r.box)}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {history.length === 0 ? (
                  <Text style={styles.emptyHistory}>暂无学习记录</Text>
                ) : null}
              </ScrollView>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>下次复习</Text>
                <Text style={styles.infoValue}>{nextReviewText(word)}</Text>
              </View>

              <Button label="关闭" variant="outline" onPress={onClose} style={{ marginTop: spacing.md }} />
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '88%',
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textLight, marginBottom: spacing.sm },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  termWrap: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  term: { fontSize: 24, fontWeight: '800', color: colors.text },
  phonetic: { fontSize: 14, color: colors.textMuted },
  meaning: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginTop: spacing.sm },
  boxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  boxDot: { width: 8, height: 8, borderRadius: 4 },
  boxText: { fontSize: 11, fontWeight: '700' },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  timelineScroll: { flexShrink: 1 },
  timelineRow: { flexDirection: 'row' },
  rail: { width: 20, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  railLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  timelineBody: { flex: 1, paddingLeft: spacing.sm, paddingBottom: spacing.md },
  timelineTime: { fontSize: 12, color: colors.textLight },
  timelineJoin: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  timelineResult: { fontSize: 14, fontWeight: '600', marginTop: 2, color: colors.text },
  emptyHistory: { fontSize: 13, color: colors.textLight, paddingBottom: spacing.md },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  infoLabel: { fontSize: 14, color: colors.textMuted },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.text },
});

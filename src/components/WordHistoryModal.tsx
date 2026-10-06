import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { boxColors, colors, radius, spacing } from '../lib/theme';
import { boxLabel, isDue, isNew } from '../lib/srs';
import { Word } from '../lib/types';
import { formatDate, formatRelative } from '../lib/utils';
import { Button } from './ui';

function accuracy(w: Word): string {
  const total = w.correctCount + w.wrongCount;
  if (total <= 0) return '—';
  return `${Math.round((w.correctCount / total) * 100)}%`;
}

function nextReviewText(w: Word): string {
  if (isNew(w)) return '新词，尚未开始学习';
  if (isDue(w)) return '已到期，可复习';
  return formatRelative(w.dueAt);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/** 单词学习历史/进度弹窗（点击单词卡查看） */
export function WordHistoryModal({
  visible,
  word,
  onClose,
}: {
  visible: boolean;
  word: Word | null;
  onClose: () => void;
}) {
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

              <View style={styles.infoList}>
                <InfoRow label="当前等级" value={boxLabel(word.box)} />
                <InfoRow
                  label="最近复习"
                  value={word.lastReviewedAt ? formatRelative(word.lastReviewedAt) : '尚未复习'}
                />
                <InfoRow label="下次复习" value={nextReviewText(word)} />
                <InfoRow label="加入时间" value={formatDate(word.createdAt)} />
              </View>
            </>
          ) : null}

          <Button label="关闭" variant="outline" onPress={onClose} style={{ marginTop: spacing.md }} />
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
  infoList: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  infoLabel: { fontSize: 14, color: colors.textMuted },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.text },
});

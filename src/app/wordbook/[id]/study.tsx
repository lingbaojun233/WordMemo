import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { dueWords } from '../../../lib/srs';
import { boxColors, colors, radius, spacing } from '../../../lib/theme';
import { ReviewResult, Word } from '../../../lib/types';
import { Button, EmptyState } from '../../../components/ui';

type Phase = 'intro' | 'study' | 'done';

export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, reviewWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [phase, setPhase] = useState<Phase>('intro');
  const [deck, setDeck] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seenCount, setSeenCount] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0 });

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" />
      </View>
    );
  }

  const due = dueWords(book.words);

  const start = (mode: 'due' | 'all') => {
    const words = mode === 'due' ? due : book.words;
    setDeck(words);
    setTotal(words.length);
    setFlipped(false);
    setSeenCount({});
    setCounts({ again: 0, hard: 0, good: 0 });
    setPhase(words.length > 0 ? 'study' : 'done');
  };

  const rate = (result: ReviewResult) => {
    const current = deck[0];
    if (!current) return;

    reviewWord(book.id, current.id, result);
    setCounts((c) => ({ ...c, [result]: c[result] + 1 }));

    const seen = seenCount[current.id] ?? 0;
    if (result === 'good' || seen >= 1) {
      // 认识，或已重复出现过，从队列移除
      setDeck((q) => q.slice(1));
      setFlipped(false);
      if (deck.length === 1) setPhase('done');
    } else {
      // 不认识/模糊：插到队尾，稍后再次出现（最多重复一次）
      setSeenCount((s) => ({ ...s, [current.id]: seen + 1 }));
      setDeck((q) => [...q.slice(1), q[0]]);
      setFlipped(false);
    }
  };

  // ---------- 阶段一：开始页 ----------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Ionicons name="albums" size={40} color={colors.primary} />
          </View>
          {due.length > 0 ? (
            <>
              <Text style={styles.introTitle}>今日待复习 {due.length} 个</Text>
              <Text style={styles.introDesc}>
                共 {book.words.length} 个单词，按记忆曲线安排复习
              </Text>
              <Button
                label="开始复习"
                icon="play"
                onPress={() => start('due')}
                style={{ alignSelf: 'stretch' }}
              />
            </>
          ) : book.words.length > 0 ? (
            <>
              <Text style={styles.introTitle}>今日复习已完成 🎉</Text>
              <Text style={styles.introDesc}>
                没有到期的单词。可以复习全部单词，或稍后再来
              </Text>
              <Button
                label="复习全部单词"
                icon="refresh"
                onPress={() => start('all')}
                style={{ alignSelf: 'stretch' }}
              />
            </>
          ) : (
            <EmptyState
              icon="book-outline"
              title="单词本为空"
              description="请先添加或导入单词"
            />
          )}
        </View>
      </View>
    );
  }

  // ---------- 阶段三：完成页 ----------
  if (phase === 'done') {
    return (
      <View style={styles.container}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="checkmark-done" size={40} color={colors.success} />
          </View>
          <Text style={styles.introTitle}>本轮复习完成</Text>
          <Text style={styles.introDesc}>本次共复习 {total} 个单词</Text>

          <View style={styles.summaryRow}>
            <SummaryItem color={colors.success} label="认识" value={counts.good} />
            <SummaryItem color={colors.warning} label="模糊" value={counts.hard} />
            <SummaryItem color={colors.danger} label="不认识" value={counts.again} />
          </View>

          <Button
            label="返回单词本"
            icon="arrow-back"
            onPress={() => router.back()}
            style={{ alignSelf: 'stretch' }}
          />
          <Button
            label="再复习一轮"
            variant="outline"
            icon="refresh"
            onPress={() => start('due')}
            style={{ alignSelf: 'stretch', marginTop: 0 }}
          />
        </View>
      </View>
    );
  }

  // ---------- 阶段二：背诵 ----------
  const current = deck[0];
  if (!current) return null;

  const progress = total > 0 ? (total - deck.length) / total : 0;

  return (
    <View style={styles.container}>
      {/* 进度条 */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {total - deck.length} / {total}
        </Text>
      </View>

      {/* 卡片 */}
      <Pressable style={styles.card} onPress={() => setFlipped((f) => !f)}>
        <View style={[styles.cardBadge, { backgroundColor: boxColors[current.box] ?? colors.textLight }]} />
        <Text style={styles.cardTerm}>{current.term}</Text>
        {current.phonetic ? <Text style={styles.cardPhonetic}>{current.phonetic}</Text> : null}

        <View style={styles.divider} />

        {flipped ? (
          <>
            <Text style={styles.cardMeaning}>{current.meaning}</Text>
            {current.derivatives && current.derivatives.length > 0 ? (
              <View style={styles.derivBox}>
                <Text style={styles.derivTitle}>派生词</Text>
                {current.derivatives.map((d) => (
                  <Text key={d.term} style={styles.derivItem}>
                    <Text style={styles.derivTerm}>{d.term}</Text>  {d.meaning}
                  </Text>
                ))}
              </View>
            ) : null}
            {current.example ? (
              <Text style={styles.cardExample}>{current.example}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.flipHint}>点击卡片查看释义</Text>
        )}
      </Pressable>

      {/* 评分按钮 */}
      <View style={styles.rating}>
        {flipped ? (
          <View style={styles.ratingRow}>
            <RatingButton
              label="不认识"
              sub="重来"
              icon="close"
              color={colors.danger}
              onPress={() => rate('again')}
            />
            <RatingButton
              label="模糊"
              sub="再看"
              icon="help"
              color={colors.warning}
              onPress={() => rate('hard')}
            />
            <RatingButton
              label="认识"
              sub="下一个"
              icon="checkmark"
              color={colors.success}
              onPress={() => rate('good')}
            />
          </View>
        ) : (
          <Text style={styles.ratingHint}>先翻面，再选择掌握程度</Text>
        )}
      </View>
    </View>
  );
}

function RatingButton({
  label,
  sub,
  icon,
  color,
  onPress,
}: {
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.ratingBtn,
        { backgroundColor: `${color}14`, borderColor: `${color}55` },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.ratingLabel, { color }]}>{label}</Text>
      <Text style={styles.ratingSub}>{sub}</Text>
    </Pressable>
  );
}

function SummaryItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  intro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  introIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  introTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  introDesc: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  progressText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  card: {
    flex: 1,
    margin: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  cardBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  cardTerm: { fontSize: 38, fontWeight: '800', color: colors.text, textAlign: 'center' },
  cardPhonetic: { fontSize: 16, color: colors.textMuted, marginTop: spacing.sm },
  divider: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  cardMeaning: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center', lineHeight: 30 },
  cardExample: {
    fontSize: 15,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
  derivBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    alignSelf: 'stretch',
  },
  derivTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  derivItem: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  derivTerm: { fontWeight: '700', color: colors.text },
  flipHint: { fontSize: 14, color: colors.textLight },
  rating: { padding: spacing.md, paddingBottom: spacing.xl },
  ratingRow: { flexDirection: 'row', gap: spacing.md },
  ratingBtn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 14,
    gap: 2,
  },
  ratingLabel: { fontSize: 15, fontWeight: '700' },
  ratingSub: { fontSize: 11, color: colors.textMuted },
  ratingHint: { textAlign: 'center', fontSize: 13, color: colors.textLight, paddingVertical: 12 },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  summaryValue: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

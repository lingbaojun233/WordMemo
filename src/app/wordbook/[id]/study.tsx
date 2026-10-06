import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { buildQuiz, QuizQuestion } from '../../../lib/quiz';
import { loadStudySettings, StudySettings } from '../../../lib/studySettings';
import { colors, radius, spacing } from '../../../lib/theme';
import { Word } from '../../../lib/types';
import { shuffle, startOfToday } from '../../../lib/utils';
import { Button, EmptyState } from '../../../components/ui';

const GROUP_SIZE = 5; // 每 5 个单词为一组：先背诵一组，再测验一组

type Phase = 'intro' | 'study' | 'done';
type SubPhase = 'memorize' | 'quiz';

export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, reviewWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [groupIdx, setGroupIdx] = useState(0);
  const [subPhase, setSubPhase] = useState<SubPhase>('memorize');
  const [subIdx, setSubIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  // 今日还需学习多少词（学到今日目标完成为止）
  const remaining = useMemo(() => {
    if (!book || !settings) return 0;
    const start = startOfToday();
    const learnedToday = book.words.filter(
      (w) => w.lastReviewedAt && w.lastReviewedAt >= start
    ).length;
    if (settings.goalType === 'daily') {
      return Math.max(0, settings.dailyGoal - learnedToday);
    }
    const active = book.words.filter((w) => w.box < settings.targetLevel).length;
    const perDay = Math.ceil(active / Math.max(1, settings.deadlineDays));
    return Math.max(0, perDay - learnedToday);
  }, [book, settings]);

  // 本次要学的新词（box 0，尚未学会），最多 remaining 个
  const selected = useMemo(() => {
    if (!book || !settings || remaining <= 0) return [];
    const newWords = book.words.filter((w) => w.box === 0);
    const ordered = settings.pickMode === 'random' ? shuffle(newWords) : newWords;
    return ordered.slice(0, remaining);
  }, [book, settings, remaining]);

  // 分组（每 5 个一组）
  const groups = useMemo(() => {
    const g: Word[][] = [];
    for (let i = 0; i < selected.length; i += GROUP_SIZE) {
      g.push(selected.slice(i, i + GROUP_SIZE));
    }
    return g;
  }, [selected]);

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" />
      </View>
    );
  }

  const currentGroup = groups[groupIdx] ?? [];
  const currentWord = currentGroup[subIdx];
  const currentQ = quiz[groupIdx * GROUP_SIZE + subIdx] ?? null;

  const start = () => {
    setQuiz(buildQuiz(selected, book.words));
    setGroupIdx(0);
    setSubPhase('memorize');
    setSubIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setPhase('study');
  };

  const answer = (opt: string) => {
    if (picked || !currentQ) return;
    setPicked(opt);
    const isCorrect = opt === currentQ.correct;
    if (isCorrect) setCorrectCount((c) => c + 1);
    // 通过升一级，不通过保持不变
    reviewWord(book.id, currentQ.id, isCorrect ? 'good' : 'again');
    if (isCorrect) {
      setTimeout(() => nextQuiz(), 800);
    }
  };

  const nextMemorize = () => {
    if (subIdx + 1 < currentGroup.length) {
      setSubIdx(subIdx + 1);
    } else {
      setSubPhase('quiz');
      setSubIdx(0);
      setPicked(null);
    }
  };

  const nextQuiz = () => {
    if (subIdx + 1 < currentGroup.length) {
      setSubIdx(subIdx + 1);
      setPicked(null);
    } else if (groupIdx + 1 < groups.length) {
      setGroupIdx(groupIdx + 1);
      setSubPhase('memorize');
      setSubIdx(0);
      setPicked(null);
    } else {
      setPhase('done');
    }
  };

  // ---------- 开始页 ----------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '先背诵后测验' }} />
        <View style={styles.center}>
          <View style={styles.heroIcon}>
            <Ionicons name="albums" size={40} color={colors.primary} />
          </View>
          {remaining > 0 && selected.length > 0 ? (
            <>
              <Text style={styles.title}>今日还需学习 {remaining} 词</Text>
              <Text style={styles.subDesc}>
                共 {groups.length} 组 · 每组 {GROUP_SIZE} 词 · 先背诵后测验
              </Text>
              <Text style={styles.desc}>
                每次先背诵一组 {GROUP_SIZE} 个单词，再对它们进行测验。选对升一级，选错保持不变
              </Text>
              <Button label="开始学习" icon="play" onPress={start} style={{ alignSelf: 'stretch' }} />
            </>
          ) : (
            <EmptyState
              icon="checkmark-circle-outline"
              title="今日目标已完成"
              description="很棒！可以复习到期单词，或休息一下"
            />
          )}
        </View>
      </View>
    );
  }

  // ---------- 完成页 ----------
  if (phase === 'done') {
    const total = quiz.length;
    const acc = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '先背诵后测验' }} />
        <View style={styles.center}>
          <View style={[styles.heroIcon, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="checkmark-done" size={40} color={colors.success} />
          </View>
          <Text style={styles.title}>本轮完成</Text>
          <Text style={styles.desc}>共 {total} 题</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{correctCount}</Text>
              <Text style={styles.summaryLabel}>答对</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>{total - correctCount}</Text>
              <Text style={styles.summaryLabel}>答错</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{acc}%</Text>
              <Text style={styles.summaryLabel}>正确率</Text>
            </View>
          </View>
          <Button label="返回" icon="arrow-back" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  // ---------- 学习页 ----------
  if (!currentWord || !currentQ) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '先背诵后测验' }} />

      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>
          第 {groupIdx + 1}/{groups.length} 组 · {subPhase === 'memorize' ? '背诵' : '测验'}{' '}
          {subIdx + 1}/{currentGroup.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.studyContent}>
        {subPhase === 'memorize' ? (
          <>
            <View style={styles.wordCard}>
              <Text style={styles.questionLabel}>先记住这个单词</Text>
              <Text style={styles.word}>{currentWord.term}</Text>
              <View style={styles.divider} />
              <Text style={styles.memorizeMeaning}>{currentWord.meaning}</Text>
            </View>

            {currentWord.derivatives && currentWord.derivatives.length > 0 ? (
              <View style={styles.derivBox}>
                <Text style={styles.derivTitle}>派生词</Text>
                {currentWord.derivatives.map((d) => (
                  <Text key={d.term} style={styles.derivItem}>
                    <Text style={styles.derivTerm}>{d.term}</Text>  {d.meaning}
                  </Text>
                ))}
              </View>
            ) : null}

            <Button
              label={subIdx + 1 < currentGroup.length ? '下一个' : '开始测验'}
              icon="arrow-forward"
              onPress={nextMemorize}
            />
          </>
        ) : (
          <>
            <View style={styles.wordCard}>
              <Text style={styles.questionLabel}>选择正确释义</Text>
              <Text style={styles.word}>{currentWord.term}</Text>
            </View>

            <View style={styles.options}>
              {currentQ.options.map((opt) => {
                const isCorrect = opt === currentQ.correct;
                const isPicked = picked === opt;
                let border = {};
                if (picked) {
                  if (isCorrect) border = { borderColor: colors.success, backgroundColor: '#F0FDF4' };
                  else if (isPicked) border = { borderColor: colors.danger, backgroundColor: '#FEF2F2' };
                }
                return (
                  <Button
                    key={opt}
                    label={opt}
                    variant="outline"
                    onPress={() => answer(opt)}
                    disabled={picked !== null}
                    style={{ alignSelf: 'stretch', ...border }}
                    textStyle={{ textAlign: 'left' }}
                  />
                );
              })}
            </View>

            {picked !== null && picked !== currentQ.correct ? (
              <>
                <View style={styles.correctBox}>
                  <Text style={styles.correctText}>
                    正确释义：<Text style={{ fontWeight: '800', color: colors.text }}>{currentQ.correct}</Text>
                  </Text>
                </View>
                <Button label="下一个" icon="arrow-forward" onPress={nextQuiz} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subDesc: { fontSize: 13, color: colors.textLight, textAlign: 'center', marginTop: spacing.xs },
  desc: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.md },
  progressWrap: { padding: spacing.md, paddingBottom: 0 },
  progressText: { fontSize: 14, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  studyContent: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md },
  wordCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  questionLabel: { fontSize: 13, color: colors.textMuted },
  word: { fontSize: 34, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  divider: { width: 40, height: 3, borderRadius: 2, backgroundColor: colors.border, marginVertical: spacing.md },
  memorizeMeaning: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center', lineHeight: 30 },
  options: { gap: spacing.md },
  derivBox: {
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
  },
  derivTitle: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: spacing.xs },
  derivItem: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  derivTerm: { fontWeight: '700', color: colors.text },
  correctBox: {
    padding: spacing.md,
    backgroundColor: '#FEF2F2',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  correctText: { fontSize: 15, color: colors.textMuted },
  summaryRow: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', marginBottom: spacing.md },
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

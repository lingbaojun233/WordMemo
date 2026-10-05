import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { dueWords } from '../../../lib/srs';
import { colors, radius, spacing } from '../../../lib/theme';
import { Word } from '../../../lib/types';
import { Button, EmptyState } from '../../../components/ui';

type Phase = 'intro' | 'study' | 'done';
type SubPhase = 'memorize' | 'choose';

type QuizQ = {
  id: string;
  term: string;
  correct: string;
  options: string[];
  derivatives?: { term: string; meaning: string }[];
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 每个单词生成一道四选一「选对释义」题
function buildQuiz(words: Word[]): QuizQ[] {
  return words.map((w, i) => {
    const others = words.filter((_, j) => j !== i).map((x) => x.meaning);
    const distractors = shuffle(others).slice(0, 3);
    const options = shuffle(
      [w.meaning, ...distractors].filter((v, idx, arr) => arr.indexOf(v) === idx)
    );
    return { id: w.id, term: w.term, correct: w.meaning, options, derivatives: w.derivatives };
  });
}

export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, reviewWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [phase, setPhase] = useState<Phase>('intro');
  const [quiz, setQuiz] = useState<QuizQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [subPhase, setSubPhase] = useState<SubPhase>('memorize');
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

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
    const qs = buildQuiz(words);
    setQuiz(qs);
    setIdx(0);
    setSubPhase('memorize');
    setPicked(null);
    setCorrectCount(0);
    setPhase('study');
  };

  const answer = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    const q = quiz[idx];
    const isCorrect = opt === q.correct;
    if (isCorrect) setCorrectCount((c) => c + 1);
    // 只有选对释义才提升记忆等级
    reviewWord(book.id, q.id, isCorrect ? 'good' : 'again');
    if (isCorrect) {
      // 选对：短暂显示后自动进入下一个
      setTimeout(() => next(), 800);
    }
    // 选错：不自动前进，等待用户按「下一个」
  };

  const next = () => {
    if (idx + 1 < quiz.length) {
      setIdx(idx + 1);
      setSubPhase('memorize');
      setPicked(null);
    } else {
      setPhase('done');
    }
  };

  // ---------- 开始页 ----------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '背诵（选释义）' }} />
        <View style={styles.center}>
          <View style={styles.heroIcon}>
            <Ionicons name="albums" size={40} color={colors.primary} />
          </View>
          {due.length > 0 ? (
            <>
              <Text style={styles.title}>今日待复习 {due.length} 个</Text>
              <Text style={styles.desc}>
                先背诵单词释义，再选择正确释义。选对提升记忆等级，选错降级
              </Text>
              <Button label="开始复习" icon="play" onPress={() => start('due')} style={{ alignSelf: 'stretch' }} />
            </>
          ) : book.words.length > 0 ? (
            <>
              <Text style={styles.title}>今日复习已完成 🎉</Text>
              <Text style={styles.desc}>没有到期的单词，可以复习全部单词</Text>
              <Button label="复习全部单词" icon="refresh" onPress={() => start('all')} style={{ alignSelf: 'stretch' }} />
            </>
          ) : (
            <EmptyState icon="book-outline" title="单词本为空" description="请先添加或导入单词" />
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
        <Stack.Screen options={{ title: '背诵（选释义）' }} />
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
          <Button label="再来一轮" variant="outline" icon="refresh" onPress={() => start(due.length > 0 ? 'due' : 'all')} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  // ---------- 答题页 ----------
  const q = quiz[idx];
  if (!q) return null;
  const progress = (idx + 1) / quiz.length;
  const isWrong = picked !== null && picked !== q.correct;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '背诵（选释义）' }} />

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {idx + 1} / {quiz.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.studyContent}>
        {subPhase === 'memorize' ? (
          <>
            {/* 先自行背诵 */}
            <View style={styles.wordCard}>
              <Text style={styles.questionLabel}>先记住这个单词</Text>
              <Text style={styles.word}>{q.term}</Text>
              <View style={styles.divider} />
              <Text style={styles.memorizeMeaning}>{q.correct}</Text>
            </View>

            {q.derivatives && q.derivatives.length > 0 ? (
              <View style={styles.derivBox}>
                <Text style={styles.derivTitle}>派生词</Text>
                {q.derivatives.map((d) => (
                  <Text key={d.term} style={styles.derivItem}>
                    <Text style={styles.derivTerm}>{d.term}</Text>  {d.meaning}
                  </Text>
                ))}
              </View>
            ) : null}

            <Button label="我记住了，开始选择" icon="arrow-forward" onPress={() => setSubPhase('choose')} />
          </>
        ) : (
          <>
            {/* 再选择正确释义 */}
            <View style={styles.wordCard}>
              <Text style={styles.questionLabel}>选择正确释义</Text>
              <Text style={styles.word}>{q.term}</Text>
            </View>

            <View style={styles.options}>
              {q.options.map((opt) => {
                const isCorrect = opt === q.correct;
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

            {isWrong ? (
              <>
                <View style={styles.correctBox}>
                  <Text style={styles.correctText}>
                    正确释义：<Text style={{ fontWeight: '800', color: colors.text }}>{q.correct}</Text>
                  </Text>
                </View>
                <Button label="下一个" icon="arrow-forward" onPress={next} />
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
  desc: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.md },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
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

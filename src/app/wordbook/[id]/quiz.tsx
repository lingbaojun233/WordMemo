import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { dueWords } from '../../../lib/srs';
import { colors, radius, spacing } from '../../../lib/theme';
import { Word } from '../../../lib/types';
import { Button, EmptyState } from '../../../components/ui';

type Phase = 'intro' | 'quiz' | 'done';

export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, reviewWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [phase, setPhase] = useState<Phase>('intro');
  const [deck, setDeck] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong' | 'skipped'>('idle');
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

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
    // 测验时打乱顺序，最多 30 个
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 30);
    setDeck(shuffled);
    setTotal(shuffled.length);
    setAnswer('');
    setFeedback('idle');
    setCorrectCount(0);
    setWrongCount(0);
    setPhase(shuffled.length > 0 ? 'quiz' : 'done');
  };

  const submit = () => {
    const current = deck[0];
    if (!current || feedback !== 'idle') return;
    const ok = answer.trim().toLowerCase() === current.term.toLowerCase();
    reviewWord(book.id, current.id, ok ? 'good' : 'again');
    if (ok) {
      setCorrectCount((c) => c + 1);
      setFeedback('correct');
    } else {
      setWrongCount((c) => c + 1);
      setFeedback('wrong');
    }
  };

  const reveal = () => {
    const current = deck[0];
    if (!current || feedback !== 'idle') return;
    reviewWord(book.id, current.id, 'again');
    setWrongCount((c) => c + 1);
    setFeedback('skipped');
  };

  const next = () => {
    setDeck((q) => q.slice(1));
    setAnswer('');
    setFeedback('idle');
    if (deck.length === 1) setPhase('done');
  };

  // ---------- 开始页 ----------
  if (phase === 'intro') {
    const count = due.length > 0 ? due.length : book.words.length;
    return (
      <View style={styles.container}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="create" size={40} color={colors.accent} />
          </View>
          <Text style={styles.introTitle}>拼写测验</Text>
          <Text style={styles.introDesc}>
            根据中文释义拼写英文单词，共 {count} 题
          </Text>
          <Button
            label="开始测验"
            icon="play"
            onPress={() => start(due.length > 0 ? 'due' : 'all')}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      </View>
    );
  }

  // ---------- 完成页 ----------
  if (phase === 'done') {
    const acc =
      correctCount + wrongCount > 0
        ? Math.round((correctCount / (correctCount + wrongCount)) * 100)
        : 0;
    return (
      <View style={styles.container}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="trophy" size={40} color={colors.success} />
          </View>
          <Text style={styles.introTitle}>测验完成</Text>
          <Text style={styles.introDesc}>共 {total} 题</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{correctCount}</Text>
              <Text style={styles.summaryLabel}>答对</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>{wrongCount}</Text>
              <Text style={styles.summaryLabel}>答错</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{acc}%</Text>
              <Text style={styles.summaryLabel}>正确率</Text>
            </View>
          </View>

          <Button
            label="返回单词本"
            icon="arrow-back"
            onPress={() => router.back()}
            style={{ alignSelf: 'stretch' }}
          />
          <Button
            label="再来一轮"
            variant="outline"
            icon="refresh"
            onPress={() => start(due.length > 0 ? 'due' : 'all')}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      </View>
    );
  }

  // ---------- 测验页 ----------
  const current = deck[0];
  if (!current) return null;

  const progress = total > 0 ? (total - deck.length) / total : 0;
  const showAnswer = feedback !== 'idle';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.quizContent} keyboardShouldPersistTaps="handled">
        {/* 进度 */}
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {total - deck.length} / {total}
          </Text>
        </View>

        {/* 题目 */}
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>请拼写对应的英文单词</Text>
          <Text style={styles.questionMeaning}>{current.meaning}</Text>
          {current.example ? (
            <Text style={styles.questionExample}>例句：{current.example}</Text>
          ) : null}
        </View>

        {/* 输入 */}
        <TextInput
          style={[
            styles.input,
            feedback === 'correct' && { borderColor: colors.success },
            (feedback === 'wrong' || feedback === 'skipped') && { borderColor: colors.danger },
          ]}
          placeholder="输入英文单词"
          placeholderTextColor={colors.textLight}
          value={answer}
          onChangeText={setAnswer}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!showAnswer}
          onSubmitEditing={submit}
          returnKeyType="done"
        />

        {/* 反馈 */}
        {showAnswer ? (
          <View style={styles.feedback}>
            {feedback === 'correct' ? (
              <Text style={[styles.feedbackText, { color: colors.success }]}>
                ✓ 回答正确
              </Text>
            ) : (
              <Text style={[styles.feedbackText, { color: colors.danger }]}>
                {feedback === 'skipped' ? '已查看答案' : '✗ 回答错误'}
              </Text>
            )}
            <Text style={styles.answerText}>
              正确答案：<Text style={{ fontWeight: '800', color: colors.text }}>{current.term}</Text>
              {current.phonetic ? `  ${current.phonetic}` : ''}
            </Text>
          </View>
        ) : null}

        {/* 按钮 */}
        {!showAnswer ? (
          <View style={styles.btnRow}>
            <Button
              label="不会"
              variant="ghost"
              icon="eye"
              onPress={reveal}
              style={{ flex: 1 }}
            />
            <Button
              label="提交"
              onPress={submit}
              disabled={!answer.trim()}
              style={{ flex: 2 }}
            />
          </View>
        ) : (
          <Button label="下一题" icon="arrow-forward" onPress={next} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  introTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  introDesc: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  quizContent: { padding: spacing.md, paddingBottom: 40 },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  progressText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  questionLabel: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  questionMeaning: { fontSize: 24, fontWeight: '700', color: colors.text, lineHeight: 34 },
  questionExample: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.md,
    lineHeight: 21,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 20,
    color: colors.text,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  feedback: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  feedbackText: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  answerText: { fontSize: 15, color: colors.textMuted },
  btnRow: { flexDirection: 'row', gap: spacing.md },
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

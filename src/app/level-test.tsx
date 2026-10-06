import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEVEL_SAMPLES, LevelKey, LevelWord, VOCAB_SIZES } from '../data/levelTestWords';
import { loadStudySettings, saveStudySettings, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from '../components/ui';

type Phase = 'intro' | 'test' | 'result';
type Direction = 'e2c' | 'c2e';

type QuizQ = {
  direction: Direction;
  prompt: string; // 题干（英文单词 或 中文释义）
  correct: string; // 正确选项
  options: string[]; // 8 个选项
};

type LevelResult = {
  level: LevelKey;
  label: string;
  correct: number;
  total: number;
  passed: boolean;
};

// 各等级对应的累计词汇量（大致估计，用于结果反馈）在 levelTestWords.ts 中定义并导入

const INITIAL_QUESTIONS = 10; // 初始 10 题
const MAX_QUESTIONS = 50; // 每级最多 50 题
const PASS_RATE = 0.8; // 80% 通过

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 随机出一道题：英译中 / 中译英，8 个选项，干扰项优先同词性。
// queue 为当前级别尚未用于出题的词（按序取第一个作为本题目标词），确保同一级别不重复出同一个词。
function makeQuestion(queue: LevelWord[], allWords: LevelWord[]): QuizQ {
  const target = queue[0];
  const pool = allWords.filter((w) => w.t !== target.t);
  const samePos = pool.filter((w) => w.p === target.p);
  const candidates = shuffle([...samePos, ...shuffle(pool)]);
  const distractors: LevelWord[] = [];
  const usedMeanings = new Set([target.m]);
  for (const w of candidates) {
    if (distractors.length >= 7) break;
    if (usedMeanings.has(w.m)) continue;
    usedMeanings.add(w.m);
    distractors.push(w);
  }

  const e2c = Math.random() < 0.5;
  if (e2c) {
    const options = shuffle([target.m, ...distractors.map((d) => d.m)]);
    return { direction: 'e2c', prompt: target.t, correct: target.m, options };
  }
  const options = shuffle([target.t, ...distractors.map((d) => d.t)]);
  return { direction: 'c2e', prompt: target.m, correct: target.t, options };
}

export default function LevelTestScreen() {
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');

  const [levelIdx, setLevelIdx] = useState(0);
  const [results, setResults] = useState<LevelResult[]>([]);
  const [queue, setQueue] = useState<LevelWord[]>([]);
  const [question, setQuestion] = useState<QuizQ | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [additional, setAdditional] = useState(false);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const currentSample = LEVEL_SAMPLES[levelIdx];

  // 从队列中取出下一个词出题，并更新队列（确保同一级别不重复出同一个词）
  const askNext = (nextQueue: LevelWord[], allWords: LevelWord[]) => {
    setQuestion(makeQuestion(nextQueue, allWords));
    setQueue(nextQueue.slice(1));
    setPicked(null);
  };

  const start = () => {
    const words = LEVEL_SAMPLES[0].words;
    const q0 = shuffle(words);
    setLevelIdx(0);
    setResults([]);
    setCorrect(0);
    setTotal(0);
    setAdditional(false);
    askNext(q0, words);
    setPhase('test');
  };

  const answer = (opt: string) => {
    if (picked || !question) return;
    setPicked(opt);
    const isCorrect = opt === question.correct;
    const nc = correct + (isCorrect ? 1 : 0);
    const nt = total + 1;
    setCorrect(nc);
    setTotal(nt);

    // 判定下一步
    let action: 'next' | 'pass' | 'fail' | 'additional' = 'next';
    if (!additional) {
      // 初始 10 题：不提前结束，做完 10 题再判定
      if (nt >= INITIAL_QUESTIONS) {
        action = nc / nt >= PASS_RATE ? 'pass' : 'additional';
      }
    } else {
      // 追加测试：达标通过；错误过多则提前失败
      if (nc / nt >= PASS_RATE) {
        action = 'pass';
      } else if (nt - nc > 10 || nt >= MAX_QUESTIONS) {
        action = 'fail';
      }
    }

    setTimeout(() => {
      if (action === 'pass') {
        passLevel(nc, nt);
      } else if (action === 'fail') {
        failLevel(nc, nt);
      } else if (action === 'additional') {
        setAdditional(true);
        askNext(queue, currentSample.words);
      } else {
        askNext(queue, currentSample.words);
      }
    }, 550);
  };

  const passLevel = (nc: number, nt: number) => {
    const sample = LEVEL_SAMPLES[levelIdx];
    const newResults: LevelResult[] = [
      ...results,
      { level: sample.level, label: sample.label, correct: nc, total: nt, passed: true },
    ];
    const nextIdx = levelIdx + 1;
    if (nextIdx < LEVEL_SAMPLES.length) {
      const nextWords = LEVEL_SAMPLES[nextIdx].words;
      const q0 = shuffle(nextWords);
      setLevelIdx(nextIdx);
      setResults(newResults);
      setCorrect(0);
      setTotal(0);
      setAdditional(false);
      askNext(q0, nextWords);
    } else {
      finish(newResults);
    }
  };

  const failLevel = (nc: number, nt: number) => {
    const sample = LEVEL_SAMPLES[levelIdx];
    const newResults: LevelResult[] = [
      ...results,
      { level: sample.level, label: sample.label, correct: nc, total: nt, passed: false },
    ];
    finish(newResults);
  };

  const finish = async (newResults: LevelResult[]) => {
    const passed = newResults.filter((r) => r.passed);
    const highest: LevelKey = passed.length > 0 ? passed[passed.length - 1].level : 'junior';
    if (settings) {
      await saveStudySettings({ ...settings, level: highest });
    }
    setResults(newResults);
    setPhase('result');
  };

  // ---------- 开始页 ----------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '词汇水平测验', headerBackTitle: '返回' }} />
        <View style={styles.center}>
          <View style={styles.heroIcon}>
            <Ionicons name="school-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.title}>词汇水平测验</Text>
          <Text style={styles.desc}>
            分级测试：通过当前级别（正确率 ≥80%）才能进入下一级别。每级先测 10 题，未通过则追加测试（每级最多 50 题）。
          </Text>
          <Text style={styles.descMuted}>题目为英译中/中译英随机，每题 8 个同词性选项</Text>
          <Button label="开始测验" icon="play" onPress={start} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  // ---------- 结果页 ----------
  if (phase === 'result') {
    const passed = results.filter((r) => r.passed);
    const highest: LevelKey = passed.length > 0 ? passed[passed.length - 1].level : 'junior';
    const hasPassed = passed.length > 0;
    const vocab = hasPassed ? VOCAB_SIZES[highest] : 0;
    const last = results[results.length - 1];
    const lastPct = last ? Math.round((last.correct / last.total) * 100) : 0;

    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '词汇水平测验', headerBackTitle: '返回' }} />
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <View style={[styles.heroIcon, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="trophy" size={40} color={colors.success} />
          </View>
          <Text style={styles.title}>测验完成</Text>
          <Text style={styles.vocabText}>
            {hasPassed ? `约 ${vocab} 词` : '不足初中水平'}
          </Text>
          {last ? (
            <Text style={styles.desc}>
              {last.label} {last.correct}/{last.total}（{lastPct}%）
            </Text>
          ) : null}

          <View style={styles.rateCard}>
            <Text style={styles.rateTitle}>各级结果（≥80% 通过）</Text>
            {results.map((r) => {
              const pct = Math.round((r.correct / r.total) * 100);
              return (
                <View key={r.level} style={styles.rateRow}>
                  <Text style={styles.rateLabel}>{r.label}</Text>
                  <View style={styles.rateTrack}>
                    <View
                      style={[
                        styles.rateFill,
                        {
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: r.passed ? colors.success : colors.warning,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.rateValue, { color: r.passed ? colors.success : colors.warning }]}>
                    {r.correct}/{r.total}
                  </Text>
                  <Text style={styles.rateMark}>{r.passed ? '✓' : '✗'}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.descMuted}>
            系统将根据该水平生成你能读懂的短文（文中除目标生词外，均使用该水平及以下的词汇）。
          </Text>
          <Button label="完成" icon="checkmark" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </ScrollView>
      </View>
    );
  }

  // ---------- 测验页 ----------
  if (!question) return null;
  const pct = Math.min(100, Math.round((correct / Math.max(1, total)) * 100));
  const isWrong = picked !== null && picked !== question.correct;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '词汇水平测验', headerBackTitle: '返回' }} />

      <View style={styles.progressWrap}>
        <Text style={styles.levelChip}>{currentSample.label}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {correct}/{total}
          {additional ? '（追加）' : ''}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.testScroll}>
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>
            {question.direction === 'e2c' ? '请选择正确的中文释义' : '请选择正确的英文单词'}
          </Text>
          <Text style={styles.questionPrompt}>{question.prompt}</Text>
        </View>

        <View style={styles.options}>
          {question.options.map((opt) => {
            const isCorrect = opt === question.correct;
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
                textStyle={{ textAlign: 'left', fontSize: 15 }}
              />
            );
          })}
        </View>

        {isWrong ? (
          <Text style={styles.correctHint}>正确选项：{question.correct}</Text>
        ) : null}
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  desc: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  descMuted: { fontSize: 12, color: colors.textLight, textAlign: 'center', lineHeight: 18, marginBottom: spacing.sm },
  vocabText: { fontSize: 40, fontWeight: '800', color: colors.primary },
  resultScroll: { alignItems: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  rateCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rateTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 2 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rateLabel: { width: 40, fontSize: 13, color: colors.text },
  rateTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  rateFill: { height: 8, borderRadius: 4 },
  rateValue: { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  rateMark: { width: 16, fontSize: 13, fontWeight: '700', textAlign: 'center', color: colors.textMuted },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  levelChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    overflow: 'hidden',
  },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.success },
  progressText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  testScroll: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  questionLabel: { fontSize: 13, color: colors.textMuted },
  questionPrompt: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: spacing.sm, textAlign: 'center', lineHeight: 32 },
  options: { gap: spacing.sm },
  correctHint: { fontSize: 14, color: colors.success, textAlign: 'center' },
});

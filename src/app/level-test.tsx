import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEVEL_ORDER, LEVEL_SAMPLES, LevelKey, LevelSample } from '../data/levelTestWords';
import { loadStudySettings, saveStudySettings, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from '../components/ui';

type QuizQ = {
  term: string;
  correct: string;
  options: string[];
  level: LevelKey;
  label: string;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 每个级别随机抽词，生成四选一题目
function buildQuiz(sample: LevelSample, count: number): QuizQ[] {
  const words = shuffle(sample.words).slice(0, count);
  return words.map((w) => {
    const others = sample.words.filter((x) => x.t !== w.t).map((x) => x.m);
    const distractors = shuffle(others).slice(0, 3);
    const options = shuffle(
      [w.m, ...distractors].filter((v, i, a) => a.indexOf(v) === i)
    );
    return { term: w.t, correct: w.m, options, level: sample.level, label: sample.label };
  });
}

function estimateLevel(questions: QuizQ[], answers: boolean[]): LevelKey {
  const total = new Map<LevelKey, number>();
  const correct = new Map<LevelKey, number>();
  questions.forEach((q, i) => {
    total.set(q.level, (total.get(q.level) ?? 0) + 1);
    if (answers[i]) correct.set(q.level, (correct.get(q.level) ?? 0) + 1);
  });
  // 逐级判断：某级答对率达到 70% 视为「掌握」，一旦某级不达标就不再考虑更高（更难）的级别，
  // 避免靠蒙对把水平高估到专八/GRE。
  let level: LevelKey = 'junior';
  for (const key of LEVEL_ORDER) {
    const t = total.get(key) ?? 0;
    const c = correct.get(key) ?? 0;
    if (t > 0 && c / t >= 0.7) {
      level = key;
    } else {
      break;
    }
  }
  return level;
}

type LevelRate = { level: LevelKey; label: string; correct: number; total: number; rate: number };

function computeRates(questions: QuizQ[], answers: boolean[]): LevelRate[] {
  return LEVEL_SAMPLES.map((s) => {
    let total = 0;
    let correct = 0;
    questions.forEach((q, i) => {
      if (q.level === s.level) {
        total++;
        if (answers[i]) correct++;
      }
    });
    return { level: s.level, label: s.label, correct, total, rate: total > 0 ? correct / total : 0 };
  });
}

export default function LevelTestScreen() {
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [phase, setPhase] = useState<'intro' | 'test' | 'result'>('intro');
  const [questions, setQuestions] = useState<QuizQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [result, setResult] = useState<LevelKey | null>(null);
  const [rates, setRates] = useState<LevelRate[]>([]);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const start = () => {
    const qs = LEVEL_SAMPLES.flatMap((s) => buildQuiz(s, 10));
    setQuestions(qs);
    setIdx(0);
    setPicked(null);
    setAnswers([]);
    setPhase('test');
  };

  const answer = (opt: string) => {
    if (picked) return;
    const q = questions[idx];
    const isCorrect = opt === q.correct;
    setPicked(opt);
    const finalAnswers = [...answers, isCorrect];
    setAnswers(finalAnswers);
    setTimeout(() => {
      if (idx + 1 < questions.length) {
        setIdx(idx + 1);
        setPicked(null);
      } else {
        finish(finalAnswers);
      }
    }, 650);
  };

  const finish = async (finalAnswers: boolean[]) => {
    const level = estimateLevel(questions, finalAnswers);
    setResult(level);
    setRates(computeRates(questions, finalAnswers));
    setPhase('result');
    if (settings) {
      await saveStudySettings({ ...settings, level });
    }
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
            从初中到 GRE 共 7 个级别，每个级别随机 10 词、共 70 题。选择单词的正确释义，答对才算认识该词。
          </Text>
          <Text style={styles.descMuted}>预计用时 5 分钟，测完自动估测你的词汇水平</Text>
          <Button label="开始测验" icon="play" onPress={start} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  // ---------- 结果页 ----------
  if (phase === 'result') {
    const label = LEVEL_SAMPLES.find((s) => s.level === result)?.label ?? '';
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '词汇水平测验', headerBackTitle: '返回' }} />
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <View style={[styles.heroIcon, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="trophy" size={40} color={colors.success} />
          </View>
          <Text style={styles.title}>测验完成</Text>
          <Text style={styles.desc}>估测你的词汇水平为</Text>
          <Text style={styles.resultLevel}>{label}</Text>

          <View style={styles.rateCard}>
            <Text style={styles.rateTitle}>各级答对情况（≥70% 视为掌握）</Text>
            {rates.map((r) => {
              const pct = Math.round(r.rate * 100);
              const reached = r.rate >= 0.7;
              return (
                <View key={r.level} style={styles.rateRow}>
                  <Text style={styles.rateLabel}>{r.label}</Text>
                  <View style={styles.rateTrack}>
                    <View
                      style={[
                        styles.rateFill,
                        { width: `${pct}%`, backgroundColor: reached ? colors.success : colors.warning },
                      ]}
                    />
                  </View>
                  <Text style={[styles.rateValue, { color: reached ? colors.success : colors.textMuted }]}>
                    {r.correct}/{r.total}
                  </Text>
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
  const q = questions[idx];
  if (!q) return null;
  const progress = (idx + 1) / questions.length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '词汇水平测验', headerBackTitle: '返回' }} />

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {idx + 1} / {questions.length}
        </Text>
      </View>

      <View style={styles.testBody}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{q.label}词汇</Text>
        </View>
        <Text style={styles.questionLabel}>请选择「{q.term}」的正确释义</Text>
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
  descMuted: { fontSize: 12, color: colors.textLight, textAlign: 'center', lineHeight: 18 },
  resultLevel: { fontSize: 40, fontWeight: '800', color: colors.primary },
  resultScroll: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 40,
  },
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
  rateTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  rateFill: { height: 8, borderRadius: 4 },
  rateValue: { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right' },
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
  testBody: { flex: 1, padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  levelBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  levelBadgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  questionLabel: { fontSize: 20, fontWeight: '700', color: colors.text, marginVertical: spacing.sm, textAlign: 'center' },
});

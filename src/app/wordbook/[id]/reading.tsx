import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { generatePassage, GeneratedPassage, parsePassage, PassageSegment } from '../../../lib/ai';
import { dueWords } from '../../../lib/srs';
import { loadStudySettings, StudySettings } from '../../../lib/studySettings';
import { colors, radius, spacing } from '../../../lib/theme';
import { Word } from '../../../lib/types';
import { Button } from '../../../components/ui';
import { LEVEL_SAMPLES } from '../../../data/levelTestWords';

type Phase = 'intro' | 'generating' | 'reading' | 'test' | 'result';

type QuizQuestion = { term: string; correct: string; options: string[] };

function selectTargetWords(book: { words: Word[] }, count: number): Word[] {
  const newWords = book.words.filter((w) => w.box === 0 && !w.lastReviewedAt);
  const reviewDue = dueWords(book.words).filter((w) => w.box > 0 || w.lastReviewedAt);
  const others = book.words.filter((w) => !newWords.includes(w) && !reviewDue.includes(w));
  return [...newWords, ...reviewDue, ...others].slice(0, count);
}

function chunkEvenly<T>(arr: T[], count: number): T[][] {
  if (count <= 0 || arr.length === 0) return [];
  const size = Math.ceil(arr.length / count);
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuiz(words: { term: string; meaning: string }[]): QuizQuestion[] {
  return words.map((w, i) => {
    const others = words.filter((_, j) => j !== i).map((x) => x.meaning);
    const distractors = shuffle(others).slice(0, 3);
    const options = shuffle([w.meaning, ...distractors].filter((v, idx, arr) => arr.indexOf(v) === idx));
    return { term: w.term, correct: w.meaning, options };
  });
}

export default function ReadingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, reviewWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState(0);

  const [targetWords, setTargetWords] = useState<Word[]>([]);
  const [passages, setPassages] = useState<GeneratedPassage[]>([]);
  const [passageIdx, setPassageIdx] = useState(0);
  const [selected, setSelected] = useState<PassageSegment | null>(null);

  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  if (!book) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>单词本不存在</Text>
      </View>
    );
  }

  const levelLabel = settings?.level
    ? LEVEL_SAMPLES.find((s) => s.level === settings.level)?.label ?? '未测验'
    : '未测验';

  const wordsPerPassage = settings
    ? Math.max(1, Math.ceil(settings.dailyWords / settings.dailyPassages))
    : 10;

  const start = async () => {
    if (!settings) return;
    if (!settings.aiApiKey) {
      setError('请先在「学习设置」中填写 AI API Key');
      return;
    }
    const words = selectTargetWords(book, settings.dailyWords);
    if (words.length === 0) {
      setError('该单词本暂无单词，请先导入或添加单词');
      return;
    }
    setError(null);
    setTargetWords(words);
    setPhase('generating');

    const chunks = chunkEvenly(words, settings.dailyPassages);
    const level = settings.level ?? 'senior'; // 未测验时默认按高中水平生成
    const generated: GeneratedPassage[] = [];
    for (let i = 0; i < chunks.length; i++) {
      setGenProgress(i);
      try {
        const p = await generatePassage({
          apiKey: settings.aiApiKey,
          baseUrl: settings.aiBaseUrl,
          model: settings.aiModel,
          targetWords: chunks[i].map((w) => ({ term: w.term, meaning: w.meaning })),
          readerLevel: level,
        });
        generated.push(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('intro');
        return;
      }
    }
    setPassages(generated);
    setPassageIdx(0);
    setPhase('reading');
  };

  const beginTest = () => {
    setQuiz(buildQuiz(targetWords.map((w) => ({ term: w.term, meaning: w.meaning }))));
    setQuizIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setPhase('test');
  };

  const answerQuiz = (option: string) => {
    if (picked) return;
    setPicked(option);
    const q = quiz[quizIdx];
    const isCorrect = option === q.correct;
    if (isCorrect) setCorrectCount((c) => c + 1);
    // 更新记忆进度
    const w = targetWords.find((x) => x.term.toLowerCase() === q.term.toLowerCase());
    if (w) reviewWord(book.id, w.id, isCorrect ? 'good' : 'again');
  };

  const nextQuiz = () => {
    if (quizIdx + 1 < quiz.length) {
      setQuizIdx(quizIdx + 1);
      setPicked(null);
    } else {
      setPhase('result');
    }
  };

  // ---------- 各阶段渲染 ----------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 短文阅读', headerBackTitle: '返回' }} />
        <View style={styles.center}>
          <View style={styles.heroIcon}>
            <Ionicons name="newspaper-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.title}>AI 短文阅读</Text>
          <Text style={styles.desc}>
            根据你要背的单词生成主题短文，在阅读中记忆单词，读完后再做测试
          </Text>

          <View style={styles.summaryCard}>
            <SummaryRow label="每天阅读" value={`${settings?.dailyPassages ?? 2} 篇`} />
            <SummaryRow label="每天背诵" value={`${settings?.dailyWords ?? 20} 词`} />
            <SummaryRow label="每篇含" value={`约 ${wordsPerPassage} 个生词`} />
            <SummaryRow label="我的水平" value={levelLabel} />
            <SummaryRow label="本次生词" value={`${Math.min(settings?.dailyWords ?? 20, book.words.length)} 个`} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label="生成短文" icon="sparkles" onPress={start} style={{ alignSelf: 'stretch' }} />
          <Button
            label="未测水平？先做词汇测验"
            variant="ghost"
            icon="clipboard-outline"
            onPress={() => router.push('/level-test')}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      </View>
    );
  }

  if (phase === 'generating') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 短文阅读', headerBackTitle: '返回' }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.generatingText}>
            正在生成第 {genProgress + 1} 篇短文…
          </Text>
          <Text style={styles.generatingHint}>AI 正在为你撰写包含目标单词的短文</Text>
        </View>
      </View>
    );
  }

  if (phase === 'reading') {
    const p = passages[passageIdx];
    if (!p) return null;
    const glossary = new Map(p.glossary.map((g) => [g.word, g.meaning]));
    const segments = parsePassage(p.passage, glossary);
    const isLast = passageIdx + 1 >= passages.length;

    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: `短文 ${passageIdx + 1}/${passages.length}`, headerBackTitle: '返回' }} />

        <ScrollView contentContainerStyle={styles.readingContent}>
          <Text style={styles.passageTitle}>{p.title}</Text>
          <Text style={styles.passageText}>
            {segments.map((seg, i) =>
              seg.term ? (
                <Text
                  key={i}
                  style={[
                    styles.highlight,
                    selected?.term === seg.term && styles.highlightActive,
                  ]}
                  onPress={() => setSelected(selected?.term === seg.term ? null : seg)}
                >
                  {seg.text}
                </Text>
              ) : (
                <Text key={i}>{seg.text}</Text>
              )
            )}
          </Text>
          <Text style={styles.tapHint}>点击高亮单词查看释义</Text>
        </ScrollView>

        {/* 底部释义栏 */}
        {selected ? (
          <View style={styles.meaningBar}>
            <Text style={styles.meaningTerm}>{selected.text}</Text>
            <Text style={styles.meaningText}>{selected.meaning || '（释义缺失）'}</Text>
          </View>
        ) : null}

        <View style={styles.bottomBtn}>
          <Button
            label={isLast ? '开始测试' : '下一篇'}
            icon={isLast ? 'create' : 'arrow-forward'}
            onPress={() => {
              if (isLast) {
                beginTest();
              } else {
                setPassageIdx(passageIdx + 1);
                setSelected(null);
              }
            }}
          />
        </View>
      </View>
    );
  }

  if (phase === 'test') {
    const q = quiz[quizIdx];
    if (!q) return null;
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '阅读测试', headerBackTitle: '返回' }} />
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((quizIdx + 1) / quiz.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{quizIdx + 1} / {quiz.length}</Text>
        </View>

        <View style={styles.testBody}>
          <Text style={styles.testLabel}>请选择「{q.term}」的正确释义</Text>
          {q.options.map((opt) => {
            const isCorrect = opt === q.correct;
            const isPicked = picked === opt;
            let style = styles.option;
            if (picked) {
              if (isCorrect) style = { ...styles.option, ...styles.optionCorrect };
              else if (isPicked) style = { ...styles.option, ...styles.optionWrong };
            }
            return (
              <Button
                key={opt}
                label={opt}
                variant={picked ? 'ghost' : 'outline'}
                onPress={() => answerQuiz(opt)}
                disabled={picked !== null}
                style={{ ...style, alignSelf: 'stretch' }}
                textStyle={{ ...(picked && (isCorrect ? { color: colors.success } : isPicked ? { color: colors.danger } : {})) }}
              />
            );
          })}
        </View>

        {picked ? (
          <View style={styles.bottomBtn}>
            <Button
              label={quizIdx + 1 >= quiz.length ? '查看结果' : '下一题'}
              icon="arrow-forward"
              onPress={nextQuiz}
            />
          </View>
        ) : null}
      </View>
    );
  }

  // ---------- 结果页 ----------
  const accuracy = quiz.length > 0 ? Math.round((correctCount / quiz.length) * 100) : 0;
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '阅读测试', headerBackTitle: '返回' }} />
      <View style={styles.center}>
        <View style={[styles.heroIcon, { backgroundColor: '#D1FAE5' }]}>
          <Ionicons name="checkmark-done" size={40} color={colors.success} />
        </View>
        <Text style={styles.title}>今日阅读完成</Text>
        <Text style={styles.desc}>
          阅读了 {passages.length} 篇短文，测试 {quiz.length} 个单词
        </Text>
        <View style={styles.summaryCard}>
          <SummaryRow label="答对" value={`${correctCount} 词`} />
          <SummaryRow label="正确率" value={`${accuracy}%`} />
        </View>
        <Button label="完成" icon="checkmark" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
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
  summaryCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: colors.textMuted },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  generatingText: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  generatingHint: { fontSize: 13, color: colors.textMuted },
  readingContent: { padding: spacing.lg, paddingBottom: 40 },
  passageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.lg, textAlign: 'center' },
  passageText: { fontSize: 18, color: colors.text, lineHeight: 32 },
  highlight: {
    color: colors.primary,
    fontWeight: '700',
    backgroundColor: colors.primaryLight,
    borderRadius: 4,
  },
  highlightActive: { backgroundColor: '#C7D2FE', textDecorationLine: 'underline' },
  tapHint: { fontSize: 12, color: colors.textLight, marginTop: spacing.lg, textAlign: 'center' },
  meaningBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  meaningTerm: { fontSize: 16, fontWeight: '800', color: colors.primary },
  meaningText: { fontSize: 15, color: colors.text, marginTop: 2 },
  bottomBtn: { padding: spacing.md },
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
  testBody: { flex: 1, padding: spacing.lg, gap: spacing.md },
  testLabel: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  option: { borderRadius: radius.lg },
  optionCorrect: { borderWidth: 2, borderColor: colors.success, backgroundColor: '#F0FDF4' },
  optionWrong: { borderWidth: 2, borderColor: colors.danger, backgroundColor: '#FEF2F2' },
});

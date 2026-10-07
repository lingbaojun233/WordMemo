import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { buildQuiz, QuizQuestion } from '../../../lib/quiz';
import {
  AiConfig,
  generatePassage,
  GeneratedPassage,
  getAiConfig,
  parsePassage,
  PassageSegment,
} from '../../../lib/ai';
import { getDeviceModelInfo } from '../../../lib/localModel';
import { loadStudySettings, StudySettings } from '../../../lib/studySettings';
import {
  clearReadingSession,
  loadReadingSession,
  saveReadingSession,
} from '../../../lib/readingSession';
import { colors, radius, spacing } from '../../../lib/theme';
import { Word } from '../../../lib/types';
import { shuffle } from '../../../lib/utils';
import { dailyPlan } from '../../../lib/goal';
import { Button } from '../../../components/ui';
import { LEVEL_SAMPLES } from '../../../data/levelTestWords';

type Phase = 'intro' | 'reading' | 'test' | 'result';

export default function ReadingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, reviewWord, currentUser } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [targetWords, setTargetWords] = useState<Word[]>([]);
  const [passages, setPassages] = useState<(GeneratedPassage | null)[]>([]);
  const [passageIdx, setPassageIdx] = useState(0);
  const [selected, setSelected] = useState<PassageSegment | null>(null);

  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  // 会话关键信息与分篇（用 ref 供异步生成时读取，避免闭包过期）
  const sessionKeyRef = useRef<{ userId: string; bookId: string } | null>(null);
  const chunkListRef = useRef<{ term: string; meaning: string }[][]>([]);
  const passageIdxRef = useRef(0);
  const restoredRef = useRef(false);
  // 并发闸门：恢复上次会话 与 用户点「开始阅读」可能同时触发生成，
  // 而对同一个本地模型上下文并发推理会让原生层直接抛异常
  const generatingRef = useRef(false);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  useEffect(() => {
    passageIdxRef.current = passageIdx;
  }, [passageIdx]);

  // 今日学习计划（与「学习」Tab 同一套口径：今日目标 / 今天已学 / 剩余新词）
  const daily = useMemo(() => {
    if (!settings) return null;
    return dailyPlan({ book: book ?? null, books: wordbooks, settings });
  }, [book, settings, wordbooks]);

  const remaining = daily?.remaining ?? 0;

  // 本次要学的新词（box 0）
  const targetCandidates = useMemo(() => {
    if (!book || !settings || remaining <= 0) return [];
    const newWords = book.words.filter((w) => w.box === 0);
    const ordered = settings.pickMode === 'random' ? shuffle(newWords) : newWords;
    return ordered.slice(0, remaining);
  }, [book, settings, remaining]);

  // 分篇：每篇 wordsPerPassage 个新词
  const chunkCount = useMemo(() => {
    const per = Math.max(1, settings?.wordsPerPassage ?? 8);
    return Math.ceil(targetCandidates.length / per);
  }, [targetCandidates, settings]);

  const persist = (words: Word[], chunks: { term: string; meaning: string }[][], psgs: (GeneratedPassage | null)[], idx: number) => {
    const key = sessionKeyRef.current;
    if (!key) return;
    saveReadingSession(key.userId, key.bookId, {
      targetWords: words,
      chunks,
      passages: psgs,
      passageIdx: idx,
    }).catch(() => {});
  };

  // 逐篇生成（跳过已生成的），每生成一篇即保存；单篇失败则跳过继续
  const generateAll = async (
    cfg: AiConfig,
    chunks: { term: string; meaning: string }[][],
    words: Word[],
    level: string,
    initial: (GeneratedPassage | null)[]
  ) => {
    if (generatingRef.current) return; // 已有一轮在跑，避免并发调用本地模型
    generatingRef.current = true;
    const base = initial.slice();
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (base[i]) continue;
        try {
          const p = await generatePassage({
            config: cfg,
            targetWords: chunks[i],
            readerLevel: level,
          });
          base[i] = p;
          setPassages([...base]);
          persist(words, chunks, [...base], passageIdxRef.current);
        } catch (e) {
          // 单篇失败：记录错误并展示，继续尝试下一篇
          setGenError(e instanceof Error ? e.message : String(e));
        }
      }
    } finally {
      generatingRef.current = false;
    }
  };

  // 进入时恢复未完成的会话
  useEffect(() => {
    if (!book || !currentUser || !settings || restoredRef.current) return;
    restoredRef.current = true;
    const key = { userId: currentUser.id, bookId: book.id };
    sessionKeyRef.current = key;
    loadReadingSession(key.userId, key.bookId).then((s) => {
      if (s && s.targetWords.length > 0 && s.passages.length > 0) {
        setTargetWords(s.targetWords);
        setPassages(s.passages);
        setPassageIdx(Math.min(s.passageIdx, s.passages.length - 1));
        chunkListRef.current = s.chunks;
        setPhase('reading');
        generateAll(getAiConfig(settings), s.chunks, s.targetWords, settings.level ?? 'senior', s.passages);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, currentUser?.id, settings]);

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

  const start = async () => {
    if (!settings || !currentUser) return;
    const cfg = getAiConfig(settings);
    if (cfg.provider === 'online' && !cfg.apiKey) {
      setError('请先在「学习设置」中填写联网模型 API Key');
      return;
    }
    if (cfg.provider === 'device') {
      const info = await getDeviceModelInfo(cfg.modelName);
      if (!info.downloaded) {
        setError('设备端模型尚未下载，请先到「学习设置」中下载模型');
        return;
      }
    }

    const words = targetCandidates;
    if (words.length === 0) {
      setError(
        daily?.empty
          ? '单词本为空，请先添加单词'
          : daily && daily.newWordsLeft === 0
          ? '本词本的新词都学过一遍了，没有新词可用来生成短文'
          : '今日目标已完成，无需再生成短文'
      );
      return;
    }

    const per = Math.max(1, settings.wordsPerPassage ?? 8);
    const chunks: { term: string; meaning: string }[][] = [];
    for (let i = 0; i < words.length; i += per) {
      chunks.push(words.slice(i, i + per).map((w) => ({ term: w.term, meaning: w.meaning })));
    }

    sessionKeyRef.current = { userId: currentUser.id, bookId: book.id };
    chunkListRef.current = chunks;
    setError(null);
    setGenError(null);
    setTargetWords(words);
    setPassages(new Array(chunks.length).fill(null));
    setPassageIdx(0);
    setPhase('reading');

    generateAll(cfg, chunks, words, settings.level ?? 'senior', new Array(chunks.length).fill(null));
  };

  const beginTest = () => {
    setQuiz(buildQuiz(targetWords, book.words));
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
    reviewWord(book.id, q.id, isCorrect ? 'good' : 'again');
    setTimeout(() => {
      if (quizIdx + 1 < quiz.length) {
        setQuizIdx(quizIdx + 1);
        setPicked(null);
      } else {
        const key = sessionKeyRef.current;
        if (key) clearReadingSession(key.userId, key.bookId);
        setPhase('result');
      }
    }, 800);
  };

  // ---------- 开始页 ----------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 写短文，阅读后测验', headerBackTitle: '返回' }} />
        <View style={styles.center}>
          <View style={styles.heroIcon}>
            <Ionicons name="newspaper-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.title}>AI 写短文，阅读后测验</Text>
          <Text style={styles.desc}>
            根据你要背的单词生成主题短文，在阅读中记忆单词，读完后再做测试
          </Text>

          <View style={styles.summaryCard}>
            <SummaryRow label="今日需学习" value={`${remaining} 词`} />
            <SummaryRow label="每篇短文" value={`约 ${settings?.wordsPerPassage ?? 8} 个新词`} />
            <SummaryRow label="共约" value={`${chunkCount} 篇`} />
            <SummaryRow label="我的水平" value={levelLabel} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {remaining > 0 ? (
            <Button label="开始阅读" icon="sparkles" onPress={start} style={{ alignSelf: 'stretch' }} />
          ) : daily?.empty ? (
            <Text style={styles.emptyHint}>单词本为空，请先添加单词</Text>
          ) : daily && daily.newWordsLeft === 0 ? (
            <Text style={styles.emptyHint}>
              本词本的新词都学过一遍了，没有新词可用来生成短文——可以去「复习到期单词」巩固，或换一本单词本
            </Text>
          ) : (
            <Text style={styles.emptyHint}>
              今日目标已完成（今天已学 {daily?.studiedToday ?? 0} 词），可以复习到期单词或休息一下
            </Text>
          )}
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

  // ---------- 阅读页 ----------
  if (phase === 'reading') {
    const p = passages[passageIdx];
    if (!p) {
      return (
        <View style={styles.container}>
          <Stack.Screen options={{ title: 'AI 写短文，阅读后测验', headerBackTitle: '返回' }} />
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.generatingText}>正在生成第 {passageIdx + 1} 篇短文…</Text>
            <Text style={styles.generatingHint}>可稍等片刻，其它短文正在后台生成</Text>
            {genError ? (
              <Text style={styles.errorText}>生成失败：{genError}</Text>
            ) : null}
          </View>
        </View>
      );
    }

    const glossary = new Map(p.glossary.map((g) => [g.word, g.meaning]));
    const segments = parsePassage(p.passage, glossary);
    const isLast = passageIdx + 1 >= passages.length;
    const nextReady = !isLast && passages[passageIdx + 1] != null;

    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{ title: `短文 ${passageIdx + 1}/${passages.length}`, headerBackTitle: '返回' }}
        />

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

        {selected ? (
          <View style={styles.meaningBar}>
            <Text style={styles.meaningTerm}>{selected.text}</Text>
            <Text style={styles.meaningText}>{selected.meaning || '（释义缺失）'}</Text>
          </View>
        ) : null}

        <View style={styles.bottomBtn}>
          <Button
            label={isLast ? '开始测试' : nextReady ? '下一篇' : '生成下一篇中…'}
            icon={isLast ? 'create' : 'arrow-forward'}
            disabled={!isLast && !nextReady}
            onPress={() => {
              if (isLast) {
                beginTest();
              } else if (nextReady) {
                const next = passageIdx + 1;
                setPassageIdx(next);
                setSelected(null);
                persist(targetWords, chunkListRef.current, passages, next);
              }
            }}
          />
        </View>
      </View>
    );
  }

  // ---------- 测试页 ----------
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
  emptyHint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
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

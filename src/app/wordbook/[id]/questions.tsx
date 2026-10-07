import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { getAiConfig, LEVEL_DESC } from '../../../lib/ai';
import { getDeviceModelInfo } from '../../../lib/localModel';
import { dailyPlan } from '../../../lib/goal';
import { loadStudySettings, StudySettings } from '../../../lib/studySettings';
import { colors, radius, spacing } from '../../../lib/theme';
import { Word } from '../../../lib/types';
import { Button, EmptyState } from '../../../components/ui';
import { useAiq } from '../../../lib/aiq/useAiq';
import { generateAdvice, generateAiQuestions } from '../../../lib/aiq/aiClient';
import { errorTypeStats, targetDifficulty, weakTerms } from '../../../lib/aiq/errorProfile';
import { adoptAdvice, buildInjection, layerCounts } from '../../../lib/aiq/promptLibrary';
import { applyAnswer, finishSession, gradeAnswer, unknownResult } from '../../../lib/aiq/session';
import { buildLocalQuestions } from '../../../lib/aiq/localGen';
import {
  ERROR_TYPE_LABEL,
  ErrorType,
  GradeResult,
  NEXT_MODE_LABEL,
  NextMode,
  QUESTION_TYPE_LABEL,
  Question,
} from '../../../lib/aiq/types';
import {
  buildWordGroups,
  difficultyBias,
  EASY_TYPES,
  HARD_TYPES,
  hardQuestionCount,
  QUESTION_TIERS,
  recommendNextMode,
  requiredTier,
  shouldDoHardRound,
} from '../../../lib/aiq/flow';
import { extractBlanks, gradeBlanks } from '../../../lib/aiq/blanks';

type Phase = 'intro' | 'preview' | 'loading' | 'quiz' | 'done';

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()（）\s]+/g, '');
}

/** 从释义开头提取词性缩写（如 "n."、"v."、"adj."），没有则返回空串 */
function extractPos(meaning: string): string {
  const m = meaning.trim().match(/^([a-z]+\.)/i);
  return m ? m[1] : '';
}

const POS_LABEL: Record<string, string> = {
  'n.': '名词',
  'v.': '动词',
  'vt.': '及物动词',
  'vi.': '不及物动词',
  'adj.': '形容词',
  'adv.': '副词',
  'prep.': '介词',
  'conj.': '连词',
  'pron.': '代词',
  'num.': '数词',
  'art.': '冠词',
  'int.': '感叹词',
  'aux.': '助动词',
  'abbr.': '缩写',
};

export default function GuidedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, reviewWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);
  const { state, update, ready } = useAiq();

  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  // 记录本次会话每个单词的答对/答错次数，以及答对过的最高难度档位（用于按掌握难度升级）
  const wordStatsRef = useRef(
    new Map<string, { correct: number; wrong: number; bestTier: number }>()
  );

  const [groups, setGroups] = useState<Word[][]>([]);
  const [groupIdx, setGroupIdx] = useState(0);
  const [round, setRound] = useState<1 | 2>(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [blankAnswers, setBlankAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<GradeResult | null>(null);

  const [round1, setRound1] = useState({ correct: 0, total: 0 });
  const [sessionStart, setSessionStart] = useState(0);

  const [advice, setAdvice] = useState<
    { title: string; detail: string; promptText: string; errorType: ErrorType; tags: string[] } | null
  >(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [nextMode, setNextMode] = useState<NextMode>('mixed');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  if (!book) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 出题' }} />
        <EmptyState icon="alert-circle" title="单词本不存在" />
      </View>
    );
  }
  if (!ready || !state || !settings) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 出题' }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  const config = getAiConfig(settings);
  const layerInfo = layerCounts(state.entries);
  const q: Question | undefined = questions[idx];
  const total = questions.length;

  const start = () => {
    setErrorMsg(null);
    wordStatsRef.current.clear();
    // 先学今日未达标剩余所需的新词数，达标后则复习到期单词
    const daily = dailyPlan({ book, books: wordbooks, settings });
    const gs = buildWordGroups(book.words, daily.remaining, settings.pickMode, book.id);
    if (gs.length === 0) {
      setErrorMsg(
        daily.remaining > 0 ? '今天的新词已学完，暂无新词可学' : '暂无到期单词需要复习'
      );
      return;
    }
    setGroups(gs);
    setGroupIdx(0);
    setRound(1);
    setQuestions([]);
    setIdx(0);
    setRound1({ correct: 0, total: 0 });
    setSessionStart(Date.now());
    setAdvice(null);
    setAdopted(false);
    setNextMode('mixed');
    setPhase('preview');
  };

  const loadHardRound = async (group: Word[]) => {
    // 生成高级题前先确认 AI 可用：联网需 Key，设备端需已下载模型
    if (config.provider === 'online' && !config.apiKey) {
      throw new Error('请先在「学习设置」中填写联网模型 API Key');
    }
    if (config.provider === 'device') {
      const info = await getDeviceModelInfo(config.modelName);
      if (!info.downloaded) {
        throw new Error('设备端模型尚未下载，请先到「学习设置」中下载模型');
      }
    }
    const difficulty = targetDifficulty(settings.level, state.attempts);
    const inject = buildInjection(state.entries, { now: Date.now() });
    const qs = await generateAiQuestions({
      config,
      words: group.map((w) => ({ term: w.term, meaning: w.meaning })),
      types: HARD_TYPES,
      count: hardQuestionCount(group.length),
      difficulty,
      levelDesc: settings.level ? LEVEL_DESC[settings.level] ?? '高中（高考）及以下' : '高中（高考）及以下',
      injection: inject.text,
    });
    setQuestions(qs);
    setRound(2);
    setIdx(0);
    setAnswer('');
    setBlankAnswers([]);
    setPicked(null);
    setFeedback(null);
  };

  const beginGroup = async () => {
    const group = groups[groupIdx] ?? [];
    setErrorMsg(null);
    setPhase('loading');
    try {
      if (state.nextMode === 'hard') {
        await loadHardRound(group);
      } else {
        // 简单题：本地毫秒级（选释义 + 拼写填空，每个词各一题）
        setQuestions(buildLocalQuestions(group, book.words, EASY_TYPES, group.length * 2));
        setRound(1);
        setIdx(0);
        setAnswer('');
        setBlankAnswers([]);
        setPicked(null);
        setFeedback(null);
      }
      setPhase('quiz');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('preview');
    }
  };

  const beginHardRound = async () => {
    const group = groups[groupIdx] ?? [];
    setErrorMsg(null);
    setPhase('loading');
    try {
      await loadHardRound(group);
      setPhase('quiz');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      await finishGroup();
    }
  };

  const submit = async (value: string) => {
    if (!q || grading || feedback) return;
    setGrading(true);
    setErrorMsg(null);
    try {
      let result: GradeResult;
      if (q.type === 'spelling') {
        // 拼写题本地精确判分（毫秒级），保证简单题热身零等待
        const ok = norm(value) === norm(q.correctAnswer);
        result = ok
          ? { isCorrect: true }
          : { isCorrect: false, errorType: 'spelling', reason: `正确拼写：${q.correctAnswer}` };
      } else {
        result = await gradeAnswer({ config, question: q, userAnswer: value });
      }
      setFeedback(result);
      await update(
        applyAnswer({ state, question: q, userAnswer: value, result, group: state.group })
      );
      for (const t of q.targetTerms) {
        const key = t.toLowerCase();
        const cur = wordStatsRef.current.get(key) ?? { correct: 0, wrong: 0, bestTier: 0 };
        if (result.isCorrect) {
          cur.correct += 1;
          cur.bestTier = Math.max(cur.bestTier, QUESTION_TIERS[q.type] ?? 1);
        } else {
          cur.wrong += 1;
        }
        wordStatsRef.current.set(key, cur);
      }
      if (round === 1) {
        setRound1((r) => ({ correct: r.correct + (result.isCorrect ? 1 : 0), total: r.total + 1 }));
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGrading(false);
    }
  };

  /** 多空格语法填空：本地逐空判对错（毫秒级，不调 AI） */
  const submitBlanks = async () => {
    if (!q || grading || feedback) return;
    const blanks = extractBlanks(q.prompt, q.correctAnswer);
    if (!blanks || blanks.length < 2) return;
    const result = gradeBlanks(blanks, blankAnswers);
    setFeedback(result);
    await update(
      applyAnswer({
        state,
        question: q,
        userAnswer: blankAnswers.join(' / '),
        result,
        group: state.group,
      })
    );
    for (const t of q.targetTerms) {
      const key = t.toLowerCase();
      const cur = wordStatsRef.current.get(key) ?? { correct: 0, wrong: 0, bestTier: 0 };
      if (result.isCorrect) {
        cur.correct += 1;
        cur.bestTier = Math.max(cur.bestTier, QUESTION_TIERS[q.type] ?? 1);
      } else {
        cur.wrong += 1;
      }
      wordStatsRef.current.set(key, cur);
    }
    if (round === 1) {
      setRound1((r) => ({ correct: r.correct + (result.isCorrect ? 1 : 0), total: r.total + 1 }));
    }
  };

  /** 主动选「不会」：记为未掌握，不做 AI 归因 */
  const submitUnknown = async () => {
    if (!q || grading || feedback) return;
    const result = unknownResult();
    setPicked(null);
    setFeedback(result);
    await update(
      applyAnswer({ state, question: q, userAnswer: '（不会）', result, group: state.group })
    );
    for (const t of q.targetTerms) {
      const key = t.toLowerCase();
      const cur = wordStatsRef.current.get(key) ?? { correct: 0, wrong: 0, bestTier: 0 };
      cur.wrong += 1;
      wordStatsRef.current.set(key, cur);
    }
    if (round === 1) {
      setRound1((r) => ({ correct: r.correct, total: r.total + 1 }));
    }
  };

  const finishGroup = async () => {
    if (groupIdx + 1 < groups.length) {
      setGroupIdx(groupIdx + 1);
      setRound(1);
      setQuestions([]);
      setIdx(0);
      setAnswer('');
      setBlankAnswers([]);
      setPicked(null);
      setFeedback(null);
      setPhase('preview');
      return;
    }
    // 全部完成：评估 + 写下次提示词 + 记录下次难度策略
    const recommended = recommendNextMode(round1.total > 0 ? round1.correct / round1.total : null);
    const closed = { ...finishSession(state), nextMode: recommended };
    await update(closed);
    setNextMode(recommended);

    // 依据「掌握难度阶梯」升级：答对过不低于该词当前层级所需档位的题才升级；
    // 难度随用户能力自适应（能力强需更难、能力弱需更易），但不改变记忆算法的时间
    const bias = difficultyBias(state.attempts);
    for (const [term, stat] of wordStatsRef.current) {
      const w = book.words.find((x) => x.term.toLowerCase() === term);
      if (!w) continue;
      const need = requiredTier(w.box, bias);
      const mastered = stat.bestTier >= need;
      reviewWord(book.id, w.id, mastered ? 'good' : 'again');
    }
    wordStatsRef.current.clear();

    setPhase('done');

    setAdviceLoading(true);
    try {
      const sessionAttempts = closed.attempts.filter((a) => a.at >= sessionStart);
      const stats = errorTypeStats(sessionAttempts);
      const weak = closed.attempts
        .filter((a) => !a.isCorrect && a.at >= sessionStart)
        .flatMap((a) => a.targetTerms)
        .reduce<{ term: string; wrong: number }[]>((acc, t) => {
          const hit = acc.find((x) => x.term === t);
          if (hit) hit.wrong += 1;
          else acc.push({ term: t, wrong: 1 });
          return acc;
        }, [])
        .sort((a, b) => b.wrong - a.wrong)
        .slice(0, 8);
      const a = await generateAdvice({
        config,
        attempts: sessionAttempts,
        errorCounts: stats.map((s) => ({ label: s.label, count: s.count })),
        weak,
      });
      setAdvice(a);
    } catch (e) {
      setErrorMsg(`学习建议生成失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdviceLoading(false);
    }
  };

  const advance = async () => {
    if (idx + 1 < total) {
      setIdx(idx + 1);
      setAnswer('');
      setBlankAnswers([]);
      setPicked(null);
      setFeedback(null);
      return;
    }
    // 本轮结束：简单题表现好 → 进入难题；否则进入下一组或完成
    if (round === 1) {
      const acc = round1.total > 0 ? round1.correct / round1.total : null;
      if (state.nextMode === 'mixed' && shouldDoHardRound(acc)) {
        await beginHardRound();
        return;
      }
      await finishGroup();
      return;
    }
    await finishGroup();
  };

  const adopt = async () => {
    if (!advice) return;
    await update(
      adoptAdvice(state, {
        id: `ad_${Date.now().toString(36)}`,
        at: Date.now(),
        title: advice.title,
        detail: advice.detail,
        promptText: advice.promptText,
        errorType: advice.errorType,
        tags: advice.tags,
        adopted: false,
      })
    );
    setAdopted(true);
  };

  // ---------------- 开始页 ----------------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 出题' }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Ionicons name="create" size={36} color={colors.primary} />
            <Text style={styles.heroTitle}>AI 出题</Text>
            <Text style={styles.heroDesc}>
              AI 自动选词、自动出题：5 词一组，先易后难。完成后评估薄弱点、
              升级单词掌握度，并为下次生成提示词。你只需点「开始学习」。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>本次由 AI 自动安排</Text>
            <Text style={styles.cardLine}>
              出题策略：{NEXT_MODE_LABEL[state.nextMode]}（无需手动选择，AI 依据上次表现自动决定）
            </Text>
            <Text style={styles.cardLine}>
              选词：先学今日剩余新词（按顺序/随机），今日达标后复习到期单词；题型先易后难，表现好自动进阶。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>本次学习依据</Text>
            <Text style={styles.cardLine}>
              水平：{settings.level ? LEVEL_DESC[settings.level] ?? settings.level : '未测验（按高中估算）'}
            </Text>
            <Text style={styles.cardLine}>单词本：{book.words.length} 词（每 5 词一组，先易后难）</Text>
            <Text style={styles.cardLine}>
              薄弱点：长期 {layerInfo.core} · 近期 {layerInfo.recent} · 本次 {layerInfo.temp}
            </Text>
            <Text style={styles.cardLine}>错题记录：{state.attempts.length} 条</Text>
          </View>

          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

          <Button
            label="开始学习"
            icon="play"
            onPress={start}
            disabled={book.words.length === 0}
            style={{ alignSelf: 'stretch', marginTop: spacing.md }}
          />
          <Button
            label="自由出题（自定义题型）"
            variant="outline"
            icon="create"
            onPress={() => router.push(`/wordbook/${book.id}/questions-free`)}
            style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
          />

        </ScrollView>
      </View>
    );
  }

  // ---------------- 单词展示页 ----------------
  if (phase === 'preview') {
    const group = groups[groupIdx] ?? [];
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 出题' }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(groupIdx / groups.length) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              第 {groupIdx + 1} / {groups.length} 组
            </Text>
          </View>

          <View style={styles.hero}>
            <Ionicons name="book" size={30} color={colors.primary} />
            <Text style={styles.heroTitle}>本组单词（{group.length} 个）</Text>
            <Text style={styles.heroDesc}>
              {state.nextMode === 'hard'
                ? '先浏览一遍，随后直接进入难题。'
                : state.nextMode === 'easy'
                ? '先记牢释义，随后只做简单题。'
                : '先记牢释义，随后做简单题；表现好再上难题。'}
            </Text>
          </View>

          {group.map((w) => {
            const pos = extractPos(w.meaning);
            return (
              <View key={w.id} style={styles.wordCard}>
                <View style={styles.wordHead}>
                  <Text style={styles.wordTerm}>{w.term}</Text>
                  {w.phonetic ? <Text style={styles.wordPhonetic}>{w.phonetic}</Text> : null}
                  {pos ? (
                    <View style={styles.wordPosBadge}>
                      <Text style={styles.wordPosText}>{POS_LABEL[pos] ?? pos}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.wordMeaning}>{w.meaning}</Text>
                {w.example ? (
                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>例句</Text>
                    <Text style={styles.wordExample}>{w.example}</Text>
                  </View>
                ) : null}
                {w.derivatives && w.derivatives.length > 0 ? (
                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>用法</Text>
                    <Text style={styles.wordDeriv}>
                      {w.derivatives.map((d) => `${d.term}（${d.meaning}）`).join('、')}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

          <Button
            label={state.nextMode === 'hard' ? '开始难题测试' : '开始本组测试'}
            icon="play"
            onPress={() => void beginGroup()}
            style={{ alignSelf: 'stretch', marginTop: spacing.md }}
          />
        </ScrollView>
      </View>
    );
  }

  // ---------------- 出题中 ----------------
  if (phase === 'loading') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 出题' }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>
            {round === 2 ? 'AI 正在生成难题…' : '正在准备题目…'}
          </Text>
        </View>
      </View>
    );
  }

  // ---------------- 完成页 ----------------
  if (phase === 'done') {
    const sessionAttempts = state.attempts.filter((a) => a.at >= sessionStart);
    const correctCount = sessionAttempts.filter((a) => a.isCorrect).length;
    const totalDone = sessionAttempts.length;
    const acc = totalDone > 0 ? Math.round((correctCount / totalDone) * 100) : 0;
    const stats = errorTypeStats(sessionAttempts);
    const weak = weakTerms(state.attempts, 14).slice(0, 8);

    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 出题' }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.center}>
            <View style={[styles.heroIcon, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-done" size={36} color={colors.success} />
            </View>
            <Text style={styles.heroTitle}>本轮完成</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{correctCount}</Text>
              <Text style={styles.summaryLabel}>答对</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>
                {totalDone - correctCount}
              </Text>
              <Text style={styles.summaryLabel}>答错</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{acc}%</Text>
              <Text style={styles.summaryLabel}>正确率</Text>
            </View>
          </View>

          {stats.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>薄弱点 · 错因分析</Text>
              {stats.map((s) => (
                <View key={s.type} style={styles.statRow}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={styles.statValue}>{s.count} 次</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>薄弱点</Text>
              <Text style={styles.cardLine}>本轮没有错题，掌握得很好！</Text>
            </View>
          )}

          {weak.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>高频错词（近 14 天）</Text>
              {weak.map((w) => (
                <View key={w.term} style={styles.statRow}>
                  <Text style={styles.statLabel}>{w.term}</Text>
                  <Text style={styles.statValue}>错 {w.wrong} 次</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>下次测试建议</Text>
            <Text style={styles.cardLine}>
              下次将默认：{NEXT_MODE_LABEL[nextMode]}
            </Text>
            <Text style={styles.cardLine}>
              {nextMode === 'hard'
                ? '简单题表现很好，下次可直接挑战难题强化。'
                : nextMode === 'easy'
                ? '基础题正确率偏低，下次先巩固简单题。'
                : '表现中规中矩，下次继续完整流程（先易后难）。'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>AI 学习建议</Text>
            {adviceLoading ? (
              <View style={styles.adviceLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.cardLine}>正在分析你的错误模式…</Text>
              </View>
            ) : advice ? (
              <>
                <Text style={styles.adviceTitle}>{advice.title}</Text>
                <Text style={styles.adviceDetail}>{advice.detail}</Text>
                <View style={styles.promptBox}>
                  <Text style={styles.promptLabel}>下次会重点练：</Text>
                  <Text style={styles.promptText}>{advice.promptText}</Text>
                </View>
                {adopted ? (
                  <View style={styles.adoptedRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.adoptedText}>已记入薄弱点，下次针对性练习</Text>
                  </View>
                ) : (
                  <Button
                    label="采纳该建议"
                    icon="checkmark"
                    onPress={() => void adopt()}
                    style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
                  />
                )}
              </>
            ) : (
              <Text style={styles.cardLine}>{errorMsg ?? '本轮没有生成建议（可能全部答对）'}</Text>
            )}
          </View>

          <Button
            label="再来一轮"
            icon="refresh"
            onPress={start}
            style={{ alignSelf: 'stretch', marginTop: spacing.md }}
          />
          <Button
            label="自由出题（自定义题型）"
            variant="outline"
            icon="create"
            onPress={() => router.push(`/wordbook/${book.id}/questions-free`)}
            style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
          />

        </ScrollView>
      </View>
    );
  }

  // ---------------- 答题页 ----------------
  if (!q) return null;
  const progress = total > 0 ? (idx + 1) / total : 0;
  const isRoundLabel = round === 1 ? '第 1 轮 · 简单题' : '第 2 轮 · 难题';
  const blanks = extractBlanks(q.prompt, q.correctAnswer);
  const multiBlank = (blanks?.length ?? 0) >= 2;
  const isTranslation = q.type === 'translation';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'AI 出题' }} />
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {idx + 1} / {total}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{isRoundLabel}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{QUESTION_TYPE_LABEL[q.type]}</Text>
          </View>
          <View style={[styles.badge, q.source === 'ai' && styles.badgeAi]}>
            <Text style={[styles.badgeText, q.source === 'ai' && { color: '#fff' }]}>
              {q.source === 'ai' ? 'AI 生成' : '本地'}
            </Text>
          </View>
        </View>

        {q.passage ? (
          <View style={styles.passageBox}>
            <Text style={styles.passageText}>{q.passage}</Text>
          </View>
        ) : null}

        {q.requirement ? (
          <Text style={styles.requirementText}>{q.requirement}</Text>
        ) : null}
        <View style={styles.questionBox}>
          <Text style={styles.questionText}>{q.prompt}</Text>
        </View>

        {q.options && q.options.length >= 2 ? (
          <View style={styles.options}>
            {q.options.map((opt) => {
              const isCorrect = opt === q.correctAnswer;
              const isPicked = picked === opt;
              let border = {};
              if (feedback) {
                if (isCorrect) border = { borderColor: colors.success, backgroundColor: '#F0FDF4' };
                else if (isPicked) border = { borderColor: colors.danger, backgroundColor: '#FEF2F2' };
              }
              return (
                <Button
                  key={opt}
                  label={opt}
                  variant="outline"
                  disabled={feedback !== null || grading}
                  onPress={() => {
                    setPicked(opt);
                    void submit(opt);
                  }}
                  style={{ alignSelf: 'stretch', ...border }}
                  textStyle={{ textAlign: 'left' }}
                />
              );
            })}
          </View>
        ) : multiBlank && blanks ? (
          <>
            {blanks.map((b, i) => (
              <View key={i}>
                <Text style={styles.blankLabel}>
                  第 {i + 1} 空{b.base ? `（${b.base}）` : ''}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="填入正确形式"
                  placeholderTextColor={colors.textLight}
                  value={blankAnswers[i] ?? ''}
                  onChangeText={(t) =>
                    setBlankAnswers((arr) => {
                      const next = [...arr];
                      next[i] = t;
                      return next;
                    })
                  }
                  editable={feedback === null && !grading}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ))}
            {feedback === null ? (
              <Button
                label="提交"
                icon="checkmark"
                disabled={blanks.some((_, i) => !(blankAnswers[i] ?? '').trim())}
                onPress={() => void submitBlanks()}
                style={{ alignSelf: 'stretch' }}
              />
            ) : null}
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={q.type === 'translation' ? '输入你的英文翻译' : '输入答案'}
              placeholderTextColor={colors.textLight}
              value={answer}
              onChangeText={setAnswer}
              editable={feedback === null && !grading}
              multiline={q.type === 'translation'}
            />
            {feedback === null ? (
              <Button
                label={grading ? '判分中…' : '提交'}
                icon={grading ? undefined : 'checkmark'}
                disabled={grading || answer.trim().length === 0}
                onPress={() => void submit(answer.trim())}
                style={{ alignSelf: 'stretch' }}
              />
            ) : null}
          </>
        )}

        {feedback === null && !grading ? (
          <Button
            label="不会，跳过本题"
            icon="help-circle-outline"
            variant="ghost"
            onPress={() => void submitUnknown()}
            style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
          />
        ) : null}

        {grading ? (
          <View style={styles.gradingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.cardLine}>{q.options ? '正在分析错因…' : '正在判分…'}</Text>
          </View>
        ) : null}

        {feedback ? (
          <View
            style={[
              styles.feedbackBox,
              {
                borderColor: feedback.isCorrect
                  ? '#A7F3D0'
                  : feedback.errorType === 'unknown'
                  ? '#FDE68A'
                  : '#FECACA',
                backgroundColor: feedback.isCorrect
                  ? '#F0FDF4'
                  : feedback.errorType === 'unknown'
                  ? '#FFFBEB'
                  : '#FEF2F2',
              },
            ]}
          >
            <View style={styles.feedbackHead}>
              <Ionicons
                name={
                  feedback.isCorrect
                    ? 'checkmark-circle'
                    : feedback.errorType === 'unknown'
                    ? 'help-circle'
                    : 'close-circle'
                }
                size={20}
                color={
                  feedback.isCorrect
                    ? colors.success
                    : feedback.errorType === 'unknown'
                    ? colors.warning
                    : colors.danger
                }
              />
              <Text style={styles.feedbackTitle}>
                {isTranslation && typeof feedback.score === 'number'
                  ? feedback.score >= (feedback.maxScore ?? 5)
                    ? `回答完美 · ${feedback.score}/${feedback.maxScore ?? 5} 分`
                    : feedback.score >= 3
                    ? `基本正确 · ${feedback.score}/${feedback.maxScore ?? 5} 分`
                    : `错误较多 · ${feedback.score}/${feedback.maxScore ?? 5} 分`
                  : feedback.isCorrect
                  ? '回答正确'
                  : feedback.errorType === 'unknown'
                  ? '已记为未掌握'
                  : '回答错误'}
              </Text>
            </View>

            {isTranslation && feedback.breakdown && feedback.breakdown.length > 0 ? (
              <View style={styles.breakdownBox}>
                {feedback.breakdown.map((b) => (
                  <View key={b.label} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{b.label}</Text>
                    <Text style={styles.breakdownScore}>
                      {b.got}/{b.max} 分
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {isTranslation ? (
              <>
                <Text style={styles.feedbackLine}>
                  参考译文：<Text style={styles.bold}>{q.correctAnswer}</Text>
                </Text>
                {feedback.errorType && feedback.errorType !== 'unknown' ? (
                  <Text style={styles.feedbackLine}>
                    错因：<Text style={styles.bold}>{ERROR_TYPE_LABEL[feedback.errorType]}</Text>
                  </Text>
                ) : null}
              </>
            ) : !feedback.isCorrect ? (
              <>
                <Text style={styles.feedbackLine}>
                  正确答案：<Text style={styles.bold}>{q.correctAnswer}</Text>
                </Text>
                {feedback.errorType ? (
                  <Text style={styles.feedbackLine}>
                    {feedback.errorType === 'unknown' ? '记录为：' : '错因：'}
                    <Text style={styles.bold}>{ERROR_TYPE_LABEL[feedback.errorType]}</Text>
                  </Text>
                ) : null}
              </>
            ) : null}

            {feedback.reason ? <Text style={styles.feedbackLine}>{feedback.reason}</Text> : null}

            {q.explanation ? <Text style={styles.feedbackLine}>{q.explanation}</Text> : null}

            <Button
              label={idx + 1 < total ? '下一个' : '继续'}
              icon="arrow-forward"
              onPress={() => void advance()}
              style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  heroDesc: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  modeCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  modeTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  modeDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  tipText: { fontSize: 13, color: '#92400E', flex: 1, lineHeight: 19 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  cardLine: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  error: { fontSize: 13, color: colors.danger, marginTop: spacing.sm },
  loadingText: { fontSize: 14, color: colors.textMuted },
  progressWrap: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  progressText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  wordCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  wordHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordTerm: { fontSize: 18, fontWeight: '800', color: colors.text },
  wordPhonetic: { fontSize: 13, color: colors.textMuted },
  wordMeaning: { fontSize: 15, color: colors.text, marginTop: 4 },
  wordPosBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  wordPosText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  usageRow: { marginTop: 4 },
  usageLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  wordExample: { fontSize: 12, color: colors.textLight, marginTop: 2, fontStyle: 'italic' },
  wordDeriv: { fontSize: 12, color: colors.primary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  badgeAi: { backgroundColor: colors.primary },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  passageBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  passageText: { fontSize: 15, color: colors.text, lineHeight: 24 },
  requirementText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: spacing.md,
  },
  questionBox: { paddingVertical: spacing.md },
  questionText: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 26 },
  options: { gap: spacing.sm },
  blankLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  gradingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  feedbackBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  feedbackHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  feedbackTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  feedbackLine: { fontSize: 14, color: colors.textMuted, lineHeight: 21 },
  bold: { fontWeight: '800', color: colors.text },
  breakdownBox: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginVertical: spacing.xs,
    gap: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: { fontSize: 13, color: colors.text, flex: 1, marginRight: spacing.sm },
  breakdownScore: { fontSize: 13, fontWeight: '800', color: colors.text },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
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
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statLabel: { fontSize: 14, color: colors.text },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.danger },
  adviceLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  adviceTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  adviceDetail: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginTop: 4 },
  promptBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FEF3C7',
  },
  promptLabel: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  promptText: { fontSize: 13, color: '#78350F', marginTop: 2, lineHeight: 19 },
  adoptedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  adoptedText: { fontSize: 13, color: colors.success, fontWeight: '600' },
});

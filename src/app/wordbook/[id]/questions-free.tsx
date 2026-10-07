import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { getAiConfig, LEVEL_DESC } from '../../../lib/ai';
import { loadStudySettings, StudySettings } from '../../../lib/studySettings';
import { colors, radius, spacing } from '../../../lib/theme';
import { Button, EmptyState } from '../../../components/ui';
import { useAiq } from '../../../lib/aiq/useAiq';
import { generateAdvice } from '../../../lib/aiq/aiClient';
import { errorTypeStats } from '../../../lib/aiq/errorProfile';
import { adoptAdvice, layerCounts } from '../../../lib/aiq/promptLibrary';
import {
  applyAnswer,
  buildSession,
  finishSession,
  gradeAnswer,
  unknownResult,
  SessionOptions,
  SessionOrder,
  SessionPlan,
} from '../../../lib/aiq/session';
import {
  ERROR_TYPE_LABEL,
  ErrorType,
  QUESTION_TYPE_LABEL,
  Question,
  QuestionType,
} from '../../../lib/aiq/types';

type Phase = 'intro' | 'loading' | 'quiz' | 'done';

const TYPE_OPTIONS: QuestionType[] = [
  'meaning',
  'spelling',
  'cloze',
  'grammar',
  'translation',
  'reading',
];

const ORDER_OPTIONS: { key: SessionOrder; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'weak', label: '按薄弱点', icon: 'trending-down' },
  { key: 'random', label: '随机', icon: 'shuffle' },
  { key: 'type', label: '按题型', icon: 'list' },
];

export default function AiQuestionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks } = useApp();
  const book = wordbooks.find((b) => b.id === id);
  const { state, update, ready } = useAiq();

  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [options, setOptions] = useState<SessionOptions>({
    questionCount: 8,
    types: [],
    order: 'weak',
    useAi: true,
  });

  const [phase, setPhase] = useState<Phase>('intro');
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    errorType?: ErrorType;
    reason?: string;
    score?: number;
    maxScore?: number;
    breakdown?: { label: string; got: number; max: number }[];
  } | null>(null);

  const [advice, setAdvice] = useState<
    { title: string; detail: string; promptText: string; errorType: ErrorType; tags: string[] } | null
  >(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionStart, setSessionStart] = useState(0);
  // 限时答题：timed 是否开启，timeSecs 每题秒数，remaining 当前题剩余秒数
  const [timed, setTimed] = useState(false);
  const [timeSecs, setTimeSecs] = useState(20);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  // 限时倒计时：每秒递减，到 0 记为超时未掌握（超时提交放在 setTimeout 回调里异步执行）
  useEffect(() => {
    if (phase !== 'quiz' || !timed || feedback || grading) return;

    if (remaining <= 0) {
      const t = setTimeout(() => {
        const cur = plan?.questions[idx];
        if (cur && state && !feedback && !grading) {
          const result = { isCorrect: false, errorType: 'unknown' as ErrorType, reason: '超时未作答' };
          setPicked(null);
          setFeedback(result);
          void update(
            applyAnswer({ state, question: cur, userAnswer: '（超时）', result, group: state.group })
          );
        }
      }, 0);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timed, remaining, feedback, grading, plan, idx, state, update]);

  const layerInfo = useMemo(() => (state ? layerCounts(state.entries) : null), [state]);

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" />
      </View>
    );
  }
  if (!ready || !state || !settings) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '自由出题' }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  const config = getAiConfig(settings);
  const q: Question | undefined = plan?.questions[idx];
  const total = plan?.questions.length ?? 0;
  const correctCount = state.attempts.filter((a) => a.at >= sessionStart).filter((a) => a.isCorrect).length;
  const sessionAttempts = state.attempts.filter((a) => a.at >= sessionStart);

  const toggleType = (t: QuestionType) =>
    setOptions((o) => ({
      ...o,
      types: o.types.includes(t) ? o.types.filter((x) => x !== t) : [...o.types, t],
    }));

  const start = async () => {
    setErrorMsg(null);
    setPhase('loading');
    try {
      const built = await buildSession({
        config,
        words: book.words,
        state,
        level: settings.level,
        options,
      });
      setPlan(built);
      setIdx(0);
      setAnswer('');
      setPicked(null);
      setFeedback(null);
      setRemaining(timed ? timeSecs : 0);
      setAdvice(null);
      setAdopted(false);
      setSessionStart(Date.now());
      setPhase('quiz');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('intro');
    }
  };

  const submit = async (value: string) => {
    if (!q || grading || feedback) return;
    setGrading(true);
    setErrorMsg(null);
    try {
      const result = await gradeAnswer({ config, question: q, userAnswer: value });
      setFeedback(result);
      const next = applyAnswer({
        state,
        question: q,
        userAnswer: value,
        result,
        group: state.group,
      });
      await update(next);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGrading(false);
    }
  };

  /** 主动选「不会」：记为未掌握，不做 AI 归因（避免乱填带偏错因分析） */
  const submitUnknown = async () => {
    if (!q || grading || feedback) return;
    const result = unknownResult();
    setPicked(null);
    setFeedback(result);
    await update(
      applyAnswer({
        state,
        question: q,
        userAnswer: '（不会）',
        result,
        group: state.group,
      })
    );
  };

  const next = async () => {
    if (idx + 1 < total) {
      setIdx(idx + 1);
      setAnswer('');
      setPicked(null);
      setFeedback(null);
      setRemaining(timed ? timeSecs : 0);
      return;
    }
    // 会话结束
    const closed = finishSession(state);
    await update(closed);
    setPhase('done');
    // 生成学习建议
    setAdviceLoading(true);
    try {
      const stats = errorTypeStats(closed.attempts.filter((a) => a.at >= sessionStart));
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
        attempts: closed.attempts.filter((x) => x.at >= sessionStart),
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

  const adopt = async () => {
    if (!advice) return;
    const a = {
      id: `ad_${Date.now().toString(36)}`,
      at: Date.now(),
      title: advice.title,
      detail: advice.detail,
      promptText: advice.promptText,
      errorType: advice.errorType,
      tags: advice.tags,
      adopted: false,
    };
    await update(adoptAdvice(state, a));
    setAdopted(true);
  };

  // ---------------- 开始页 ----------------
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '自由出题' }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Ionicons name="create" size={36} color={colors.primary} />
            <Text style={styles.heroTitle}>自由出题 · 自定义题型</Text>
            <Text style={styles.heroDesc}>
              按你的词汇水平出「刚刚好超出一点」的题，答错后 AI 归因原因，
              采纳建议后写入分层提示词库，下次针对性出题。
            </Text>
          </View>

          <Text style={styles.sectionTitle}>题型</Text>
          <View style={styles.chips}>
            {TYPE_OPTIONS.map((t) => {
              const active = options.types.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleType(t)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {QUESTION_TYPE_LABEL[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>出题顺序</Text>
          <View style={styles.chips}>
            {ORDER_OPTIONS.map((o) => {
              const active = options.order === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setOptions((v) => ({ ...v, order: o.key }))}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Ionicons
                    name={o.icon}
                    size={14}
                    color={active ? '#fff' : colors.textMuted}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>题量</Text>
          <View style={styles.chips}>
            {[6, 8, 10, 15].map((n) => (
              <Pressable
                key={n}
                onPress={() => setOptions((v) => ({ ...v, questionCount: n }))}
                style={[styles.chip, options.questionCount === n && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    options.questionCount === n && styles.chipTextActive,
                  ]}
                >
                  {n} 题
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={styles.switchRow}
            onPress={() => setOptions((v) => ({ ...v, useAi: !v.useAi }))}
          >
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>启用 AI 生成高级题</Text>
              <Text style={styles.switchDesc}>
                {settings.aiProvider === 'device' ? '使用设备端模型' : '使用联网模型'}
                {' · '}
                关闭则只用本地基础题（毫秒级）
              </Text>
            </View>
            <Ionicons
              name={options.useAi ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={options.useAi ? colors.primary : colors.textLight}
            />
          </Pressable>

          <Pressable
            style={styles.switchRow}
            onPress={() => setTimed((v) => !v)}
          >
            <Ionicons name="timer-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>限时答题</Text>
              <Text style={styles.switchDesc}>每道题倒计时，超时记为未掌握</Text>
            </View>
            <Ionicons
              name={timed ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={timed ? colors.primary : colors.textLight}
            />
          </Pressable>

          {timed ? (
            <View style={[styles.chips, { marginTop: spacing.sm }]}>
              {[15, 20, 30].map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setTimeSecs(s)}
                  style={[styles.chip, timeSecs === s && styles.chipActive]}
                >
                  <Text style={[styles.chipText, timeSecs === s && styles.chipTextActive]}>
                    {s} 秒/题
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>本次训练依据</Text>
            <Text style={styles.cardLine}>
              水平：{settings.level ? LEVEL_DESC[settings.level] ?? settings.level : '未测验（按高中估算）'}
            </Text>
            <Text style={styles.cardLine}>单词本：{book.words.length} 词</Text>
            {layerInfo ? (
              <Text style={styles.cardLine}>
                提示词库：核心 {layerInfo.core} · 近期 {layerInfo.recent} · 临时 {layerInfo.temp}
              </Text>
            ) : null}
            <Text style={styles.cardLine}>
              错题记录：{state.attempts.length} 条 · A/B 分组：{state.group === 'A' ? 'A 组（采纳建议）' : 'B 组（常规复习）'}
            </Text>
          </View>

          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

          <Button
            label="开始出题"
            icon="play"
            onPress={start}
            disabled={options.types.length === 0}
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
        <Stack.Screen options={{ title: '自由出题' }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>AI 正在根据你的薄弱点出题…</Text>
        </View>
      </View>
    );
  }

  // ---------------- 完成页 ----------------
  if (phase === 'done') {
    const totalDone = sessionAttempts.length || total;
    const acc = totalDone > 0 ? Math.round((correctCount / totalDone) * 100) : 0;
    const stats = errorTypeStats(sessionAttempts);

    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '自由出题' }} />
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
              <Text style={styles.cardTitle}>错误归因</Text>
              {stats.map((s) => (
                <View key={s.type} style={styles.statRow}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={styles.statValue}>{s.count} 次</Text>
                </View>
              ))}
            </View>
          ) : null}

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
                  <Text style={styles.promptLabel}>采纳后写入提示词库：</Text>
                  <Text style={styles.promptText}>{advice.promptText}</Text>
                </View>
                {adopted ? (
                  <View style={styles.adoptedRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.adoptedText}>已采纳，下次出题将针对性训练</Text>
                  </View>
                ) : (
                  <Button
                    label="采纳该建议"
                    icon="checkmark"
                    onPress={adopt}
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
            label="返回"
            variant="ghost"
            icon="arrow-back"
            onPress={() => router.back()}
            style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
          />
        </ScrollView>
      </View>
    );
  }

  // ---------------- 答题页 ----------------
  if (!q) return null;
  const progress = total > 0 ? (idx + 1) / total : 0;
  const isWrong = feedback !== null && !feedback.isCorrect;
  const isTranslation = q.type === 'translation';
  const fb = feedback
    ? (() => {
        if (feedback.errorType === 'unknown') {
          return {
            icon: 'help-circle' as const,
            color: colors.warning,
            bg: '#FFFBEB',
            border: '#FDE68A',
            title: '已记为未掌握',
          };
        }
        if (isTranslation && typeof feedback.score === 'number') {
          const s = feedback.score;
          const m = feedback.maxScore ?? 5;
          if (s >= m) {
            return {
              icon: 'checkmark-circle' as const,
              color: colors.success,
              bg: '#F0FDF4',
              border: '#A7F3D0',
              title: `回答完美 · ${s}/${m} 分`,
            };
          }
          if (s >= 3) {
            return {
              icon: 'checkmark-circle' as const,
              color: colors.warning,
              bg: '#FFFBEB',
              border: '#FDE68A',
              title: `基本正确 · ${s}/${m} 分`,
            };
          }
          return {
            icon: 'close-circle' as const,
            color: colors.danger,
            bg: '#FEF2F2',
            border: '#FECACA',
            title: `错误较多 · ${s}/${m} 分`,
          };
        }
        if (feedback.isCorrect) {
          return {
            icon: 'checkmark-circle' as const,
            color: colors.success,
            bg: '#F0FDF4',
            border: '#A7F3D0',
            title: '回答正确',
          };
        }
        return {
          icon: 'close-circle' as const,
          color: colors.danger,
          bg: '#FEF2F2',
          border: '#FECACA',
          title: '回答错误',
        };
      })()
    : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '自由出题' }} />
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {idx + 1} / {total}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{QUESTION_TYPE_LABEL[q.type]}</Text>
          </View>
          <View style={[styles.badge, q.source === 'ai' && styles.badgeAi]}>
            <Text style={[styles.badgeText, q.source === 'ai' && { color: '#fff' }]}>
              {q.source === 'ai' ? 'AI 生成' : '本地'}
            </Text>
          </View>
          {timed && feedback === null && !grading ? (
            <View
              style={[
                styles.badge,
                { flexDirection: 'row', alignItems: 'center', gap: 4 },
                remaining <= 5 && { backgroundColor: '#FEE2E2' },
              ]}
            >
              <Ionicons
                name="timer-outline"
                size={12}
                color={remaining <= 5 ? colors.danger : colors.primaryDark}
              />
              <Text style={[styles.badgeText, remaining <= 5 && { color: colors.danger }]}>
                {remaining}s
              </Text>
            </View>
          ) : null}
          {plan && plan.injection.usedIds.length > 0 && q.source === 'ai' ? (
            <View style={[styles.badge, styles.badgeInjected]}>
              <Text style={styles.badgeText}>已注入提示词</Text>
            </View>
          ) : null}
        </View>

        {q.passage ? (
          <View style={styles.passageBox}>
            <Text style={styles.passageText}>{q.passage}</Text>
          </View>
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
        ) : (
          <>
            {isTranslation && q.requiredTerms && q.requiredTerms.length > 0 ? (
              <Text style={styles.requiredTerms}>
                必用词：<Text style={styles.requiredTerm}>{q.requiredTerms.join('、')}</Text>
              </Text>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder={
                q.type === 'translation'
                  ? '输入你的英文翻译（必须用到必用词）'
                  : q.type === 'grammar'
                  ? '填入正确形式（可填整句）'
                  : '输入答案'
              }
              placeholderTextColor={colors.textLight}
              value={answer}
              onChangeText={setAnswer}
              editable={feedback === null && !grading}
              multiline={q.type === 'translation'}
            />
            {feedback === null ? (
              <Button
                label={grading ? 'AI 判分中…' : '提交'}
                icon={grading ? undefined : 'checkmark'}
                disabled={grading || answer.trim().length === 0}
                onPress={() => void submit(answer.trim())}
                style={{ alignSelf: 'stretch' }}
              />
            ) : null}
          </>
        )}

        {/* 「不会」：允许体面跳过，避免用户被迫乱填而污染错因分析 */}
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
            <Text style={styles.cardLine}>
              {q.options ? 'AI 正在归因错误原因…' : 'AI 正在判分…'}
            </Text>
          </View>
        ) : null}

        {feedback && fb ? (
          <View
            style={[
              styles.feedbackBox,
              {
                borderColor: fb.border,
                backgroundColor: fb.bg,
              },
            ]}
          >
            <View style={styles.feedbackHead}>
              <Ionicons name={fb.icon} size={20} color={fb.color} />
              <Text style={styles.feedbackTitle}>{fb.title}</Text>
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
                    错误归因：<Text style={styles.bold}>{ERROR_TYPE_LABEL[feedback.errorType]}</Text>
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
                    {feedback.errorType === 'unknown' ? '记录为：' : '错误归因：'}
                    <Text style={styles.bold}>{ERROR_TYPE_LABEL[feedback.errorType]}</Text>
                  </Text>
                ) : null}
              </>
            ) : null}

            {feedback.reason ? <Text style={styles.feedbackLine}>{feedback.reason}</Text> : null}

            {q.explanation ? <Text style={styles.feedbackLine}>{q.explanation}</Text> : null}

            <Button
              label={idx + 1 < total ? '下一个' : '完成'}
              icon="arrow-forward"
              onPress={() => void next()}
              style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
            />
          </View>
        ) : null}

        {isWrong && errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  switchTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  switchDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  badgeAi: { backgroundColor: colors.primary },
  badgeInjected: { backgroundColor: '#FEF3C7' },
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
  questionBox: { paddingVertical: spacing.md },
  questionText: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 26 },
  options: { gap: spacing.sm },
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
  requiredTerms: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm },
  requiredTerm: { fontWeight: '800', color: colors.primary },
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

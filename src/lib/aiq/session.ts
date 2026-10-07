import { AiConfig, LEVEL_DESC } from '../ai';
import { LevelKey } from '../../data/levelTestWords';
import { Word } from '../types';
import { shuffle } from '../utils';
import { diagnoseError, generateAiQuestions, gradeFreeText } from './aiClient';
import { pickTrainingWords, targetDifficulty, updateProficiency, weakTerms } from './errorProfile';
import { buildLocalQuestions } from './localGen';
import {
  closeSession,
  buildInjection,
  recordOutcome,
  upsertEntry,
  InjectionResult,
} from './promptLibrary';
import {
  AI_ONLY_TYPES,
  AbGroup,
  AiqState,
  Attempt,
  ERROR_TYPE_LABEL,
  ErrorType,
  Question,
  QuestionType,
} from './types';

export type SessionOrder = 'random' | 'type' | 'weak';

export type SessionOptions = {
  questionCount: number;
  types: QuestionType[];
  order: SessionOrder;
  useAi: boolean;
};

export type SessionPlan = {
  questions: Question[];
  words: Word[];
  difficulty: number;
  injection: InjectionResult;
  aiUsed: boolean;
  aiError?: string;
};

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()（）\s]+/g, '');
}

function aid(): string {
  return `at_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 组装一次训练会话：
 *   1) 本地按遗忘曲线 + 高频错词选词；
 *   2) 本地基础题（毫秒级，保证 <50ms 响应）；
 *   3) AI 高级题（完形/阅读/语法/翻译），并注入分层提示词库做特异性训练。
 */
export async function buildSession(params: {
  config: AiConfig;
  words: Word[];
  state: AiqState;
  level: LevelKey | null;
  options: SessionOptions;
}): Promise<SessionPlan> {
  const { config, words, state, level, options } = params;
  const now = Date.now();

  const count = Math.max(3, options.questionCount);
  const difficulty = targetDifficulty(level, state.attempts);
  const inject = buildInjection(state.entries, { now });

  const picked = pickTrainingWords(words, state.attempts, Math.max(count, 8), now);
  const trainingWords = picked.length > 0 ? picked : words.slice(0, count);

  const wantAi = options.useAi && options.types.some((t) => AI_ONLY_TYPES.includes(t));
  const wantLocal = options.types.filter((t) => !AI_ONLY_TYPES.includes(t));

  let aiQuestions: Question[] = [];
  let aiError: string | undefined;
  let aiUsed = false;

  if (wantAi) {
    const aiCount = Math.max(1, Math.round(count * 0.6));
    try {
      aiQuestions = await generateAiQuestions({
        config,
        words: trainingWords.slice(0, 12).map((w) => ({ term: w.term, meaning: w.meaning })),
        types: options.types,
        count: aiCount,
        difficulty,
        levelDesc: level ? LEVEL_DESC[level] ?? '高中（高考）及以下' : '高中（高考）及以下',
        injection: inject.text,
      });
      aiUsed = true;
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
    }
  }

  const localTypes: QuestionType[] =
    wantLocal.length > 0 ? wantLocal : aiUsed ? [] : (['meaning', 'spelling'] as QuestionType[]);
  const localCount = Math.max(0, count - aiQuestions.length);
  const localQuestions =
    localCount > 0 && localTypes.length > 0
      ? buildLocalQuestions(trainingWords, words, localTypes, localCount)
      : [];

  let questions = [...aiQuestions, ...localQuestions];
  if (questions.length === 0) {
    questions = buildLocalQuestions(trainingWords, words, ['meaning', 'spelling'], count);
  }

  questions = applyOrder(questions, options.order, state, now);
  return { questions, words: trainingWords, difficulty, injection: inject, aiUsed, aiError };
}

function applyOrder(
  questions: Question[],
  order: SessionOrder,
  state: AiqState,
  now: number
): Question[] {
  const list = [...questions];
  if (order === 'random') return shuffle(list);

  if (order === 'weak') {
    const weak = new Map(weakTerms(state.attempts, 14, now).map((w) => [w.term, w.wrong]));
    return list.sort((a, b) => {
      const wa = Math.max(0, ...a.targetTerms.map((t) => weak.get(t) ?? 0));
      const wb = Math.max(0, ...b.targetTerms.map((t) => weak.get(t) ?? 0));
      return wb - wa;
    });
  }

  // 按题型分组（用户自选题型时的自然顺序）
  const orderIndex = new Map<QuestionType, number>();
  const types: QuestionType[] = [
    'meaning',
    'spelling',
    'derivative',
    'cloze',
    'grammar',
    'translation',
    'reading',
  ];
  types.forEach((t, i) => orderIndex.set(t, i));
  return list.sort((a, b) => (orderIndex.get(a.type) ?? 99) - (orderIndex.get(b.type) ?? 99));
}

export type GradeResult = {
  isCorrect: boolean;
  errorType?: ErrorType;
  reason?: string;
};

/** 批改：选择题本地即时判分（<50ms），翻译题走 AI 判分 + 归因，答错时 AI 归因 */
export async function gradeAnswer(params: {
  config: AiConfig;
  question: Question;
  userAnswer: string;
}): Promise<GradeResult> {
  const { config, question, userAnswer } = params;

  if (question.options && question.options.length >= 2) {
    const isCorrect = normalize(userAnswer) === normalize(question.correctAnswer);
    if (isCorrect) return { isCorrect: true };
    const diagnosed = await diagnoseError({ config, question, userAnswer });
    return { isCorrect: false, errorType: diagnosed.errorType, reason: diagnosed.reason };
  }

  return gradeFreeText({ config, question, userAnswer });
}

/** 把一次作答写入本地档案：错题记录 + 临时层提示 + 掌握度 */
export function applyAnswer(params: {
  state: AiqState;
  question: Question;
  userAnswer: string;
  result: GradeResult;
  group: AbGroup;
  now?: number;
}): AiqState {
  const { state, question, userAnswer, result, group } = params;
  const now = params.now ?? Date.now();

  const attempt: Attempt = {
    id: aid(),
    at: now,
    questionId: question.id,
    questionType: question.type,
    source: question.source,
    targetTerms: question.targetTerms,
    prompt: question.prompt,
    userAnswer,
    correctAnswer: question.correctAnswer,
    isCorrect: result.isCorrect,
    errorType: result.isCorrect ? undefined : result.errorType ?? 'other',
    errorReason: result.isCorrect ? undefined : result.reason,
    group,
  };

  let next: AiqState = { ...state, attempts: [...state.attempts, attempt] };

  // 本地等级管理
  next = updateProficiency(next, question.targetTerms, result.isCorrect, now);

  // 回写到相关提示条目，用于验证掌握程度
  next = recordOutcome(next, question.targetTerms, result.isCorrect);

  // 答错：写入临时层（仅本次会话注入）
  if (!result.isCorrect) {
    const label = ERROR_TYPE_LABEL[result.errorType ?? 'other'];
    const terms = question.targetTerms.slice(0, 2).join('、');
    const text = terms
      ? `${label}：${terms}。${result.reason ?? ''}`.slice(0, 80)
      : `${label}：${result.reason ?? ''}`.slice(0, 80);
    next = upsertEntry(
      next,
      {
        text,
        layer: 'temp',
        errorType: result.errorType,
        tags: question.targetTerms,
        source: 'auto',
      },
      now
    );
  }

  return next;
}

/** 会话结束：临时层归并进近期层，并做老化升级 */
export function finishSession(state: AiqState, now = Date.now()): AiqState {
  return { ...closeSession(state, now), lastSessionAt: now };
}

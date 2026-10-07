import { isDue, isGraduated, isNew } from '../srs';
import { PickMode, Word } from '../types';
import { shuffle } from '../utils';
import { Attempt, NextMode, QuestionType } from './types';

// 「导学模式」的纯本地流程参数与决策（除 AI 出题外全部本地计算）。
// 用户流程：
//   1) 先学习今日要学的新词（展示词性/释义/例句/用法），再复习到期单词；
//   2) 5 词一组，学完一组按「掌握难度」逐级测试；
//   3) 简单题表现好则进入第二轮难题（翻译 / 完形 / 阅读 / 语法）；
//   4) 完成后评估，生成下次提示词并告知薄弱点；
//   5) 下次可只测简单题或只测难题，取决于上次结果。

export const GROUP_SIZE = 5;

/** 第一轮（简单题）正确率达到该值即进入第二轮难题 */
export const HARD_ROUND_THRESHOLD = 0.7;
/** 综合正确率达到该值，下次默认只测难题 */
export const HARD_MODE_ACCURACY = 0.85;
/** 综合正确率低于该值，下次默认只测简单题 */
export const EASY_MODE_ACCURACY = 0.5;

/** 简单题：本地即时、毫秒级 */
export const EASY_TYPES: QuestionType[] = ['meaning', 'spelling'];
/** 难题：需 AI 生成（翻译 / 完形 / 阅读 / 语法） */
export const HARD_TYPES: QuestionType[] = ['translation', 'cloze', 'reading', 'grammar'];

/** 题型难度档位：1 选释义/词族（最易）→ 2 拼写 → 3 完形/语法 → 4 翻译/阅读（最难） */
export const QUESTION_TIERS: Record<QuestionType, number> = {
  meaning: 1,
  derivative: 1,
  spelling: 2,
  cloze: 3,
  grammar: 3,
  translation: 4,
  reading: 4,
};

/**
 * 从 box 升到 box+1 需要答对的题型档位。
 * - 0（新词）→ 1：答对选释义即可升级；
 * - 1 → 2：需拼写填空；
 * - 2 → 3：需完形/语法；
 * - 3+ → 4：需翻译/阅读。
 * bias 为 AI 依据用户能力给出的难度偏置（+1 更难、-1 更易）。
 */
export function requiredTier(box: number, bias = 0): number {
  const base = box <= 0 ? 1 : box === 1 ? 2 : box === 2 ? 3 : 4;
  return Math.max(1, Math.min(4, base + bias));
}

/** 根据最近答题正确率得出难度偏置：能力强 +1，能力弱 -1，否则 0 */
export function difficultyBias(attempts: Attempt[]): number {
  const recent = attempts.slice(-30);
  if (recent.length < 8) return 0;
  const acc = recent.filter((a) => a.isCorrect).length / recent.length;
  if (acc >= 0.85) return 1;
  if (acc < 0.5) return -1;
  return 0;
}

/**
 * 把本次要学的单词切成 5 词一组。
 * - newWordCount > 0 且还有新词：今日未达标，先学「剩余所需」个新词（box 0）；
 * - newWordCount <= 0 或没有新词：复习到期单词。
 * 顺序按 pickMode：sequential 保持词本顺序，random 随机。
 */
export function buildWordGroups(
  words: Word[],
  newWordCount: number,
  pickMode: PickMode,
  groupSize = GROUP_SIZE
): Word[][] {
  const now = Date.now();
  const active = words.filter((w) => !isGraduated(w));
  const newWords = active.filter((w) => isNew(w));
  const due = active.filter((w) => !isNew(w) && isDue(w, now));

  let list: Word[];
  if (newWordCount > 0 && newWords.length > 0) {
    list = orderWords(newWords, pickMode).slice(0, Math.min(newWordCount, newWords.length));
  } else {
    list = orderWords(due, pickMode);
  }

  const groups: Word[][] = [];
  for (let i = 0; i < list.length; i += groupSize) {
    groups.push(list.slice(i, i + groupSize));
  }
  return groups;
}

function orderWords(list: Word[], pickMode: PickMode): Word[] {
  return pickMode === 'random' ? shuffle(list) : list;
}

/** 第一轮是否表现足够好，进入第二轮难题 */
export function shouldDoHardRound(round1Accuracy: number | null): boolean {
  if (round1Accuracy === null) return false;
  return round1Accuracy >= HARD_ROUND_THRESHOLD;
}

/** 依据本次表现，推荐下次的难度策略 */
export function recommendNextMode(accuracy: number | null): NextMode {
  if (accuracy === null) return 'mixed';
  if (accuracy >= HARD_MODE_ACCURACY) return 'hard';
  if (accuracy < EASY_MODE_ACCURACY) return 'easy';
  return 'mixed';
}

/** 每组难题的题量：每个单词各出一道难题，确保逐级测试覆盖到每个词 */
export function hardQuestionCount(groupSize: number): number {
  return Math.max(2, Math.min(6, groupSize));
}

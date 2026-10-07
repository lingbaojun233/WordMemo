import { Word } from '../types';
import { pickTrainingWords } from './errorProfile';
import { Attempt, NextMode, QuestionType } from './types';

// 「导学模式」的纯本地流程参数与决策（除 AI 出题外全部本地计算）。
// 用户流程：
//   1) 展示当前需要学习的单词和意思；
//   2) 5 词一组，看完一组先做最简单的题（选释义 / 拼写填空）；
//   3) 简单题表现好则进入第二轮难题（翻译 / 完形 / 阅读 / 语法）；
//   4) 完成后评估，生成下次提示词并告知薄弱点；
//   5) 下次可只测简单题或只测难题，取决于上次结果。

export const GROUP_SIZE = 5;
/** 单次会话最多学习的单词数（≈ 4 组），避免一次塞入整本词书 */
export const SESSION_WORD_CAP = 20;

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

/** 把本次要学的单词切成 5 词一组（到期优先 → 高频错词 → 其余） */
export function buildWordGroups(
  words: Word[],
  attempts: Attempt[],
  cap = SESSION_WORD_CAP,
  groupSize = GROUP_SIZE
): Word[][] {
  const picked = pickTrainingWords(words, attempts, cap);
  const list = picked.length > 0 ? picked : words.slice(0, cap);
  const groups: Word[][] = [];
  for (let i = 0; i < list.length; i += groupSize) {
    groups.push(list.slice(i, i + groupSize));
  }
  return groups;
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

/** 每组难题的题量（约为单词数的 0.8，控制在 2~4） */
export function hardQuestionCount(groupSize: number): number {
  return Math.max(2, Math.min(4, Math.round(groupSize * 0.8)));
}

import { PickMode, ReviewResult, Word } from './types';
import { shuffle } from './utils';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Leitner 盒层级对应的复习间隔
export const BOX_INTERVALS = [
  0, // 0: 新词，立即复习
  10 * MINUTE, // 1: 10 分钟后
  1 * DAY, // 2: 1 天后
  2 * DAY, // 3: 2 天后
  4 * DAY, // 4: 4 天后
  7 * DAY, // 5: 7 天后
  15 * DAY, // 6: 15 天后
  30 * DAY, // 7: 30 天后
];

export const MAX_BOX = BOX_INTERVALS.length - 1;

// 记忆盒各层级的数字等级标签（用于在颜色旁提示含义）
export const BOX_LABELS = [
  '新词', // 0
  '初识', // 1
  '熟悉', // 2
  '巩固', // 3
  '熟练', // 4
  '掌握', // 5
  '精通', // 6
  '已学会', // 7
];

/** 返回记忆盒数字等级提示，如「7-已学会」「0-新词」 */
export function boxLabel(box: number): string {
  const b = Math.max(0, Math.min(MAX_BOX, box));
  return `${b}-${BOX_LABELS[b]}`;
}

/**
 * 根据复习结果推进一个单词的记忆盒层级并计算下次复习时间。
 * - good：通过，升一级（最高到 7）
 * - again / hard：不通过，等级保持不变（不降级），按当前层级重新安排下次复习
 */
export function applyReview(word: Word, result: ReviewResult, now = Date.now()): Word {
  const box =
    result === 'good'
      ? Math.min(MAX_BOX, word.box + 1)
      : word.box; // 不通过：等级不变

  const dueAt = now + BOX_INTERVALS[box];

  return {
    ...word,
    box,
    dueAt,
    correctCount: word.correctCount + (result === 'good' ? 1 : 0),
    wrongCount: word.wrongCount + (result !== 'good' ? 1 : 0),
    lastReviewedAt: now,
  };
}

/** 判断单词当前是否到期需要复习 */
export function isDue(word: Word, now = Date.now()): boolean {
  return word.dueAt <= now;
}

/** 是否为新词（从未复习过） */
export function isNew(word: Word): boolean {
  return word.box === 0 && !word.lastReviewedAt;
}

/** 是否已掌握（达到最高层级） */
export function isMastered(word: Word): boolean {
  return word.box >= MAX_BOX;
}

/** 复习调度所需的「待复习」单词，按 dueAt 升序排列 */
export function dueWords(words: Word[], now = Date.now()): Word[] {
  return words
    .filter((w) => isDue(w, now))
    .sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * 从单词本中选取今日要学习的单词（最多 dailyWords 个）。
 * 到期单词优先（按到期时间），不足则用其余单词补齐。
 * - sequential：保持「到期 → 其余」的顺序
 * - random：各部分随机打乱
 */
export function pickDailyWords(
  words: Word[],
  dailyWords: number,
  pickMode: PickMode,
  now = Date.now()
): Word[] {
  const due = dueWords(words, now);
  const dueIds = new Set(due.map((w) => w.id));
  const rest = words.filter((w) => !dueIds.has(w.id));
  const pool =
    pickMode === 'random'
      ? [...shuffle(due), ...shuffle(rest)]
      : [...due, ...rest];
  return pool.slice(0, Math.max(0, dailyWords));
}

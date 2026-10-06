import { PickMode, ReviewResult, Word } from './types';
import { shuffle } from './utils';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NEVER_DUE = Number.MAX_SAFE_INTEGER; // 已毕业单词的下次复习时间（永不到期）

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

export const MAX_BOX = BOX_INTERVALS.length - 1; // 7：已学会

export const GRADUATED_BOX = MAX_BOX + 1; // 8：已毕业（完全掌握，不再复习）

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
  '已毕业', // 8
];

/** 返回记忆盒数字等级提示，如「7-已学会」「8-已毕业」「0-新词」 */
export function boxLabel(box: number): string {
  const b = Math.max(0, Math.min(GRADUATED_BOX, box));
  return `${b}-${BOX_LABELS[b]}`;
}

/**
 * 根据复习结果推进一个单词的记忆盒层级并计算下次复习时间。
 * - good：通过，升一级；已学会（7 级）再次答对则毕业（8 级，不再复习）
 * - again / hard：不通过，等级保持不变（不降级），按当前层级重新安排下次复习
 */
export function applyReview(word: Word, result: ReviewResult, now = Date.now()): Word {
  let box = word.box;
  if (result === 'good') {
    // 已学会（7 级）后再次答对 → 毕业（8 级）
    box = word.box >= MAX_BOX ? GRADUATED_BOX : word.box + 1;
  }
  // 不通过：等级不变

  const dueAt = box >= GRADUATED_BOX ? NEVER_DUE : now + BOX_INTERVALS[box];

  return {
    ...word,
    box,
    dueAt,
    correctCount: word.correctCount + (result === 'good' ? 1 : 0),
    wrongCount: word.wrongCount + (result !== 'good' ? 1 : 0),
    lastReviewedAt: now,
    history: [...(word.history ?? []), { at: now, result, box }],
  };
}

/** 判断单词当前是否到期需要复习 */
export function isDue(word: Word, now = Date.now()): boolean {
  if (word.box >= GRADUATED_BOX) return false; // 已毕业不再复习
  return word.dueAt <= now;
}

/** 是否为新词（从未复习过） */
export function isNew(word: Word): boolean {
  return word.box === 0 && !word.lastReviewedAt;
}

/** 是否已掌握（达到已学会层级及以上） */
export function isMastered(word: Word): boolean {
  return word.box >= MAX_BOX;
}

/** 是否已毕业（完全掌握，不再需要复习） */
export function isGraduated(word: Word): boolean {
  return word.box >= GRADUATED_BOX;
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
  const active = words.filter((w) => !isGraduated(w)); // 已毕业不再进入学习/复习
  const due = dueWords(active, now);
  const dueIds = new Set(due.map((w) => w.id));
  const rest = active.filter((w) => !dueIds.has(w.id));
  const pool =
    pickMode === 'random'
      ? [...shuffle(due), ...shuffle(rest)]
      : [...due, ...rest];
  return pool.slice(0, Math.max(0, dailyWords));
}

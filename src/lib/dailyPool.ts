import { PickMode, Word } from './types';

// 今日学习池：三种学习模式（先背诵后测验 / AI 写短文 / AI 出题）共用同一批「今日要学的新词」。
// 关键点：random 模式用「当天日期 + 词本 id」做确定性种子，保证同一天内无论从哪个模式进入，
// 选到的都是同一批单词，避免切个模式就换成另一批词。

function dayKey(now: number): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime().toString(36);
}

/** FNV-1a 字符串哈希，用作伪随机种子 */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32：轻量确定性伪随机数发生器 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 选取今日要学习的新词（box === 0，尚未完成初学），最多 count 个。
 * - sequential：保持词本原顺序；
 * - random：按「当天日期 + 词本 id」做种子打乱（当天内稳定）。
 */
export function todayNewWords(
  words: Word[],
  pickMode: PickMode,
  count: number,
  bookId = '',
  now = Date.now()
): Word[] {
  const newWords = words.filter((w) => w.box === 0);
  if (count <= 0 || newWords.length === 0) return [];
  const ordered =
    pickMode === 'random'
      ? seededShuffle(newWords, hashSeed(`${dayKey(now)}:${bookId}`))
      : newWords;
  return ordered.slice(0, Math.max(0, count));
}

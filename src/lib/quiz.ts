import { Word } from './types';
import { shuffle } from './utils';

export type QuizQuestion = {
  id: string;
  term: string;
  correct: string; // 正确释义
  options: string[];
  derivatives?: { term: string; meaning: string }[];
};

/**
 * 从释义开头提取词性，用于优先选择同词性干扰项（模拟词汇水平测验）。
 * 归一化为 v / adj / adv / n / 其它（num、prep、art、conj…）。
 */
export function posOf(meaning: string): string {
  const s = (meaning || '').trim().toLowerCase();
  const m = s.match(/^([a-z]+(?:\s*&\s*[a-z]+)?)\s*\./);
  if (!m) return 'other';
  const tag = m[1].replace(/\s+/g, '');
  if (tag.includes('v')) return 'v';
  if (tag === 'adj' || tag === 'a' || tag.includes('adj')) return 'adj';
  if (tag === 'adv' || tag === 'ad') return 'adv';
  if (tag.includes('n')) return 'n';
  return tag.split('&')[0];
}

/** 选择题的候选词元：term 英文、meaning 中文释义、pos 词性（缺省时按释义前缀推断） */
export type ChoiceItem = {
  term: string;
  meaning: string;
  pos?: string;
};

/** 一道「选释义/选单词」选择题 */
export type MeaningChoice = {
  direction: 'e2c' | 'c2e';
  prompt: string; // 题干（英文单词 或 中文释义）
  correct: string; // 正确选项
  options: string[]; // 全部选项（含正确项，已打乱）
};

/**
 * 出一道「选对释义 / 选对单词」选择题（通用原语）。
 * 干扰项优先同词性，不足再用其它词性补齐；选项不重复。
 * 词汇水平测验、先背诵后测验、AI 写短文测验、AI 出题的选释义题共用此实现。
 */
export function buildMeaningChoice(
  target: ChoiceItem,
  pool: ChoiceItem[],
  optionCount = 4,
  direction: 'e2c' | 'c2e' = 'e2c'
): MeaningChoice {
  const posOfItem = (x: ChoiceItem) => x.pos ?? posOf(x.meaning);
  const targetPos = posOfItem(target);
  const samePos = pool.filter((x) => posOfItem(x) === targetPos);
  const rest = pool.filter((x) => posOfItem(x) !== targetPos);
  const candidates = shuffle([...shuffle(samePos), ...shuffle(rest)]);

  const usedMeanings = new Set<string>([target.meaning]);
  const usedTerms = new Set<string>([target.term]);
  const chosen: ChoiceItem[] = [];
  for (const c of candidates) {
    if (chosen.length >= optionCount - 1) break;
    if (usedMeanings.has(c.meaning) || usedTerms.has(c.term)) continue;
    usedMeanings.add(c.meaning);
    usedTerms.add(c.term);
    chosen.push(c);
  }

  if (direction === 'c2e') {
    return {
      direction,
      prompt: target.meaning,
      correct: target.term,
      options: shuffle([target.term, ...chosen.map((c) => c.term)]),
    };
  }
  return {
    direction,
    prompt: target.term,
    correct: target.meaning,
    options: shuffle([target.meaning, ...chosen.map((c) => c.meaning)]),
  };
}

/**
 * 为一批单词出「选对释义」选择题。
 * 关键：干扰项不取自题目本身（words），而是来自更大的 distractorPool
 * （通常是整本单词本），并优先选同词性，避免「选项只在待复习单词里打转」。
 */
export function buildQuiz(
  words: Word[],
  distractorPool: Word[],
  optionCount = 4
): QuizQuestion[] {
  const questionTerms = new Set(words.map((w) => w.term.toLowerCase()));
  // 干扰项池：排除题目中的单词
  const pool = distractorPool.filter((x) => !questionTerms.has(x.term.toLowerCase()));

  return words.map((w) => {
    const choice = buildMeaningChoice(
      { term: w.term, meaning: w.meaning },
      pool,
      optionCount,
      'e2c'
    );
    return {
      id: w.id,
      term: w.term,
      correct: choice.correct,
      options: choice.options,
      derivatives: w.derivatives,
    };
  });
}

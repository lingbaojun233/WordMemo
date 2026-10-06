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
  const distractors = optionCount - 1;
  const questionTerms = new Set(words.map((w) => w.term.toLowerCase()));
  // 干扰项池：排除题目中的单词
  const pool = distractorPool.filter((x) => !questionTerms.has(x.term.toLowerCase()));

  return words.map((w) => {
    const targetPos = posOf(w.meaning);
    const samePos = pool.filter((x) => posOf(x.meaning) === targetPos);
    const rest = pool.filter((x) => posOf(x.meaning) !== targetPos);
    // 同词性优先，不足再用其它词性补齐
    const candidates = shuffle([...shuffle(samePos), ...shuffle(rest)]);

    const chosen: string[] = [];
    const used = new Set<string>([w.meaning]);
    for (const c of candidates) {
      if (chosen.length >= distractors) break;
      if (used.has(c.meaning)) continue;
      used.add(c.meaning);
      chosen.push(c.meaning);
    }

    return {
      id: w.id,
      term: w.term,
      correct: w.meaning,
      options: shuffle([w.meaning, ...chosen]),
      derivatives: w.derivatives,
    };
  });
}

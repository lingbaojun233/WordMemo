import { Word } from '../types';
import { shuffle } from '../utils';
import { posOf } from '../quiz';
import { Question, QuestionType } from './types';

// 本地基础出题：完全离线、同步计算（毫秒级），作为「本地优先」的兜底与热身题。
// 高级题型（完形/阅读/语法/翻译）由 AI 生成，见 aiClient.ts。

let seq = 0;
function qid(): string {
  seq += 1;
  return `lq_${Date.now().toString(36)}_${seq}`;
}

/** 选释义（同词性干扰项优先） */
function meaningQuestion(w: Word, pool: Word[], optionCount = 4): Question {
  const targetPos = posOf(w.meaning);
  const others = pool.filter((x) => x.term.toLowerCase() !== w.term.toLowerCase());
  const samePos = shuffle(others.filter((x) => posOf(x.meaning) === targetPos));
  const rest = shuffle(others.filter((x) => posOf(x.meaning) !== targetPos));

  const chosen: string[] = [];
  const used = new Set<string>([w.meaning]);
  for (const c of [...samePos, ...rest]) {
    if (chosen.length >= optionCount - 1) break;
    if (used.has(c.meaning)) continue;
    used.add(c.meaning);
    chosen.push(c.meaning);
  }

  return {
    id: qid(),
    type: 'meaning',
    source: 'local',
    prompt: w.term,
    options: shuffle([w.meaning, ...chosen]),
    correctAnswer: w.meaning,
    targetTerms: [w.term.toLowerCase()],
    difficulty: 0.3,
  };
}

/** 看释义拼写单词（给出首字母与长度提示） */
function spellingQuestion(w: Word): Question {
  const term = w.term;
  const hint = `${term[0]}${'_'.repeat(Math.max(0, term.length - 1))}`;
  return {
    id: qid(),
    type: 'spelling',
    source: 'local',
    prompt: `根据释义拼写单词：${w.meaning}\n提示：${hint}（共 ${term.length} 个字母）`,
    correctAnswer: term,
    targetTerms: [term.toLowerCase()],
    difficulty: 0.45,
  };
}

/** 词族派生：从干扰项中选出该词的派生词 */
function derivativeQuestion(w: Word, pool: Word[]): Question | null {
  const derivs = w.derivatives ?? [];
  if (derivs.length === 0) return null;
  const target = derivs[0];
  const correct = `${target.term}（${target.meaning}）`;

  const others = shuffle(
    pool.filter(
      (x) =>
        x.term.toLowerCase() !== w.term.toLowerCase() &&
        !derivs.some((d) => d.term.toLowerCase() === x.term.toLowerCase())
    )
  ).slice(0, 3);
  if (others.length < 3) return null;

  return {
    id: qid(),
    type: 'derivative',
    source: 'local',
    prompt: `下列哪个是「${w.term}」的派生词？`,
    options: shuffle([correct, ...others.map((x) => `${x.term}（${x.meaning}）`)]),
    correctAnswer: correct,
    explanation: `${w.term} 的派生词：${derivs.map((d) => d.term).join('、')}`,
    targetTerms: [w.term.toLowerCase(), ...derivs.map((d) => d.term.toLowerCase())],
    difficulty: 0.55,
  };
}

/**
 * 本地批量出题。types 为空时默认 [meaning, spelling]。
 * 传入的 words 应已按「到期优先」排好序（见 srs.dueWords / errorProfile.pickTrainingWords）。
 */
export function buildLocalQuestions(
  words: Word[],
  pool: Word[],
  types: QuestionType[],
  count: number
): Question[] {
  const usable = types.filter((t) => t === 'meaning' || t === 'spelling' || t === 'derivative');
  const kinds = usable.length > 0 ? usable : (['meaning', 'spelling'] as QuestionType[]);

  const out: Question[] = [];
  let i = 0;
  let guard = 0;
  while (out.length < count && guard < count * 6 && words.length > 0) {
    const w = words[i % words.length];
    const kind = kinds[(i + guard) % kinds.length];
    i++;
    guard++;

    if (kind === 'meaning') {
      out.push(meaningQuestion(w, pool));
    } else if (kind === 'spelling') {
      out.push(spellingQuestion(w));
    } else {
      const q = derivativeQuestion(w, pool);
      if (q) out.push(q);
    }
  }
  return out.slice(0, count);
}

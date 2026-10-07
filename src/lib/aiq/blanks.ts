import { GradeResult } from './types';

// 多空格填空（语法填空 ___(原形)）的拆分与逐空判分。
// 题干里每个 ___(原形) 是一个空；正确答案是「把空位换成正确形式后的完整句子」，
// 因此可以按固定文本段把完整答案切成每个空的答案，从而本地逐空判对错（毫秒级）。

export type Blank = { base: string; answer: string };

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()（）\s]+/g, '');
}

/**
 * 从题干与完整正确答案中拆出每个空的原形与正确形式。
 * 兼容「题目要求混在题干里」的情况（AI 有时会把「用括号中单词的正确形式填空。」
 * 写进 stem），此时按最长可匹配片段对齐，而不是直接判定失败。
 * 实在拆不出来返回 null，调用方回退到单输入 + AI 判分。
 */
export function extractBlanks(prompt: string, correctAnswer: string): Blank[] | null {
  const parts = prompt.split(/___\(([^)]*)\)/);
  // parts = [text0, base0, text1, base1, ..., textN]
  const segments: string[] = [];
  const bases: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) segments.push(parts[i]);
    else bases.push(parts[i].trim());
  }
  if (bases.length === 0) return null;

  let rest = correctAnswer.trim();
  const answers: string[] = [];
  for (let i = 0; i < bases.length; i++) {
    // 前缀：题干开头可能带「题目要求」等与答案无关的文字，取最长可对齐的后缀
    const prefix = segments[i].trim();
    if (prefix) {
      const consumed = alignPrefix(prefix, rest);
      if (consumed == null) return null;
      rest = rest.slice(consumed.length);
    }
    // 后缀：题干结尾也可能挂着无关文字，取最长可匹配前缀
    const suffix = segments[i + 1].trim();
    const end = suffixEnd(rest, suffix, i === bases.length - 1);
    if (end < 0) return null;
    const ans = rest.slice(0, end).trim();
    if (!ans) return null;
    answers.push(ans);
    rest = rest.slice(end);
  }

  return bases.map((base, i) => ({ base, answer: answers[i] }));
}

/** 找出 prefix 的最长后缀，使其正好是 rest 的开头；返回该后缀，找不到返回 null */
function alignPrefix(prefix: string, rest: string): string | null {
  if (rest.startsWith(prefix)) return prefix;
  for (let k = 1; k < prefix.length; k++) {
    const tail = prefix.slice(k);
    if (tail && rest.startsWith(tail)) return tail;
  }
  return null;
}

/** 找出 suffix 在 rest 中的起点；suffix 尾部挂了无关文字时退化为匹配其最长前缀；最后一个空兜底取到末尾 */
function suffixEnd(rest: string, suffix: string, isLast: boolean): number {
  if (!suffix) return rest.length;
  const idx = rest.indexOf(suffix);
  if (idx >= 0) return idx;
  for (let len = suffix.length - 1; len >= 2; len--) {
    const i = rest.indexOf(suffix.slice(0, len));
    if (i >= 0) return i;
  }
  return isLast ? rest.length : -1;
}

/** 逐空精确判分：全部答对才算对；返回可直接写入反馈/档案的 GradeResult */
export function gradeBlanks(blanks: Blank[], answers: string[]): GradeResult {
  const results = blanks.map((b, i) => ({
    base: b.base,
    answer: b.answer,
    got: (answers[i] ?? '').trim(),
    ok: norm(answers[i] ?? '') === norm(b.answer),
  }));

  const allOk = results.every((r) => r.ok);
  if (allOk) return { isCorrect: true };

  const wrong = results
    .map((r, i) => (r.ok ? null : `第${i + 1}空应为「${r.answer}」`))
    .filter((s): s is string => Boolean(s))
    .join('；');
  return { isCorrect: false, errorType: 'grammar', reason: wrong };
}

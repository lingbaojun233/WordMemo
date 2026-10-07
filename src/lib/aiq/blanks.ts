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
 * 拆不出来（格式不符合预期）返回 null，调用方回退到单输入 + AI 判分。
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
    const prefix = segments[i].trim();
    if (prefix) {
      if (!rest.startsWith(prefix)) return null;
      rest = rest.slice(prefix.length);
    }
    const suffix = segments[i + 1].trim();
    const end = suffix ? rest.indexOf(suffix) : rest.length;
    if (end < 0) return null;
    const ans = rest.slice(0, end).trim();
    if (!ans) return null;
    answers.push(ans);
    rest = rest.slice(end);
  }

  return bases.map((base, i) => ({ base, answer: answers[i] }));
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

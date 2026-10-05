export type ParsedEntry = {
  term: string;
  meaning: string;
};

// 常见的分隔符：制表符、竖线、中文顿号/逗号、英文逗号、分号
const SPLIT_RE = /\t|\s{2,}|[|｜,，;；]/;

/**
 * 解析批量导入文本。支持多种格式，每行一条：
 *   apple 苹果
 *   apple\t苹果
 *   apple,苹果
 *   apple | 苹果
 *   仅单词（无释义）
 * 也兼容「单词 = 释义」以及「单词 释义」中单词后紧跟空格的情况。
 */
export function parseImportText(text: string): ParsedEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    // 去掉行首的编号，如 "1. apple 苹果" 或 "1、apple"
    const cleaned = line.replace(/^\s*\d+[.)、]\s*/, '');

    let term = '';
    let meaning = '';

    // 先尝试按 "=" 分割
    if (cleaned.includes('=')) {
      const [t, ...rest] = cleaned.split('=');
      term = t.trim();
      meaning = rest.join('=').trim();
    } else {
      const match = cleaned.match(SPLIT_RE);
      if (match && match.index !== undefined) {
        term = cleaned.slice(0, match.index).trim();
        // 去掉分隔符（可能是多个字符，如两个空格）
        let rest = cleaned.slice(match.index);
        rest = rest.replace(SPLIT_RE, '').trim();
        meaning = rest;
      } else {
        // 无明确分隔符：尝试用第一个空格拆分 "apple 苹果"
        const spaceIdx = cleaned.search(/\s/);
        if (spaceIdx > 0) {
          term = cleaned.slice(0, spaceIdx).trim();
          meaning = cleaned.slice(spaceIdx).trim();
        } else {
          term = cleaned;
          meaning = '';
        }
      }
    }

    // 单词本身可能带音标，如 "apple /ˈæp.əl/" —— 简单处理：去掉斜杠包裹的音标
    term = stripPhonetic(term);

    if (term.length > 0) {
      entries.push({ term, meaning: meaning || '' });
    }
  }

  return entries;
}

function stripPhonetic(term: string): string {
  // 去掉类似 /xxx/ 或 [xxx] 的音标部分
  return term.replace(/\s*[\[/][^\]/]*[\]/]\s*$/, '').trim();
}

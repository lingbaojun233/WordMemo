import { AiConfig, completeText, extractJson } from '../ai';
import {
  AI_ONLY_TYPES,
  Attempt,
  ERROR_TYPE_LABEL,
  ErrorType,
  QUESTION_TYPE_LABEL,
  Question,
  QuestionType,
} from './types';

// 所有大模型调用集中在此文件；除这里的网络/端侧推理外，其余逻辑全部本地运行。

const ERROR_KEYS = Object.keys(ERROR_TYPE_LABEL) as ErrorType[];

let seq = 0;
function qid(): string {
  seq += 1;
  return `aq_${Date.now().toString(36)}_${seq}`;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()（）\s]+/g, '');
}

function coerceErrorType(v: unknown): ErrorType {
  const s = String(v ?? '').trim();
  return (ERROR_KEYS as string[]).includes(s) ? (s as ErrorType) : 'other';
}

function coerceType(v: unknown): QuestionType {
  const s = String(v ?? '').trim() as QuestionType;
  const all: QuestionType[] = ['meaning', 'spelling', 'derivative', ...AI_ONLY_TYPES];
  return all.includes(s) ? s : 'cloze';
}

function difficultyHint(d: number): string {
  if (d < 0.35) return '基础（接近学习者当前水平）';
  if (d < 0.55) return '中等（略高于当前水平，i+1）';
  if (d < 0.75) return '偏难（明显高出当前水平，但可通过推理答对）';
  return '困难（挑战性，考察易混淆点）';
}

/** AI 出题：注入分层提示词库，实现「特异性训练」 */
export async function generateAiQuestions(params: {
  config: AiConfig;
  words: { term: string; meaning: string }[];
  types: QuestionType[];
  count: number;
  difficulty: number;
  levelDesc: string;
  injection: string;
}): Promise<Question[]> {
  const { config, words, types, count, difficulty, levelDesc, injection } = params;

  const wantTypes = types.filter((t) => AI_ONLY_TYPES.includes(t));
  const effective = wantTypes.length > 0 ? wantTypes : AI_ONLY_TYPES.slice(0, 2);

  const wordList = words.map((w) => `- ${w.term}（${w.meaning}）`).join('\n');
  const typeList = effective.map((t) => `${t}（${QUESTION_TYPE_LABEL[t]}）`).join('、');

  const injectionBlock = injection.trim()
    ? `\n【个性化要求（来自学习者的错误档案，必须针对性体现）】\n${injection.trim()}\n`
    : '';

  const prompt = `你是一位英语命题老师，为中文母语学习者出题。

【学习者水平】已掌握「${levelDesc}」的词汇。
【本次训练单词】
${wordList}

【目标难度】${difficultyHint(difficulty)}。
【题型】只使用这些题型：${typeList}。共出 ${count} 道题。
${injectionBlock}
【出题要求】
1. 难度「刚刚好超出」学习者当前水平：用已掌握词汇做背景，只考查少量新词/易错点。
2. 若「个性化要求」指出了特定错误倾向，必须专门设计能暴露并纠正该错误的题目（这是本次出题的核心）。
3. 每题只考查一个点，题干简洁明确。
4. 完形填空：60~120 词短文，用 ____ 表示空，并给出 4 个选项。
5. 阅读理解：100~160 词短文 + 1 个问题 + 4 个选项。
6. 语法填空：单句或短句，用 ____ 表示空，给出 4 个选项（考查时态/语态/搭配等）。
7. 翻译：给出一句中文，要求译为英文（不提供选项，correctAnswer 给参考译文）。
8. correctAnswer 必须与 options 中的某一项完全一致（翻译题除外）。
9. targetTerms 填该题实际考查的单词（小写，来自上面的训练单词）。

【输出格式】只输出一个 JSON 对象，不要任何额外文字：
{"questions":[{"type":"cloze","passage":"短文（翻译/语法填空可为空字符串）","prompt":"题干（含 ____）","options":["A项","B项","C项","D项"],"correctAnswer":"正确项原文","explanation":"一句中文解析","targetTerms":["word"]}]}`;

  const content = await completeText(config, prompt, { temperature: 0.85, maxTokens: 1800 });
  const parsed = extractJson(content) as { questions?: unknown };
  const raw = Array.isArray(parsed?.questions) ? parsed.questions : [];

  const out: Question[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    const promptText = String(item?.prompt ?? '').trim();
    const correctAnswer = String(item?.correctAnswer ?? '').trim();
    if (!promptText || !correctAnswer) continue;

    const options = Array.isArray(item?.options)
      ? (item.options as unknown[]).map((o) => String(o)).filter((o) => o.length > 0)
      : [];

    const targetTerms = Array.isArray(item?.targetTerms)
      ? (item.targetTerms as unknown[]).map((t) => String(t).toLowerCase())
      : [];

    out.push({
      id: qid(),
      type: coerceType(item?.type),
      source: 'ai',
      prompt: promptText,
      passage: String(item?.passage ?? '').trim() || undefined,
      options: options.length >= 2 ? options : undefined,
      correctAnswer,
      explanation: String(item?.explanation ?? '').trim() || undefined,
      targetTerms: targetTerms.length > 0 ? targetTerms : words.map((w) => w.term.toLowerCase()),
      difficulty,
    });
    if (out.length >= count) break;
  }

  if (out.length === 0) throw new Error('AI 未能生成有效题目，请重试');
  return out;
}

/** 错误归因：判断「为什么错」 */
export async function diagnoseError(params: {
  config: AiConfig;
  question: Question;
  userAnswer: string;
}): Promise<{ errorType: ErrorType; reason: string }> {
  const { config, question, userAnswer } = params;
  const typeList = ERROR_KEYS.map((k) => `${k}=${ERROR_TYPE_LABEL[k]}`).join('、');

  const prompt = `请诊断一道英语题的错误类型。

【题型】${QUESTION_TYPE_LABEL[question.type]}
${question.passage ? `【短文】${question.passage}\n` : ''}【题干】${question.prompt}
【正确答案】${question.correctAnswer}
【学习者答案】${userAnswer}

【可选错误类型】${typeList}

【要求】只判断最贴近的一种，并用一句中文说明原因（不超过 40 字）。
【输出】只输出 JSON，不要其他文字：
{"errorType":"词义混淆","reason":"把 indeed 与 in deed 混淆"}`;

  try {
    const content = await completeText(config, prompt, { temperature: 0.2, maxTokens: 160 });
    const parsed = extractJson(content) as { errorType?: unknown; reason?: unknown };
    const label = String(parsed?.errorType ?? '');
    const byLabel = ERROR_KEYS.find((k) => ERROR_TYPE_LABEL[k] === label);
    return {
      errorType: byLabel ?? coerceErrorType(parsed?.errorType),
      reason: String(parsed?.reason ?? '').trim() || 'AI 未给出具体原因',
    };
  } catch {
    return { errorType: 'other', reason: '无法完成自动归因' };
  }
}

/** 自由文本作答（翻译题）：先判对错，错则归因 */
export async function gradeFreeText(params: {
  config: AiConfig;
  question: Question;
  userAnswer: string;
}): Promise<{ isCorrect: boolean; errorType?: ErrorType; reason?: string }> {
  const { config, question, userAnswer } = params;
  const typeList = ERROR_KEYS.map((k) => `${k}=${ERROR_TYPE_LABEL[k]}`).join('、');

  const prompt = `请批改一道英语翻译题。

【题干】${question.prompt}
【参考译文】${question.correctAnswer}
【学习者译文】${userAnswer}

【判定标准】意思基本准确即算正确，不要求与参考译文逐字一致。

【输出】只输出 JSON，不要其他文字：
{"isCorrect":true,"errorType":"","reason":""}
其中 errorType 仅在 isCorrect 为 false 时填写，可选值：${typeList}`;

  try {
    const content = await completeText(config, prompt, { temperature: 0, maxTokens: 160 });
    const parsed = extractJson(content) as {
      isCorrect?: unknown;
      errorType?: unknown;
      reason?: unknown;
    };
    const isCorrect = Boolean(parsed?.isCorrect);
    if (isCorrect) return { isCorrect: true };
    return {
      isCorrect: false,
      errorType: coerceErrorType(parsed?.errorType),
      reason: String(parsed?.reason ?? '').trim() || 'AI 未给出具体原因',
    };
  } catch {
    // 兜底：关键词重合度过半视为正确
    const want = normalize(question.correctAnswer);
    const got = normalize(userAnswer);
    if (!got) return { isCorrect: false, errorType: 'comprehension', reason: '未作答' };
    let hit = 0;
    for (let i = 0; i < want.length - 2; i += 3) {
      if (got.includes(want.slice(i, i + 3))) hit++;
    }
    const ratio = want.length > 3 ? hit / Math.ceil((want.length - 2) / 3) : 0;
    return ratio > 0.6
      ? { isCorrect: true }
      : { isCorrect: false, errorType: 'comprehension', reason: '译文与参考差异较大' };
  }
}

/** 生成学习建议（可采纳，采纳后写入分层提示词库） */
export async function generateAdvice(params: {
  config: AiConfig;
  attempts: Attempt[];
  errorCounts: { label: string; count: number }[];
  weak: { term: string; wrong: number }[];
}): Promise<{ title: string; detail: string; promptText: string; errorType: ErrorType; tags: string[] }> {
  const { config, attempts, errorCounts, weak } = params;

  const wrongList = attempts
    .filter((a) => !a.isCorrect)
    .slice(0, 12)
    .map(
      (a) =>
        `- [${QUESTION_TYPE_LABEL[a.questionType]}] ${
          a.errorType ? ERROR_TYPE_LABEL[a.errorType] : '未归因'
        }：${a.prompt.replace(/\s+/g, ' ').slice(0, 60)} ｜ 正确：${a.correctAnswer.slice(0, 40)} ｜ 学员：${a.userAnswer.slice(0, 40)}`
    )
    .join('\n');

  const prompt = `你是一位英语学习教练。请根据学习者本次练习的错误情况，给出 1 条最值得采纳的学习建议。

【本次错题】
${wrongList || '（无错题）'}

【错误类型分布】${errorCounts.map((e) => `${e.label}×${e.count}`).join('、') || '无'}
【高频错词】${weak.map((w) => `${w.term}(${w.wrong})`).join('、') || '无'}

【要求】
1. 只给 1 条建议，必须具体、可执行，直击上面的错误模式。
2. promptText 是写进「出题提示词库」的内容：一句话，从「命题老师」视角描述下次出题应如何针对该弱点（不超过 60 字，只写要求，不要解释）。
3. tags 填建议针对的单词或语法点（小写英文，1~4 个）。
4. errorType 选最相关的一种。

【可选 errorType】${ERROR_KEYS.map((k) => `${k}=${ERROR_TYPE_LABEL[k]}`).join('、')}

【输出】只输出 JSON，不要其他文字：
{"title":"建议标题（12字内）","detail":"具体说明（80字内）","promptText":"命题要求（60字内）","errorType":"搭配错误","tags":["word"]}`;

  const content = await completeText(config, prompt, { temperature: 0.6, maxTokens: 500 });
  const parsed = extractJson(content) as Record<string, unknown>;
  const title = String(parsed?.title ?? '').trim();
  const promptText = String(parsed?.promptText ?? '').trim();
  if (!title || !promptText) throw new Error('AI 未返回有效建议');

  return {
    title,
    detail: String(parsed?.detail ?? '').trim(),
    promptText,
    errorType: coerceErrorType(parsed?.errorType),
    tags: Array.isArray(parsed?.tags)
      ? (parsed.tags as unknown[]).map((t) => String(t).toLowerCase()).slice(0, 4)
      : [],
  };
}

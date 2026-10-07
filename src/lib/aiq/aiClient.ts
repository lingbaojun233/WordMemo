import { AiConfig, completeText, extractJson } from '../ai';
import { shuffle } from '../utils';
import {
  AI_ERROR_TYPES,
  AI_ONLY_TYPES,
  Attempt,
  ERROR_TYPE_LABEL,
  ErrorType,
  GradeResult,
  QUESTION_TYPE_LABEL,
  Question,
  QuestionType,
  ScoreBreakdown,
  ScorePoint,
} from './types';

// 所有大模型调用集中在此文件；除这里的网络/端侧推理外，其余逻辑全部本地运行。

// 交给 AI 归因的类型不含「未掌握」——那是学习者点「不会」时直接记录的，不需要 AI 猜
const ERROR_KEYS: ErrorType[] = AI_ERROR_TYPES;

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

/** 选择题题型：必须带 options，否则 UI 会退化成填空（如「完形填空没选项」） */
const CHOICE_TYPES: QuestionType[] = ['meaning', 'derivative', 'cloze', 'reading'];

/** 兜底：AI 漏给/少给选项时，用正确答案 + 训练词做干扰项，保证选择题始终有选项 */
function buildChoiceOptions(
  correctAnswer: string,
  words: { term: string; meaning: string }[]
): string[] | undefined {
  const correct = correctAnswer.trim();
  if (!correct) return undefined;
  const distractors = shuffle(
    words.map((w) => w.term).filter((t) => normalize(t) !== normalize(correct))
  ).slice(0, 3);
  const opts = shuffle([correct, ...distractors]);
  return opts.length >= 2 ? opts : undefined;
}

function difficultyHint(d: number): string {
  if (d < 0.35) return '基础（接近学习者当前水平）';
  if (d < 0.55) return '中等（略高于当前水平，i+1）';
  if (d < 0.75) return '偏难（明显高出当前水平，但可通过推理答对）';
  return '困难（挑战性，考察易混淆点）';
}

/** 翻译题默认给分点：必用词 / 语义 / 语法，合计 5 分 */
function defaultRubric(requiredTerms: string[]): ScorePoint[] {
  const pts: ScorePoint[] = [];
  if (requiredTerms.length > 0) {
    pts.push({ label: `正确使用必用词 ${requiredTerms.join('/')}`, max: 2 });
  } else {
    pts.push({ label: '正确使用目标词汇', max: 2 });
  }
  pts.push({ label: '语义准确、完整', max: 2 });
  pts.push({ label: '语法正确', max: 1 });
  return pts;
}

function parseScorePoint(v: unknown): ScorePoint | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const label = String(o.label ?? '').trim();
  const max = Number(o.max);
  if (!label || !Number.isFinite(max) || max <= 0) return null;
  return { label, max: Math.min(5, Math.round(max)) };
}

/** 归一化给分点：缺省时给默认，否则把各点 max 缩放为合计恰好 5（largest remainder） */
function normalizeRubric(raw: unknown, requiredTerms: string[]): ScorePoint[] {
  const parsed = Array.isArray(raw)
    ? (raw.map(parseScorePoint).filter(Boolean) as ScorePoint[])
    : [];
  const list = parsed.length > 0 ? parsed : defaultRubric(requiredTerms);
  const total = list.reduce((s, p) => s + p.max, 0);
  if (total === 5) return list;
  if (total <= 0) return defaultRubric(requiredTerms);

  const scaled = list.map((p) => ({ label: p.label, v: (p.max * 5) / total }));
  const floor = scaled.map((p) => Math.floor(p.v));
  let remain = 5 - floor.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((p, i) => ({ i, frac: p.v - Math.floor(p.v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remain; k++) {
    floor[order[k % order.length].i] += 1;
  }
  return list.map((p, i) => ({ label: p.label, max: Math.max(1, floor[i]) }));
}

function parseBreakdown(v: unknown): ScoreBreakdown | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const label = String(o.label ?? '').trim();
  const max = Number(o.max);
  const got = Number(o.got);
  if (!label || !Number.isFinite(max) || !Number.isFinite(got)) return null;
  return { label, got: Math.max(0, Math.round(got)), max: Math.max(0, Math.round(max)) };
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
6. 语法填空：单句或短句，空用 ___(原形) 表示（括号内给该词原形，例如 I ___(have) an apple. She ___(have) an apple too.），不提供选项；correctAnswer 填把空位换成正确形式后的完整句子（多个空则整段都给出）。
7. 翻译：给出一句中文，要求译为英文；必须指定 1~2 个必用词（必须来自【本次训练单词】，写入 requiredTerms），学习者答案必须用到这些词；必须自行为本题划分给分点 rubric（每个点含 label 与 max，所有 max 之和必须恰好等于 5，且必须包含「正确使用必用词」这一点），correctAnswer 给参考译文（必须包含必用词）。
8. correctAnswer 必须与 options 中的某一项完全一致（仅选择题；语法填空/翻译题无 options）。
9. targetTerms 填该题实际考查的单词（小写，来自上面的训练单词）。

【输出格式】只输出一个 JSON 对象，不要任何额外文字：
{"questions":[
  {"type":"grammar","prompt":"I ___(have) an apple. She ___(have) an apple too.","options":[],"correctAnswer":"I have an apple. She has an apple too.","explanation":"第一空主语是 I 用原形 have，第二空主语 She 用三单 has。","targetTerms":["have"]},
  {"type":"translation","prompt":"请把下面这句话翻译成英文：我有一个苹果。","requiredTerms":["have"],"correctAnswer":"I have an apple.","rubric":[{"label":"正确使用必用词 have","max":2},{"label":"语义准确完整","max":2},{"label":"语法正确","max":1}],"explanation":"…","targetTerms":["have"]}
]}`;

  const content = await completeText(config, prompt, { temperature: 0.85, maxTokens: 1800 });
  const parsed = extractJson(content) as { questions?: unknown };
  const raw = Array.isArray(parsed?.questions) ? parsed.questions : [];

  const out: Question[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    const promptText = String(item?.prompt ?? '').trim();
    const correctAnswer = String(item?.correctAnswer ?? '').trim();
    if (!promptText || !correctAnswer) continue;

    const type = coerceType(item?.type);

    const parsedOptions = Array.isArray(item?.options)
      ? (item.options as unknown[]).map((o) => String(o)).filter((o) => o.length > 0)
      : [];
    const options =
      parsedOptions.length >= 2
        ? parsedOptions
        : CHOICE_TYPES.includes(type)
        ? buildChoiceOptions(correctAnswer, words) ?? []
        : [];

    const targetTerms = Array.isArray(item?.targetTerms)
      ? (item.targetTerms as unknown[]).map((t) => String(t).toLowerCase())
      : [];

    const requiredTerms = Array.isArray(item?.requiredTerms)
      ? (item.requiredTerms as unknown[])
          .map((t) => String(t).toLowerCase().trim())
          .filter((t) => t.length > 0)
      : [];

    const question: Question = {
      id: qid(),
      type,
      source: 'ai',
      prompt: promptText,
      passage: String(item?.passage ?? '').trim() || undefined,
      options: options.length >= 2 ? options : undefined,
      correctAnswer,
      explanation: String(item?.explanation ?? '').trim() || undefined,
      targetTerms: targetTerms.length > 0 ? targetTerms : words.map((w) => w.term.toLowerCase()),
      difficulty,
    };

    if (type === 'translation') {
      // 必用词兜底：AI 漏给时取目标单词；给分点缺省或分值不对时归一化为合计 5 分
      question.requiredTerms =
        requiredTerms.length > 0 ? requiredTerms : question.targetTerms.slice(0, 1);
      question.rubric = normalizeRubric(item?.rubric, question.requiredTerms);
    }

    out.push(question);
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

/** 翻译题本地启发式评分（AI 判分失败时的兜底） */
function localTranslateScore(question: Question, userAnswer: string): GradeResult {
  const required = question.requiredTerms ?? [];
  const rubric =
    question.rubric && question.rubric.length > 0 ? question.rubric : defaultRubric(required);
  const maxScore = rubric.reduce((s, p) => s + p.max, 0) || 5;
  const gotText = userAnswer.trim();

  if (!gotText) {
    return {
      isCorrect: false,
      score: 0,
      maxScore,
      errorType: 'comprehension',
      reason: '未作答',
      breakdown: rubric.map((p) => ({ label: p.label, got: 0, max: p.max })),
    };
  }

  const gotNorm = normalize(userAnswer);
  const usedAll = required.every((t) => gotNorm.includes(normalize(t)));
  const usedAny = required.some((t) => gotNorm.includes(normalize(t)));

  const want = normalize(question.correctAnswer);
  let hit = 0;
  for (let i = 0; i < want.length - 2; i += 3) {
    if (gotNorm.includes(want.slice(i, i + 3))) hit++;
  }
  const ratio = want.length > 3 ? hit / Math.ceil((want.length - 2) / 3) : 0;

  let score = 0;
  if (required.length > 0) score += usedAll ? 2 : usedAny ? 1 : 0;
  score += Math.round(ratio * 2);
  if (gotNorm.length > 0) score += 1;
  score = Math.max(0, Math.min(maxScore, score));

  const breakdown = rubric.map((p, i) => {
    if (i === 0 && required.length > 0) {
      return { label: p.label, got: usedAll ? p.max : usedAny ? Math.max(0, p.max - 1) : 0, max: p.max };
    }
    return { label: p.label, got: 0, max: p.max };
  });

  return {
    isCorrect: score >= 3,
    score,
    maxScore,
    breakdown,
    errorType: score >= 3 ? undefined : 'comprehension',
    reason: score >= 3 ? '基本达意' : '译文与参考差异较大或未使用必用词',
  };
}

/** 翻译题：按给分点打 0~5 分，避免全盘否认用户答案 */
async function gradeTranslation(
  config: AiConfig,
  question: Question,
  userAnswer: string
): Promise<GradeResult> {
  const required = question.requiredTerms ?? [];
  const rubric =
    question.rubric && question.rubric.length > 0 ? question.rubric : defaultRubric(required);
  const maxScore = rubric.reduce((s, p) => s + p.max, 0) || 5;
  const rubricText = rubric.map((p) => `- ${p.label}（${p.max} 分）`).join('\n');
  const requiredText = required.length > 0 ? required.join('、') : '（无）';
  const typeList = ERROR_KEYS.map((k) => `${k}=${ERROR_TYPE_LABEL[k]}`).join('、');

  const prompt = `请为一道英语翻译题打分（0~5 分）。必须按给分点逐点给分，避免全盘否认学习者的答案。

【题干】${question.prompt}
【必用词】${requiredText}
【参考译文】${question.correctAnswer}
【学习者译文】${userAnswer}

【给分点】
${rubricText}

【要求】
1. 逐点给分：每点给 0~该点 max 的整数分，score 为各点得分之和（0~5 整数）。
2. 学习者未使用必用词时，「正确使用必用词」点必须记 0 分。
3. 意思基本准确即算对，不要求与参考译文逐字一致；小语法瑕疵不要整题判 0 分。
4. 5 分表示与参考译文等价且语法正确；0 分表示完全无法达意或完全未使用必用词。
5. reason 用一句中文说明主要扣分点（不超过 40 字）；errorType 仅在 score < 5 时填写。

【可选 errorType】${typeList}

【输出】只输出 JSON，不要其他文字：
{"score":4,"breakdown":[{"label":"正确使用必用词 have","got":2,"max":2},{"label":"语义准确完整","got":1,"max":2},{"label":"语法正确","got":1,"max":1}],"reason":"…","errorType":"语法用错"}`;

  try {
    const content = await completeText(config, prompt, { temperature: 0, maxTokens: 260 });
    const parsed = extractJson(content) as {
      score?: unknown;
      breakdown?: unknown;
      reason?: unknown;
      errorType?: unknown;
    };
    const rawScore = Number(parsed?.score);
    if (!Number.isFinite(rawScore)) return localTranslateScore(question, userAnswer);
    const score = Math.max(0, Math.min(maxScore, Math.round(rawScore)));

    const breakdown = Array.isArray(parsed?.breakdown)
      ? (parsed.breakdown as unknown[]).map(parseBreakdown).filter(Boolean) as ScoreBreakdown[]
      : [];

    const isCorrect = score >= 3;
    return {
      isCorrect,
      score,
      maxScore,
      breakdown: breakdown.length > 0 ? breakdown : undefined,
      errorType: isCorrect ? undefined : coerceErrorType(parsed?.errorType),
      reason: String(parsed?.reason ?? '').trim() || undefined,
    };
  } catch {
    return localTranslateScore(question, userAnswer);
  }
}

/** 语法填空题：AI 批改（对错 + 归因），填空形式须与正确答案一致 */
async function gradeFillIn(
  config: AiConfig,
  question: Question,
  userAnswer: string
): Promise<GradeResult> {
  const typeList = ERROR_KEYS.map((k) => `${k}=${ERROR_TYPE_LABEL[k]}`).join('、');

  const prompt = `请批改一道英语语法填空题。

【题型】语法填空
【题干】${question.prompt}
【正确答案】${question.correctAnswer}
【学习者答案】${userAnswer}

【判定标准】学习者可能只填空位处的单词，也可能填入完整句子，两者都接受。请只判断每个空位填入的形式是否正确（时态、语态、单复数、拼写须正确）；接受合理的可替换形式，仅大小写或标点等无关紧要的差异不算错。

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
    const want = normalize(question.correctAnswer);
    const got = normalize(userAnswer);
    if (!got) return { isCorrect: false, errorType: 'grammar', reason: '未作答' };
    return {
      isCorrect: want === got,
      errorType: want === got ? undefined : 'grammar',
      reason: want === got ? undefined : '与正确答案不一致',
    };
  }
}

/** 自由文本作答（翻译/语法填空）：翻译按给分点打 0~5 分，语法填空判对错 */
export async function gradeFreeText(params: {
  config: AiConfig;
  question: Question;
  userAnswer: string;
}): Promise<GradeResult> {
  const { config, question, userAnswer } = params;
  if (question.type === 'translation') {
    return gradeTranslation(config, question, userAnswer);
  }
  return gradeFillIn(config, question, userAnswer);
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

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
  if ((ERROR_KEYS as string[]).includes(s)) return s as ErrorType;
  // 兼容 AI 直接输出中文标签（如「时态/语态」）的情况
  const byLabel = ERROR_KEYS.find((k) => ERROR_TYPE_LABEL[k] === s);
  return byLabel ?? 'other';
}

function coerceType(v: unknown): QuestionType {
  const s = String(v ?? '').trim() as QuestionType;
  const all: QuestionType[] = ['meaning', 'spelling', 'derivative', ...AI_ONLY_TYPES];
  return all.includes(s) ? s : 'cloze';
}

/** 选择题题型：必须带 options，否则 UI 会退化成填空（如「完形填空没选项」） */
const CHOICE_TYPES: QuestionType[] = ['meaning', 'derivative', 'cloze', 'reading'];

/** 兜底干扰项：常见英语词库，避免用「训练词」当干扰项（否则会泄露「正在考这些词」） */
const GENERIC_DISTRACTORS = [
  'make', 'take', 'give', 'have', 'say', 'see', 'look', 'go', 'come', 'know',
  'think', 'want', 'use', 'find', 'tell', 'ask', 'work', 'feel', 'try', 'leave',
  'call', 'need', 'become', 'mean', 'keep', 'let', 'begin', 'help', 'talk', 'turn',
  'start', 'show', 'hear', 'play', 'run', 'move', 'like', 'live', 'hold', 'bring',
  'happen', 'write', 'sit', 'stand', 'lose', 'pay', 'meet', 'set', 'learn', 'change',
  'lead', 'watch', 'follow', 'stop', 'speak', 'read', 'spend', 'grow', 'open', 'walk',
  'win', 'offer', 'remember', 'buy', 'wait', 'send', 'expect', 'build', 'stay', 'fall',
];

/** 兜底：AI 漏给/少给选项时，用正确答案 + 常见词干扰项，保证选择题始终有选项 */
function buildChoiceOptions(correctAnswer: string): string[] | undefined {
  const correct = correctAnswer.trim();
  if (!correct) return undefined;
  const distractors = shuffle(
    GENERIC_DISTRACTORS.filter((t) => normalize(t) !== normalize(correct))
  ).slice(0, 3);
  const opts = shuffle([correct, ...distractors]);
  return opts.length >= 2 ? opts : undefined;
}

/**
 * 完形填空若把多个空塞进同一道题（一篇短文多个 ____，却只给一组选项），
 * 拆成多道「单空选择题」：每空一道、各带 4 个选项，避免多个空挤在同一选项里。
 * 拆不出与空数一致的答案时丢弃该畸形题（返回空数组，由兜底/重试补充）。
 */
function splitMultiBlankCloze(question: Question): Question[] {
  if (question.type !== 'cloze') return [question];
  const inPassage = (question.passage ?? '').includes('____');
  const body = inPassage ? question.passage ?? '' : question.prompt;
  const blankCount = (body.match(/_{3,}/g) ?? []).length;
  if (blankCount <= 1) return [question];

  // 正确答案里可能把多个空的答案用分隔符连在一起，尝试拆开
  const answers = question.correctAnswer
    .split(/\s*[\/;；,，|]\s*|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (answers.length !== blankCount) return [];

  const pieces = body.split(/_{3,}/);
  const result: Question[] = [];
  for (let i = 0; i < blankCount; i++) {
    // 本空保留 ____，其余空用各自正确答案回填
    let rebuilt = '';
    for (let j = 0; j < blankCount; j++) {
      rebuilt += pieces[j] + (j === i ? '____' : answers[j]);
    }
    rebuilt += pieces[blankCount];

    const ans = answers[i];
    const opts = buildChoiceOptions(ans);
    if (!opts) continue;
    result.push({
      ...question,
      id: qid(),
      passage: inPassage ? rebuilt : question.passage,
      prompt: inPassage ? question.prompt : rebuilt,
      correctAnswer: ans,
      options: opts,
    });
  }
  return result;
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

  // 设备端小模型出题能力弱、推理慢：少出几道、少生成一些，避免又慢又跑偏
  const isDevice = config.provider === 'device';
  const actualCount = isDevice ? Math.min(count, 3) : count;
  const maxTokens = isDevice ? 900 : 1800;

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
【题型】只使用这些题型：${typeList}。共出 ${actualCount} 道题。
${injectionBlock}
【每题字段（必须严格遵守，程序依赖这些字段）】
- requirement：题目要求，一句话（如「用括号中单词的正确形式填空。」）。**只能放要求本身，禁止把要求文字或题号写进 stem。**
- stem：题干。只有 stem 里可以出现空格标记（____ 或 ___(原形)）；题干不要带「第几题」「请作答」之类的话。
- options：选择题的 4 个选项；填空题 / 翻译题必须留空数组 []。
- correctAnswer：参考答案。**必须与 stem 严格对应**：把 stem 里的每个空依次换成正确形式后，去掉空格标记，就是 correctAnswer（空格数、顺序、标点都要对得上）。
- requiredTerms：翻译题必用词；其它题型留空数组。
- rubric：翻译题给分点；其它题型留空数组。
- explanation：一句中文解析，只讲本题考点。
- timeLimit（可选）：本题建议限时秒数（整数，如 30）；不填表示不限时。
- score（可选）：本题满分（整数，如 5）。

【出题要求】
1. 难度「刚刚好超出」学习者当前水平：用已掌握词汇做背景，只考查少量新词/易错点。
2. 若「个性化要求」指出了特定错误倾向，必须专门设计能暴露并纠正该错误的题目（这是本次出题的核心）。
3. 每题只考查一个点；explanation 只解释本题真正考查的那个点（targetTerms 对应的词或语法），严禁顺带讲解题干中其它无关词汇的用法。
4. 完形填空：60~120 词短文，全篇只保留 1 个空（用 ____ 表示这唯一的空），并给出 4 个选项（只针对这一个空）。严禁在一道完形填空里放多个空。
5. 阅读理解：100~160 词短文 + 只设 1 个问题 + 4 个选项。
6. 语法填空：requirement 固定写「用括号中单词的正确形式填空。」；stem 为单句或短句，每个空写成 ___(原形)（括号里给原形，例如 I ___(have) an apple. She ___(have) an apple too.）；options 留空；correctAnswer 填把每个空换成正确形式后的完整句子，且必须与 stem 逐字对应（多个空时整段给出）。
7. 翻译：requirement 写「把下面这句话翻译成英文」（若有必用词再补一句「必须用到括号中的词」）；stem 只放要翻译的那句中文；必须指定 1~2 个必用词（来自【本次训练单词】，写入 requiredTerms）；必须自行为本题划分 rubric（每点含 label 与 max，所有 max 之和必须恰好等于 5，且必须包含「正确使用必用词」这一点）；correctAnswer 给参考译文（必须包含必用词）。
8. 选择题的 4 个选项必须是同一词性、语义相近或易混淆的词/短语；严禁把【本次训练单词】里的词直接当作干扰项（那样会泄露答案），干扰项应来自学习者已掌握词汇的自然语境。correctAnswer 必须与 options 中的某一项完全一致。
9. targetTerms 填该题实际考查的单词（小写，来自上面的训练单词）。
10. 必须围绕【本次训练单词】出题；下面的示例仅供 JSON 格式参考，严禁照抄示例内容（不要出现 have / apple 等与训练单词无关的内容）。

【输出格式】只输出一个 JSON 对象，不要任何额外文字：
{"questions":[
  {"type":"grammar","requirement":"用括号中单词的正确形式填空。","stem":"I ___(have) an apple. She ___(have) an apple too.","options":[],"correctAnswer":"I have an apple. She has an apple too.","explanation":"第一空主语是 I 用原形 have，第二空主语 She 用三单 has。","timeLimit":30,"targetTerms":["have"]},
  {"type":"translation","requirement":"把下面这句话翻译成英文，必须用到括号中的词。","stem":"我有一个苹果。","options":[],"requiredTerms":["have"],"correctAnswer":"I have an apple.","rubric":[{"label":"正确使用必用词 have","max":2},{"label":"语义准确完整","max":2},{"label":"语法正确","max":1}],"explanation":"…","score":5,"targetTerms":["have"]}
]}`;

  const content = await completeText(config, prompt, { temperature: 0.85, maxTokens });
  const parsed = extractJson(content) as { questions?: unknown };
  const raw = Array.isArray(parsed?.questions) ? parsed.questions : [];

  const wordSet = new Set(words.map((w) => w.term.toLowerCase()));
  const out: Question[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    // 题干优先取 stem（新结构）；兼容旧的 prompt 字段；题目要求单独取 requirement
    const requirement = String(item?.requirement ?? '').trim() || undefined;
    const promptText = String(item?.stem ?? item?.prompt ?? '').trim();
    const correctAnswer = String(item?.correctAnswer ?? '').trim();
    if (!promptText || !correctAnswer) continue;

    const rawTimeLimit = Number(item?.timeLimit);
    const timeLimit =
      Number.isFinite(rawTimeLimit) && rawTimeLimit > 0 ? Math.round(rawTimeLimit) : undefined;
    const rawScore = Number(item?.score);
    const score = Number.isFinite(rawScore) && rawScore > 0 ? Math.round(rawScore) : undefined;

    const type = coerceType(item?.type);
    const passage = String(item?.passage ?? '').trim() || undefined;

    const parsedOptions = Array.isArray(item?.options)
      ? (item.options as unknown[]).map((o) => String(o)).filter((o) => o.length > 0)
      : [];
    const options =
      parsedOptions.length >= 2
        ? parsedOptions
        : CHOICE_TYPES.includes(type)
        ? buildChoiceOptions(correctAnswer) ?? []
        : [];

    const rawTargets = Array.isArray(item?.targetTerms)
      ? (item.targetTerms as unknown[]).map((t) => String(t).toLowerCase())
      : [];

    // 只保留真正考查训练词的题：先看 AI 给的 targetTerms，再看题目内容里命中的训练词；
    // 都不中（如小模型照抄了示例 have/apple）则丢弃
    const contentText = `${promptText} ${passage ?? ''} ${correctAnswer}`.toLowerCase();
    const targetTerms = (() => {
      const hit = rawTargets.filter((t) => wordSet.has(t));
      if (hit.length > 0) return Array.from(new Set(hit));
      return Array.from(
        new Set(
          words
            .filter((w) => contentText.includes(w.term.toLowerCase()))
            .map((w) => w.term.toLowerCase())
        )
      );
    })();
    if (targetTerms.length === 0) continue;

    const requiredTerms = Array.isArray(item?.requiredTerms)
      ? (item.requiredTerms as unknown[])
          .map((t) => String(t).toLowerCase().trim())
          .filter((t) => t.length > 0)
      : [];

    const question: Question = {
      id: qid(),
      type,
      source: 'ai',
      requirement,
      prompt: promptText,
      passage,
      options: options.length >= 2 ? options : undefined,
      correctAnswer,
      explanation: String(item?.explanation ?? '').trim() || undefined,
      targetTerms,
      timeLimit,
      score,
      difficulty,
    };

    if (type === 'translation') {
      // 必用词只保留训练词；AI 漏给或乱给时回退到目标单词
      const relReq = requiredTerms.filter((t) => wordSet.has(t));
      question.requiredTerms = relReq.length > 0 ? relReq : question.targetTerms.slice(0, 1);
      question.rubric = normalizeRubric(item?.rubric, question.requiredTerms);
    }

    out.push(...splitMultiBlankCloze(question));
    if (out.length >= actualCount) break;
  }

  if (out.length === 0) {
    throw new Error('AI 未能生成与本次单词相关的题目，请重试');
  }
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
    reason: score >= 3 ? undefined : '译文与参考差异较大或未使用必用词',
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
5. reason 只写「扣分点」：直接指出错在哪儿、应怎么改（不超过 40 字）；满分（5 分）时留空字符串。严禁先肯定后转折、严禁提及任何做对或正确的部分——「必用词用对了，但时态错」「意思基本正确，只是…」这类写法都是错的；只能写错误本身，例如「时态错：have 应为 had」「未使用必用词 have」。errorType 仅在 score < 5 时填写，用等号左边的 key。

【可选 errorType】${typeList}

【输出】只输出 JSON，不要其他文字：
{"score":4,"breakdown":[{"label":"正确使用必用词 have","got":2,"max":2},{"label":"语义准确完整","got":2,"max":2},{"label":"语法正确","got":0,"max":1}],"reason":"时态错：have 应为 had","errorType":"tense_voice"}`;

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

// AI 出题闭环的领域类型定义（本地优先：除大模型调用外全部本地运行）

/** 题型 */
export type QuestionType =
  | 'meaning' // 选释义（本地）
  | 'spelling' // 看释义拼单词（本地）
  | 'derivative' // 词族/派生词（本地）
  | 'cloze' // 完形填空（短）
  | 'reading' // 阅读理解
  | 'grammar' // 语法填空
  | 'translation'; // 翻译

/** 仅 AI 可生成的高级题型 */
export const AI_ONLY_TYPES: QuestionType[] = ['cloze', 'reading', 'grammar', 'translation'];

/** 错误归因类型 */
export type ErrorType =
  | 'meaning_confusion' // 词义混淆
  | 'spelling' // 拼写错误
  | 'grammar' // 语法用错
  | 'comprehension' // 理解偏差
  | 'collocation' // 搭配错误
  | 'tense_voice' // 时态/语态
  | 'unknown' // 未掌握：学习者主动选「不会」，不做 AI 归因，避免乱填造成误判
  | 'other'; // 其它

export const ERROR_TYPE_LABEL: Record<ErrorType, string> = {
  meaning_confusion: '词义混淆',
  spelling: '拼写错误',
  grammar: '语法用错',
  comprehension: '理解偏差',
  collocation: '搭配错误',
  tense_voice: '时态/语态',
  unknown: '未掌握',
  other: '其它',
};

/** 交给 AI 归因时可选的类型（'unknown' 由「不会」按钮直接产生，不让 AI 猜） */
export const AI_ERROR_TYPES: ErrorType[] = [
  'meaning_confusion',
  'spelling',
  'grammar',
  'comprehension',
  'collocation',
  'tense_voice',
  'other',
];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  meaning: '选释义',
  spelling: '拼写填空',
  derivative: '词族派生',
  cloze: '完形填空',
  reading: '阅读理解',
  grammar: '语法填空',
  translation: '翻译',
};

/** 提示词库层级 */
export type PromptLayer = 'core' | 'recent' | 'temp';

export const PROMPT_LAYER_LABEL: Record<PromptLayer, string> = {
  core: '核心层（长期薄弱点）',
  recent: '近期层（最近 3 天错误）',
  temp: '临时层（本次会话错误）',
};

/** A/B 实验分组：A=采纳 AI 建议组，B=常规复习组 */
export type AbGroup = 'A' | 'B';

export type Question = {
  id: string;
  type: QuestionType;
  source: 'local' | 'ai';
  /** 题干（选择题为提示语，填空/翻译为待作答内容，用 ____ 表示空） */
  prompt: string;
  /** 短文（阅读理解/完形填空使用） */
  passage?: string;
  /** 选择题选项；非选择题为空 */
  options?: string[];
  /** 正确答案（选择题为选项文本，其它为参考答案） */
  correctAnswer: string;
  /** 解析 */
  explanation?: string;
  /** 关联的目标单词（小写） */
  targetTerms: string[];
  /** 难度 0~1 */
  difficulty: number;
};

export type Attempt = {
  id: string;
  at: number;
  questionId: string;
  questionType: QuestionType;
  source: 'local' | 'ai';
  targetTerms: string[];
  prompt: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  /** AI 错误归因（仅答错时才有） */
  errorType?: ErrorType;
  errorReason?: string;
  group: AbGroup;
};

/** 分层提示词库条目 */
export type PromptEntry = {
  id: string;
  layer: PromptLayer;
  /** 注入给出题模型的提示语 */
  text: string;
  errorType?: ErrorType;
  /** 关联标签：单词或语法点（小写） */
  tags: string[];
  /** 已注入次数 */
  hitCount: number;
  /** 采纳后相关题的答对/答错统计（用于验证掌握） */
  correctAfter: number;
  wrongAfter: number;
  source: 'advice' | 'auto';
  createdAt: number;
  updatedAt: number;
};

/** 学习建议 */
export type Advice = {
  id: string;
  at: number;
  title: string;
  detail: string;
  /** 采纳后写入提示词库的文本 */
  promptText: string;
  errorType?: ErrorType;
  tags: string[];
  adopted: boolean;
};

/** 本地「等级管理」：知识点掌握度 */
export type Proficiency = {
  level: number; // 0~7，与记忆盒语义一致
  updatedAt: number;
};

export type AiqState = {
  attempts: Attempt[];
  entries: PromptEntry[];
  advice: Advice[];
  /** A/B 分组（首次使用时本地随机确定） */
  group: AbGroup;
  /** 知识点掌握度（本地等级管理） */
  proficiency: Record<string, Proficiency>;
  lastSessionAt?: number;
};

export function emptyState(): AiqState {
  return {
    attempts: [],
    entries: [],
    advice: [],
    group: 'A',
    proficiency: {},
  };
}

/** 状态上限，避免本地存储无限增长 */
export const LIMITS = {
  attempts: 600,
  entries: 120,
  advice: 40,
  recentErrorDays: 3,
};

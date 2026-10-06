import { LevelKey } from '../data/levelTestWords';

export type Word = {
  id: string;
  term: string; // 英文单词
  meaning: string; // 中文释义
  phonetic?: string; // 音标
  example?: string; // 例句
  derivatives?: { term: string; meaning: string }[]; // 派生词（词族）
  level?: LevelKey; // 单词所属级别（初中/高中/四级/六级/专四/专八/GRE）
  box: number; // 当前 Leitner 记忆盒层级（0 = 新词）
  dueAt: number; // 下次复习时间戳（ms）
  correctCount: number; // 累计答对次数
  wrongCount: number; // 累计答错次数
  lastReviewedAt?: number;
  history?: ReviewRecord[]; // 每次复习/测试记录（时间 + 结果 + 之后等级）
  createdAt: number;
};

export type Wordbook = {
  id: string;
  name: string;
  description?: string;
  builtinKey?: string; // 若为内置词库，记录其 key（如 'cet4'）
  createdAt: number;
  words: Word[];
};

export type ReviewResult = 'again' | 'hard' | 'good';

export type ReviewRecord = {
  at: number; // 复习时间戳
  result: ReviewResult; // 本次结果
  box: number; // 本次复习后的记忆盒等级
};

export type PickMode = 'sequential' | 'random';

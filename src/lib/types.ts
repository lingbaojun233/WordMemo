export type Word = {
  id: string;
  term: string; // 英文单词
  meaning: string; // 中文释义
  phonetic?: string; // 音标
  example?: string; // 例句
  box: number; // 当前 Leitner 记忆盒层级（0 = 新词）
  dueAt: number; // 下次复习时间戳（ms）
  correctCount: number; // 累计答对次数
  wrongCount: number; // 累计答错次数
  lastReviewedAt?: number;
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

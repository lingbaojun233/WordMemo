import { LevelKey } from '../../data/levelTestWords';
import { isDue, isNew } from '../srs';
import { Word } from '../types';
import { Attempt, AiqState, ERROR_TYPE_LABEL, ErrorType } from './types';

const DAY = 24 * 60 * 60 * 1000;

/** 最近 N 天的作答记录 */
export function recentAttempts(attempts: Attempt[], days = 3, now = Date.now()): Attempt[] {
  const from = now - days * DAY;
  return attempts.filter((a) => a.at >= from);
}

/** 错误类型分布（只统计答错） */
export function errorTypeStats(
  attempts: Attempt[]
): { type: ErrorType; label: string; count: number }[] {
  const map = new Map<ErrorType, number>();
  for (const a of attempts) {
    if (a.isCorrect) continue;
    const t = a.errorType ?? 'other';
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, label: ERROR_TYPE_LABEL[type], count }))
    .sort((a, b) => b.count - a.count);
}

export type WeakTerm = { term: string; wrong: number; total: number; rate: number };

/** 高频错词排行（近 N 天），rate 越高越薄弱 */
export function weakTerms(attempts: Attempt[], days = 14, now = Date.now()): WeakTerm[] {
  const from = now - days * DAY;
  const map = new Map<string, { wrong: number; total: number }>();
  for (const a of attempts) {
    if (a.at < from) continue;
    for (const t of a.targetTerms) {
      const cur = map.get(t) ?? { wrong: 0, total: 0 };
      cur.total += 1;
      if (!a.isCorrect) cur.wrong += 1;
      map.set(t, cur);
    }
  }
  return Array.from(map.entries())
    .map(([term, v]) => ({ term, wrong: v.wrong, total: v.total, rate: v.total ? v.wrong / v.total : 0 }))
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.rate - a.rate);
}

/**
 * 选取本次训练单词：遗忘曲线到期优先 → 历史高频错词 → 其余。
 * 纯本地计算，无网络与大模型依赖。
 */
export function pickTrainingWords(
  words: Word[],
  attempts: Attempt[],
  count: number,
  now = Date.now()
): Word[] {
  const weak = new Map(weakTerms(attempts, 14, now).map((w) => [w.term, w.wrong]));
  const due = words.filter((w) => !isNew(w) && isDue(w, now));
  const rest = words.filter((w) => !due.some((d) => d.id === w.id));

  const rank = (w: Word) => weak.get(w.term.toLowerCase()) ?? 0;

  const pool = [
    ...due.sort((a, b) => rank(b) - rank(a) || a.dueAt - b.dueAt),
    ...rest.sort((a, b) => rank(b) - rank(a)),
  ];
  return pool.slice(0, Math.max(0, count));
}

const LEVEL_BASE: Record<LevelKey, number> = {
  junior: 0.25,
  senior: 0.35,
  cet4: 0.45,
  cet6: 0.55,
  tem4: 0.62,
  tem8: 0.7,
  gre: 0.78,
};

/**
 * 目标难度：以自测词汇水平为基准，再按最近正确率微调，
 * 使题目「刚刚好超出当前水平一点」。
 */
export function targetDifficulty(level: LevelKey | null, attempts: Attempt[]): number {
  const base = level ? LEVEL_BASE[level] ?? 0.5 : 0.4;
  const recent = attempts.slice(-30);
  if (recent.length < 5) return Math.min(0.85, base + 0.05);

  const acc = recent.filter((a) => a.isCorrect).length / recent.length;
  // 正确率高 -> 提高难度；正确率低 -> 降低难度
  const delta = (acc - 0.75) * 0.4;
  return Math.max(0.2, Math.min(0.9, base + delta));
}

/** 本地「等级管理」：按知识点维护掌握度（0~7） */
export function updateProficiency(
  state: AiqState,
  tags: string[],
  isCorrect: boolean,
  now = Date.now()
): AiqState {
  if (tags.length === 0) return state;
  const proficiency = { ...state.proficiency };
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    const prev = proficiency[tag]?.level ?? 0;
    const level = isCorrect ? Math.min(7, prev + 1) : Math.max(0, prev);
    proficiency[tag] = { level, updatedAt: now };
  }
  return { ...state, proficiency };
}

export type AbBucket = { attempts: number; wrong: number; errorRate: number };

export type AbMetrics = {
  /** 采纳建议覆盖的话题（实验组） */
  treatment: AbBucket;
  /** 未覆盖的话题（对照组） */
  control: AbBucket;
  /** 同一批话题：采纳建议前 vs 采纳后 */
  before: AbBucket;
  after: AbBucket;
  adviceCount: number;
};

function bucket(list: Attempt[]): AbBucket {
  const attempts = list.length;
  const wrong = list.filter((a) => !a.isCorrect).length;
  return { attempts, wrong, errorRate: attempts ? wrong / attempts : 0 };
}

/**
 * A/B 验证（单机可用）：以「是否被已采纳的建议覆盖」划分实验/对照，
 * 并给出同一批知识点在「采纳前后」的错误率对比。
 */
export function abMetrics(state: AiqState): AbMetrics {
  const adopted = state.entries.filter((e) => e.source === 'advice' && e.layer === 'core');
  const coveredTags = new Set(adopted.flatMap((e) => e.tags));
  const adoptedAt = new Map<string, number>();
  for (const e of adopted) {
    for (const t of e.tags) {
      adoptedAt.set(t, Math.max(adoptedAt.get(t) ?? 0, e.createdAt));
    }
  }

  const treatment: Attempt[] = [];
  const control: Attempt[] = [];
  const before: Attempt[] = [];
  const after: Attempt[] = [];

  for (const a of state.attempts) {
    const tags = a.targetTerms.map((t) => t.toLowerCase());
    const hit = tags.some((t) => coveredTags.has(t));
    if (hit) {
      treatment.push(a);
      const cut = Math.max(...tags.map((t) => adoptedAt.get(t) ?? 0));
      if (cut > 0) (a.at >= cut ? after : before).push(a);
    } else {
      control.push(a);
    }
  }

  return {
    treatment: bucket(treatment),
    control: bucket(control),
    before: bucket(before),
    after: bucket(after),
    adviceCount: adopted.length,
  };
}

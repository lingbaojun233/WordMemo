import { Advice, AiqState, ErrorType, PromptEntry, PromptLayer } from './types';

// 分层提示词库：闭环的「记忆」。
// 生命周期：
//   会话内答错        -> temp（临时层，仅本次会话注入）
//   会话结束          -> temp 归并进 recent（近期层，最近 3 天）
//   recent 超过 3 天  -> 仍在错则升入 core（核心层，长期薄弱点），已掌握则淘汰
//   用户采纳 AI 建议   -> 直接写入 core（用户显式选择的长期纠正）

const DAY = 24 * 60 * 60 * 1000;
const RECENT_KEEP_DAYS = 3;

let seq = 0;
function eid(): string {
  seq += 1;
  return `pe_${Date.now().toString(36)}_${seq}`;
}

/** 同层内：错得多、较新的更靠前 */
function score(e: PromptEntry, now: number): number {
  const ageDays = Math.max(0, (now - e.updatedAt) / DAY);
  const recency = Math.max(0, 1 - ageDays / 10);
  const pain = e.wrongAfter - e.correctAfter;
  return pain * 2 + recency * 3 + e.hitCount * 0.2;
}

function sortByScore(entries: PromptEntry[], now: number): PromptEntry[] {
  return [...entries].sort((a, b) => score(b, now) - score(a, now));
}

/** 插入或合并一条提示（按文本去重） */
export function upsertEntry(
  state: AiqState,
  input: {
    text: string;
    layer: PromptLayer;
    errorType?: ErrorType;
    tags: string[];
    source?: 'advice' | 'auto';
  },
  now = Date.now()
): AiqState {
  const text = input.text.trim();
  if (!text) return state;

  const idx = state.entries.findIndex((e) => e.text === text);
  if (idx >= 0) {
    const entries = [...state.entries];
    const prev = entries[idx];
    entries[idx] = {
      ...prev,
      layer: input.layer === 'core' ? 'core' : prev.layer,
      tags: Array.from(new Set([...prev.tags, ...input.tags])),
      errorType: input.errorType ?? prev.errorType,
      updatedAt: now,
    };
    return { ...state, entries };
  }

  const entry: PromptEntry = {
    id: eid(),
    layer: input.layer,
    text,
    errorType: input.errorType,
    tags: Array.from(new Set(input.tags.map((t) => t.toLowerCase()))),
    hitCount: 0,
    correctAfter: 0,
    wrongAfter: 0,
    source: input.source ?? 'auto',
    createdAt: now,
    updatedAt: now,
  };
  return { ...state, entries: [...state.entries, entry] };
}

/** 采纳的建议写入核心层（下次出题必注入） */
export function adoptAdvice(state: AiqState, advice: Advice, now = Date.now()): AiqState {
  let next = upsertEntry(
    state,
    {
      text: advice.promptText,
      layer: 'core',
      errorType: advice.errorType,
      tags: advice.tags,
      source: 'advice',
    },
    now
  );
  next = {
    ...next,
    advice: next.advice.map((a) => (a.id === advice.id ? { ...a, adopted: true } : a)),
  };
  return next;
}

/** 会话结束：临时层归并进近期层，并对近期层做老化（升级/淘汰） */
export function closeSession(state: AiqState, now = Date.now()): AiqState {
  const entries: PromptEntry[] = [];

  for (const e of state.entries) {
    if (e.layer === 'temp') {
      // 临时层 -> 近期层
      entries.push({ ...e, layer: 'recent', updatedAt: now });
      continue;
    }
    if (e.layer === 'recent') {
      const ageDays = (now - e.updatedAt) / DAY;
      if (ageDays > RECENT_KEEP_DAYS) {
        // 超期：仍没掌握则升入核心层，否则淘汰
        if (e.wrongAfter >= e.correctAfter && e.wrongAfter > 0) {
          entries.push({ ...e, layer: 'core', updatedAt: now });
        }
        continue;
      }
    }
    entries.push(e);
  }

  // 合并重复文本（临时层归并后可能与已有条目重复）
  const merged = new Map<string, PromptEntry>();
  for (const e of entries) {
    const prev = merged.get(e.text);
    if (!prev) {
      merged.set(e.text, e);
      continue;
    }
    const layer: PromptLayer =
      prev.layer === 'core' || e.layer === 'core'
        ? 'core'
        : prev.layer === 'recent' || e.layer === 'recent'
        ? 'recent'
        : 'temp';
    merged.set(e.text, {
      ...prev,
      layer,
      hitCount: prev.hitCount + e.hitCount,
      correctAfter: prev.correctAfter + e.correctAfter,
      wrongAfter: prev.wrongAfter + e.wrongAfter,
      tags: Array.from(new Set([...prev.tags, ...e.tags])),
      updatedAt: Math.max(prev.updatedAt, e.updatedAt),
    });
  }

  return { ...state, entries: Array.from(merged.values()) };
}

function render(entries: PromptEntry[]): string {
  return entries.map((e) => `- ${e.text}`).join('\n');
}

export type InjectionResult = {
  text: string;
  usedIds: string[];
  byLayer: Record<PromptLayer, number>;
};

/**
 * 按优先级注入提示词，控制在字符预算内（近似 token 预算）。
 * 预算分配：核心 40% / 近期 35% / 临时 25%；核心层为「每次必注入」的长期薄弱点。
 */
export function buildInjection(
  entries: PromptEntry[],
  opts: { maxChars?: number; now?: number } = {}
): InjectionResult {
  const maxChars = opts.maxChars ?? 900;
  const now = opts.now ?? Date.now();

  const budget: Record<PromptLayer, number> = {
    core: Math.floor(maxChars * 0.4),
    recent: Math.floor(maxChars * 0.35),
    temp: Math.floor(maxChars * 0.25),
  };

  const usedIds: string[] = [];
  const picked: Record<PromptLayer, PromptEntry[]> = { core: [], recent: [], temp: [] };

  for (const layer of ['core', 'recent', 'temp'] as PromptLayer[]) {
    let used = 0;
    for (const e of sortByScore(
      entries.filter((x) => x.layer === layer),
      now
    )) {
      const cost = e.text.length + 3; // "- " 前缀
      if (used + cost > budget[layer]) continue;
      used += cost;
      picked[layer].push(e);
      usedIds.push(e.id);
    }
  }

  const parts: string[] = [];
  if (picked.core.length > 0) {
    parts.push(`【长期薄弱点（必须重点针对）】\n${render(picked.core)}`);
  }
  if (picked.recent.length > 0) {
    parts.push(`【近期易错点（最近 3 天）】\n${render(picked.recent)}`);
  }
  if (picked.temp.length > 0) {
    parts.push(`【本次会话已暴露的问题】\n${render(picked.temp)}`);
  }

  return {
    text: parts.join('\n\n'),
    usedIds,
    byLayer: {
      core: picked.core.length,
      recent: picked.recent.length,
      temp: picked.temp.length,
    },
  };
}

export function recordHit(state: AiqState, ids: string[], now = Date.now()): AiqState {
  if (ids.length === 0) return state;
  const set = new Set(ids);
  return {
    ...state,
    entries: state.entries.map((e) =>
      set.has(e.id) ? { ...e, hitCount: e.hitCount + 1, updatedAt: now } : e
    ),
  };
}

/** 记录某次作答结果，回写到相关标签的提示条目（用于验证掌握 / A-B 对比） */
export function recordOutcome(
  state: AiqState,
  tags: string[],
  isCorrect: boolean
): AiqState {
  if (tags.length === 0) return state;
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  return {
    ...state,
    entries: state.entries.map((e) => {
      if (!e.tags.some((t) => wanted.has(t))) return e;
      return isCorrect
        ? { ...e, correctAfter: e.correctAfter + 1 }
        : { ...e, wrongAfter: e.wrongAfter + 1 };
    }),
  };
}

export function layerCounts(entries: PromptEntry[]): Record<PromptLayer, number> {
  return {
    core: entries.filter((e) => e.layer === 'core').length,
    recent: entries.filter((e) => e.layer === 'recent').length,
    temp: entries.filter((e) => e.layer === 'temp').length,
  };
}

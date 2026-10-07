import { GoalType, StudySettings } from './studySettings';
import { Wordbook } from './types';
import { formatDate } from './utils';

// 学习目标：本地计算「剩余天数 / 今日目标 / 连续学习 / 平均速度 / 预计完成日期」。
// 目标只需制定一次，之后是「修改」；截止日期是绝对日期，会随天数自然倒计时。

const DAY = 24 * 60 * 60 * 1000;

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type DailyStat = {
  date: number; // 当天零点时间戳
  day: string; // YYYY-MM-DD
  studied: number; // 当天学过的不同单词数（含复习，用于连续天数）
  learnedNew: number; // 当天首次达到「1-初识」的单词数（用于估算速度）
};

/** 统计最近 days 天的每日学习情况（不足的天补 0，保证连续序列） */
export function collectDailyStats(
  books: Wordbook[],
  days = 60,
  now = Date.now()
): DailyStat[] {
  const today = dayStart(now);
  const from = today - (days - 1) * DAY;

  const studiedMap = new Map<number, Set<string>>();
  const newMap = new Map<number, number>();
  // 进度按词形跨词本共享，同一单词可能出现在多个词本里，这里按词形去重避免重复计数
  const seen = new Set<string>();

  for (const b of books) {
    for (const w of b.words) {
      const history = w.history ?? [];
      if (history.length === 0) continue;
      const term = w.term.toLowerCase();
      if (seen.has(term)) continue;
      seen.add(term);

      // 首次达到 box >= 1 的时间 = 该词的「初学完成」
      let firstLearnedAt: number | null = null;
      for (const r of [...history].sort((x, y) => x.at - y.at)) {
        if (r.box >= 1) {
          firstLearnedAt = r.at;
          break;
        }
      }

      for (const r of history) {
        if (r.at < from) continue;
        const d = dayStart(r.at);
        const set = studiedMap.get(d) ?? new Set<string>();
        set.add(term);
        studiedMap.set(d, set);
      }

      if (firstLearnedAt != null && firstLearnedAt >= from) {
        const d = dayStart(firstLearnedAt);
        newMap.set(d, (newMap.get(d) ?? 0) + 1);
      }
    }
  }

  const out: DailyStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = today - i * DAY;
    out.push({
      date,
      day: formatDate(date),
      studied: studiedMap.get(date)?.size ?? 0,
      learnedNew: newMap.get(date) ?? 0,
    });
  }
  return out;
}

export type StreakInfo = {
  /** 连续学习天数（今天或昨天有学习才算连续） */
  streak: number;
  /** 距离上次学习过了几天（0 = 今天学过） */
  missedDays: number;
  lastStudyDate: number | null;
};

export function streakInfo(stats: DailyStat[], now = Date.now()): StreakInfo {
  const today = dayStart(now);
  const active = new Set(stats.filter((s) => s.studied > 0).map((s) => s.date));

  let streak = 0;
  let cursor = active.has(today) ? today : today - DAY;
  while (active.has(cursor)) {
    streak++;
    cursor -= DAY;
  }

  const lastStudyDate =
    stats
      .filter((s) => s.studied > 0)
      .map((s) => s.date)
      .sort((a, b) => b - a)[0] ?? null;

  const missedDays =
    lastStudyDate == null ? 0 : Math.max(0, Math.round((today - lastStudyDate) / DAY));

  return { streak, missedDays, lastStudyDate };
}

export type DailyPlan = {
  /** 今日目标词数 */
  target: number;
  /** 今天已学词数 */
  studiedToday: number;
  /** 今日还需学习词数 */
  remaining: number;
  /** 本词本还剩多少新词（box === 0） */
  newWordsLeft: number;
  /** 今日目标是否**真的**达成（今天已学 >= 今日目标） */
  goalMet: boolean;
  /** 单词本为空 */
  empty: boolean;
};

/**
 * 某个词本的「今日学习计划」。
 *
 * 这里刻意把两种情况分开：
 *  - `goalMet`：今天确实学够了今日目标 → 可以提示「今日目标已完成」
 *  - `newWordsLeft === 0`：本词本的单词都学过一遍了、没有新词可学
 * 后者**绝不能**显示成「已完成今日目标」（用户今天可能一次都没学）。
 */
export function dailyPlan(params: {
  book: Wordbook | null;
  books: Wordbook[];
  settings: StudySettings;
  now?: number;
}): DailyPlan {
  const { book, books, settings, now = Date.now() } = params;
  const plan = goalPlan({ book, books, settings, now });
  const newWordsLeft = book ? book.words.filter((w) => w.box === 0).length : 0;
  const remaining = Math.max(0, plan.dailyTarget - plan.studiedToday);
  return {
    target: plan.dailyTarget,
    studiedToday: plan.studiedToday,
    remaining,
    newWordsLeft,
    goalMet: remaining <= 0 && newWordsLeft > 0,
    empty: !book || book.words.length === 0,
  };
}

export type GoalPlan = {
  /** 是否已制定过目标（未制定时进入「制定」流程，之后是「修改」） */
  configured: boolean;
  mode: GoalType;
  dailyGoal: number;
  /** 绝对截止日期（毫秒），仅截止模式有意义 */
  deadlineAt: number | null;
  deadlineText: string | null;
  /** 含今天在内的剩余天数 */
  remainingDays: number;
  totalWords: number;
  remaining: number; // 还需完成初学的词数（box === 0）
  dailyTarget: number; // 今日需学
  studiedToday: number;
  /** 按目标推算的完成日期 */
  targetFinishAt: number | null;
  streak: number;
  missedDays: number;
  avgPerDay: number; // 过去平均每天新学词数
  activeDays: number; // 有过学习记录的天数
  projectedDays: number | null; // 按平均速度还需几天
  projectedDate: number | null; // 按平均速度的完成日期
  progressPct: number;
};

/**
 * 计算学习目标全景。
 * - 截止模式：截止日期固定，剩余天数每天自然递减，今日目标自动上调（剩余词数 / 剩余天数）。
 * - 每日模式：今日目标固定，按历史平均速度推算完成日期。
 */
export function goalPlan(params: {
  book: Wordbook | null;
  books: Wordbook[];
  settings: StudySettings;
  now?: number;
}): GoalPlan {
  const { book, books, settings } = params;
  const now = params.now ?? Date.now();
  const today = dayStart(now);

  const totalWords = book?.words.length ?? 0;
  const remaining = book ? book.words.filter((w) => w.box === 0).length : 0;

  const stats = collectDailyStats(books, 60, now);
  const { streak, missedDays } = streakInfo(stats, now);
  const studiedToday = stats.find((s) => s.date === today)?.studied ?? 0;

  // 平均速度：按「目标制定以来（最多 30 天）」的平均每天新学词数，跳过没学的天也算 0
  const goalStart = settings.goalConfiguredAt ? dayStart(settings.goalConfiguredAt) : null;
  const elapsed = goalStart == null ? 30 : Math.round((today - goalStart) / DAY) + 1;
  const windowDays = Math.max(1, Math.min(30, elapsed));
  const windowStats = stats.slice(-windowDays);
  const learnedInWindow = windowStats.reduce((s, d) => s + d.learnedNew, 0);
  const activeDays = windowStats.filter((d) => d.studied > 0).length;
  const avgPerDay = learnedInWindow / windowDays;

  // 截止日期：旧数据（只有 deadlineDays）自动折算成绝对日期，兼容升级
  let deadlineAt: number | null = null;
  if (settings.goalType === 'deadline') {
    deadlineAt =
      settings.deadlineAt ?? today + Math.max(1, settings.deadlineDays) * DAY;
  }

  const remainingDays =
    deadlineAt == null ? 0 : Math.max(1, Math.round((dayStart(deadlineAt) - today) / DAY));

  const dailyTarget =
    settings.goalType === 'deadline'
      ? Math.max(1, Math.ceil(remaining / Math.max(1, remainingDays)))
      : Math.max(1, settings.dailyGoal);

  const targetFinishAt =
    deadlineAt ?? (remaining > 0 ? today + Math.ceil(remaining / dailyTarget) * DAY : today);

  const projectedDays =
    avgPerDay > 0 ? Math.max(0, Math.ceil(remaining / avgPerDay)) : null;
  const projectedDate = projectedDays == null ? null : today + projectedDays * DAY;

  return {
    configured: Boolean(settings.goalConfiguredAt),
    mode: settings.goalType,
    dailyGoal: settings.dailyGoal,
    deadlineAt,
    deadlineText: deadlineAt == null ? null : formatDate(deadlineAt),
    remainingDays,
    totalWords,
    remaining,
    dailyTarget,
    studiedToday,
    targetFinishAt,
    streak,
    missedDays,
    avgPerDay,
    activeDays,
    projectedDays,
    projectedDate,
    progressPct: totalWords > 0 ? Math.round(((totalWords - remaining) / totalWords) * 100) : 0,
  };
}

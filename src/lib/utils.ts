export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export function formatRelative(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (abs < MIN) return '刚刚';
  if (abs < HOUR) {
    const m = Math.round(abs / MIN);
    return diff >= 0 ? `${m} 分钟后` : `${m} 分钟前`;
  }
  if (abs < DAY) {
    const h = Math.round(abs / HOUR);
    return diff >= 0 ? `${h} 小时后` : `${h} 小时前`;
  }
  const d = Math.round(abs / DAY);
  return diff >= 0 ? `${d} 天后` : `${d} 天前`;
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

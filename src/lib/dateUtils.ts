export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayLocalDate(): string {
  return formatLocalDate(new Date());
}

export function parseLocalDate(dateStr: string): Date {
  const parts = (dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function addDaysLocal(dateStr: string, delta: number): string {
  const d = parseLocalDate(dateStr);
  return formatLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
}

export function addMonthsLocal(dateStr: string, delta: number): string {
  const d = parseLocalDate(dateStr);
  const targetFirst = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const daysInTarget = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(d.getDate(), daysInTarget);
  return formatLocalDate(new Date(targetFirst.getFullYear(), targetFirst.getMonth(), clampedDay));
}

export function getMondayOfWeekLocal(dateStr: string): Date {
  const d = parseLocalDate(dateStr);
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
}

export function formatLocalTimestamp(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

export function formatDailyHeading(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today';
  if (dateStr === addDaysLocal(todayStr, 1)) return 'Tomorrow';
  if (dateStr === addDaysLocal(todayStr, -1)) return 'Yesterday';
  return parseLocalDate(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

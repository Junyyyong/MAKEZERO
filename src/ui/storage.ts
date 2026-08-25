const KEY = "makezero.daily.v1";

export interface DailyStats {
  date: string;
  best: number;
  games: number;
}

export function todayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function blank(): DailyStats {
  return { date: todayKey(), best: 0, games: 0 };
}

/** Storage can throw outright in private windows, so every access is guarded. */
export function loadDaily(): DailyStats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<DailyStats>;
    if (parsed.date !== todayKey()) return blank();
    return {
      date: parsed.date,
      best: Number(parsed.best) || 0,
      games: Number(parsed.games) || 0,
    };
  } catch {
    return blank();
  }
}

export function saveDaily(stats: DailyStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Nothing to do — the run just will not be remembered.
  }
}

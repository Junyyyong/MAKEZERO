import { TOTAL_STAGES } from "../content/chapters";

const DAILY_KEY = "makezero.daily.v1";
const PROGRESS_KEY = "makezero.progress.v1";

export interface DailyStats {
  date: string;
  best: number;
  games: number;
}

export interface Progress {
  /** Highest stage the player may enter, 1-based. */
  stage: number;
  bestTimeAttack: number;
  bestEndless: number;
  /** Chapters whose story beat has already played. */
  seenChapters: string[];
}

export function todayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Storage can throw outright in private windows, so every access is guarded. */
function read<T>(key: string, fallback: T, revive: (raw: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return revive(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do — the run just will not be remembered.
  }
}

function blankDaily(): DailyStats {
  return { date: todayKey(), best: 0, games: 0 };
}

export function loadDaily(): DailyStats {
  return read(DAILY_KEY, blankDaily(), (raw) => {
    const parsed = raw as Partial<DailyStats>;
    if (parsed.date !== todayKey()) return blankDaily();
    return {
      date: parsed.date,
      best: Number(parsed.best) || 0,
      games: Number(parsed.games) || 0,
    };
  });
}

export function saveDaily(stats: DailyStats): void {
  write(DAILY_KEY, stats);
}

function blankProgress(): Progress {
  return { stage: 1, bestTimeAttack: 0, bestEndless: 0, seenChapters: [] };
}

export function loadProgress(): Progress {
  return read(PROGRESS_KEY, blankProgress(), (raw) => {
    const parsed = raw as Partial<Progress>;
    const stage = Number(parsed.stage);
    return {
      stage: Number.isFinite(stage) ? Math.min(Math.max(stage, 1), TOTAL_STAGES) : 1,
      bestTimeAttack: Number(parsed.bestTimeAttack) || 0,
      bestEndless: Number(parsed.bestEndless) || 0,
      seenChapters: Array.isArray(parsed.seenChapters)
        ? parsed.seenChapters.filter((id): id is string => typeof id === "string")
        : [],
    };
  });
}

export function saveProgress(progress: Progress): void {
  write(PROGRESS_KEY, progress);
}

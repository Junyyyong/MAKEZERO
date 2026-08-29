import { TOTAL_STAGES } from "../content/chapters";

const DAILY_KEY = "makezero.daily.v1";
const PROGRESS_KEY = "makezero.progress.v1";
const SETTINGS_KEY = "makezero.settings.v1";

export interface DailyStats {
  date: string;
  best: number;
  games: number;
}

export interface Progress {
  /** Highest stage the player may enter, 1-based. */
  stage: number;
  bestStory: number;
  bestTimeAttack: number;
  bestEndless: number;
  /** Longest an endless run has survived, in milliseconds. */
  bestEndlessMs: number;
  /** Chapters whose story beat has already played. */
  seenChapters: string[];
  /** Best star grade per stage, indexed from zero. */
  /** Stages whose picture has been uncovered and kept. */
  collected: number[];
  /** Best clear time per stage, in milliseconds, indexed by stage - 1. */
  bestTimes: number[];
  /** Whether the player has been through, or skipped, the tutorial. */
  tutorialDone: boolean;
}

export interface Settings {
  soundOn: boolean;
  /** Whether the phone buzzes on a pick, a clear and a refusal. */
  hapticsOn: boolean;
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

export function loadSettings(): Settings {
  // Both default to on: a game that is silent and still until it is switched
  // on is a game most players never hear.
  return read(SETTINGS_KEY, { soundOn: true, hapticsOn: true }, (raw) => {
    const parsed = raw as Partial<Settings>;
    return { soundOn: parsed.soundOn !== false, hapticsOn: parsed.hapticsOn !== false };
  });
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

function blankProgress(): Progress {
  return {
    stage: 1,
    bestStory: 0,
    bestTimeAttack: 0,
    bestEndless: 0,
    bestEndlessMs: 0,
    seenChapters: [],
    collected: [],
    bestTimes: [],
    tutorialDone: false,
  };
}

export function loadProgress(): Progress {
  return read(PROGRESS_KEY, blankProgress(), (raw) => {
    const parsed = raw as Partial<Progress>;
    const stage = Number(parsed.stage);
    return {
      stage: Number.isFinite(stage) ? Math.min(Math.max(stage, 1), TOTAL_STAGES) : 1,
      bestStory: Number(parsed.bestStory) || 0,
      bestTimeAttack: Number(parsed.bestTimeAttack) || 0,
      bestEndless: Number(parsed.bestEndless) || 0,
      bestEndlessMs: Math.max(0, Number(parsed.bestEndlessMs) || 0),
      seenChapters: Array.isArray(parsed.seenChapters)
        ? parsed.seenChapters.filter((id): id is string => typeof id === "string")
        : [],
      bestTimes: Array.isArray(parsed.bestTimes)
        ? parsed.bestTimes.map((n) => Math.max(0, Number(n) || 0))
        : [],
      collected: Array.isArray(parsed.collected)
        ? parsed.collected.map((n) => Number(n) || 0).filter((n) => n >= 1)
        : [],
      tutorialDone: parsed.tutorialDone === true,
    };
  });
}

export function saveProgress(progress: Progress): void {
  write(PROGRESS_KEY, progress);
}

/** Keeps the best grade a stage has ever earned. */
/** Adds a stage's picture to the collection. Collecting twice changes nothing. */
export function collectPlate(progress: Progress, stage: number): Progress {
  if (progress.collected.includes(stage)) return progress;
  return { ...progress, collected: [...progress.collected, stage].sort((a, b) => a - b) };
}

/** Records a clear time, keeping only the best one for that stage. */
export function recordStageTime(progress: Progress, stage: number, ms: number): Progress {
  const bestTimes = [...progress.bestTimes];
  while (bestTimes.length < stage) bestTimes.push(0);
  const held = bestTimes[stage - 1] ?? 0;
  if (held !== 0 && held <= ms) return progress;
  bestTimes[stage - 1] = ms;
  return { ...progress, bestTimes };
}

/** Records how long an endless run lasted, keeping only the longest. */
export function recordEndlessTime(progress: Progress, ms: number): Progress {
  if (ms <= progress.bestEndlessMs) return progress;
  return { ...progress, bestEndlessMs: ms };
}

export function bestTimeFor(progress: Progress, stage: number): number {
  return progress.bestTimes[stage - 1] ?? 0;
}

export function totalCollected(progress: Progress): number {
  return progress.collected.length;
}

/** A single square on the board. Cleared cells stay in place as dark holes. */
export interface Cell {
  value: number;
  cleared: boolean;
}

/** Flat, reading-order cell list. The last row may be partially filled. */
export interface Board {
  width: number;
  cells: Cell[];
}

export type MatchFailure =
  | "too-few"
  | "too-many"
  | "duplicate"
  | "cleared"
  | "disconnected"
  | "bad-sum";

export interface MatchResult {
  ok: boolean;
  score: number;
  failure?: MatchFailure;
}

export type GameMode = "story" | "timeAttack" | "endless";

/**
 * Everything that varies between modes and between story stages. The matching
 * rules themselves never change — only the goal and the resources do.
 */
export interface RunConfig {
  mode: GameMode;
  /** Rows dealt at the start. */
  rows: number;
  /** How many times the player may copy the survivors onto the board. */
  adds: number;
  hints: number;
  /** Relative spawn weight for values 1..9. */
  weights: readonly number[];
  /** Time attack only: length of the run. */
  timeLimitMs?: number;
  /** Time attack only: top the board up instead of ending on a deadlock. */
  autoRefill?: boolean;
  /** Story only: 1-based stage number. */
  stage?: number;
}

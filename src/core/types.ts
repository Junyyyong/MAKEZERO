/** A single square on the board. Cleared cells stay in place as dark holes. */
export interface Cell {
  value: number;
  cleared: boolean;
}

/** Flat, reading-order cell list. Width is presentation only — see rules.ts. */
export interface Board {
  width: number;
  cells: Cell[];
}

export type MatchFailure = "too-few" | "too-many" | "duplicate" | "cleared" | "bad-sum";

export interface MatchResult {
  ok: boolean;
  score: number;
  failure?: MatchFailure;
}

export type GameMode = "story" | "timeAttack" | "endless";

/**
 * Everything that varies between modes and between story stages. The matching
 * rules themselves never change — only the board, the goal and the resources.
 */
export interface RunConfig {
  mode: GameMode;
  /** Board columns and rows. The board never grows, so this is its final size. */
  width: number;
  rows: number;
  /** Relative chance of dealing a group of 2, 3, 4 or 5 tiles. */
  groupWeights: readonly number[];
  hints: number;
  /** Most tiles that may remain for one, two and three stars. */
  starTargets: readonly [number, number, number];
  timeLimitMs?: number;
  /** Time attack only: redeal instead of ending. */
  autoRefill?: boolean;
  /** Story only: 1-based stage number. */
  stage?: number;
}

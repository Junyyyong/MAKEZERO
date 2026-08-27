/**
 * A single square on the board. Cleared cells stay in place as dark holes and
 * keep the number that stood there; a square nothing has ever occupied carries
 * value 0 and renders blank.
 */
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

export interface SpawnConfig {
  /** Share of the board dealt at the start, leaving the rest as landing room. */
  initialFill: number;
  /** Gap between the first batches. */
  startIntervalMs: number;
  /** Floor the gap never drops below, however long the run lasts. */
  minIntervalMs: number;
  /** How much shorter each successive gap gets. */
  rampMs: number;
}

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
  /** How many of each digit to deal, indexed by value. Overrides groupWeights. */
  deck?: readonly number[];
  hints: number;
  /**
   * Story only: how many moves may be taken back.
   *
   * A story board is always dealt so that it *can* be emptied, but a careless
   * move can strand tiles that nothing will ever clear. Taking that move back
   * is the difference between a puzzle and a lottery, so this is a resource
   * like hints rather than a convenience — and running out of it is what makes
   * a late stage hard.
   */
  undos: number;
  /**
   * Most tiles that may remain for one, two and three stars.
   *
   * In story only the first still works that way: it is the consolation mark
   * for a board that came close. Two and three stars are about emptying the
   * board — see `stars()`.
   */
  starTargets: readonly [number, number, number];
  timeLimitMs?: number;
  /** Time attack only: redeal instead of ending. */
  autoRefill?: boolean;
  /**
   * Endless only. Tiles keep arriving on a timer and the board is a fixed
   * frame that fills up rather than one that shrinks as rows empty, so cleared
   * squares stay open as landing room. The run ends when a batch cannot fit.
   */
  spawn?: SpawnConfig;
  /** Story only: 1-based stage number. */
  stage?: number;
}

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

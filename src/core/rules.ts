import { isAlive, valueAt } from "./board";
import type { Board, MatchResult } from "./types";

export const TARGET_SUM = 10;
export const MIN_SELECTION = 2;
export const MAX_SELECTION = 5;

/** More tiles in one clear is strictly harder, so the reward curve is steep. */
export const SCORE_BY_COUNT: Readonly<Record<number, number>> = {
  2: 10,
  3: 30,
  4: 70,
  5: 150,
};

export function scoreFor(count: number): number {
  return SCORE_BY_COUNT[count] ?? 0;
}

/**
 * A selection clears when two to five surviving tiles add up to exactly ten.
 *
 * Where the tiles sit does not matter: any tiles on the board may be combined,
 * however far apart. Repeated values are fine — 1+1+1+7 is a perfectly good
 * chain — and matching two tiles because they show the same number is not a
 * rule here; 3+3 is six, so it does not clear.
 *
 * Position used to matter (tiles had to share an unobstructed straight line).
 * If that ever comes back, this is the only function that has to know.
 */
export function evaluateSelection(board: Board, indices: readonly number[]): MatchResult {
  if (indices.length < MIN_SELECTION) return { ok: false, score: 0, failure: "too-few" };
  if (indices.length > MAX_SELECTION) return { ok: false, score: 0, failure: "too-many" };
  if (new Set(indices).size !== indices.length) {
    return { ok: false, score: 0, failure: "duplicate" };
  }
  for (const i of indices) {
    if (!isAlive(board, i)) return { ok: false, score: 0, failure: "cleared" };
  }
  const sum = indices.reduce((total, i) => total + valueAt(board, i), 0);
  if (sum !== TARGET_SUM) return { ok: false, score: 0, failure: "bad-sum" };
  return { ok: true, score: scoreFor(indices.length) };
}

export function isSelectionValid(board: Board, indices: readonly number[]): boolean {
  return evaluateSelection(board, indices).ok;
}

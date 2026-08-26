import { MAX_GROUP, MIN_GROUP, TARGET_SUM, areConnected, isAlive, valueAt } from "./board";
import type { Board, MatchResult } from "./types";

export { MAX_GROUP as MAX_SELECTION, MIN_GROUP as MIN_SELECTION, TARGET_SUM };

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
 * A selection clears when two to five connected tiles add up to exactly ten.
 * Repeated values are fine — 1+1+8 is a perfectly good chain — but matching two
 * tiles just because they show the same number is not a rule here.
 */
export function evaluateSelection(board: Board, indices: readonly number[]): MatchResult {
  if (indices.length < MIN_GROUP) return { ok: false, score: 0, failure: "too-few" };
  if (indices.length > MAX_GROUP) return { ok: false, score: 0, failure: "too-many" };
  if (new Set(indices).size !== indices.length) {
    return { ok: false, score: 0, failure: "duplicate" };
  }
  for (const i of indices) {
    if (!isAlive(board, i)) return { ok: false, score: 0, failure: "cleared" };
  }
  for (let step = 1; step < indices.length; step++) {
    if (!areConnected(board, indices[step - 1]!, indices[step]!)) {
      return { ok: false, score: 0, failure: "disconnected" };
    }
  }
  const sum = indices.reduce((total, i) => total + valueAt(board, i), 0);
  if (sum !== TARGET_SUM) return { ok: false, score: 0, failure: "bad-sum" };
  return { ok: true, score: scoreFor(indices.length) };
}

export function isSelectionValid(board: Board, indices: readonly number[]): boolean {
  return evaluateSelection(board, indices).ok;
}

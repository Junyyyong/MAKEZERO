import { areConnected, isAlive, valueAt } from "./board";
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
 * A selection clears when every step of the chain is connected and either
 * (a) it is exactly two tiles showing the same number, or
 * (b) its values add up to ten.
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
  for (let step = 1; step < indices.length; step++) {
    const prev = indices[step - 1]!;
    const next = indices[step]!;
    if (!areConnected(board, prev, next)) {
      return { ok: false, score: 0, failure: "disconnected" };
    }
  }

  const values = indices.map((i) => valueAt(board, i));
  const sum = values.reduce((a, b) => a + b, 0);
  const isTwinPair = values.length === 2 && values[0] === values[1];
  if (sum !== TARGET_SUM && !isTwinPair) {
    return { ok: false, score: 0, failure: "bad-sum" };
  }
  return { ok: true, score: scoreFor(indices.length) };
}

export function isSelectionValid(board: Board, indices: readonly number[]): boolean {
  return evaluateSelection(board, indices).ok;
}

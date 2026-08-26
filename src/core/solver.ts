import { MAX_VALUE, MIN_VALUE, aliveIndices, valueAt, valueCounts } from "./board";
import { MAX_SELECTION, MIN_SELECTION, TARGET_SUM } from "./rules";
import type { Board } from "./types";

/**
 * The best combination of values still on the board, longest first.
 *
 * Since position does not matter, this is pure arithmetic: pick 2..5 values
 * from what is left that add to ten. Searching the nine value counts rather
 * than the tiles keeps it cheap however big the board is.
 */
export function findValueCombo(counts: readonly number[]): number[] | null {
  const pool = [...counts];
  let best: number[] | null = null;
  const chain: number[] = [];

  const walk = (from: number, left: number): void => {
    if (left === 0 && chain.length >= MIN_SELECTION) {
      if (!best || chain.length > best.length) best = [...chain];
      return;
    }
    if (chain.length >= MAX_SELECTION || from > MAX_VALUE) return;
    for (let v = from; v <= Math.min(MAX_VALUE, left); v++) {
      if (pool[v] === 0) continue;
      pool[v]!--;
      chain.push(v);
      walk(v, left - v); // non-decreasing, so each multiset is visited once
      chain.pop();
      pool[v]!++;
    }
  };

  walk(MIN_VALUE, TARGET_SUM);
  return best;
}

/** Turns a combination of values into actual tiles to highlight or clear. */
export function locate(board: Board, combo: readonly number[]): number[] | null {
  const taken = new Set<number>();
  const picked: number[] = [];
  for (const value of combo) {
    const match = aliveIndices(board).find((i) => !taken.has(i) && valueAt(board, i) === value);
    if (match === undefined) return null;
    taken.add(match);
    picked.push(match);
  }
  return picked;
}

/** One clearable selection, or null when nothing on the board can make ten. */
export function findHint(board: Board): number[] | null {
  const combo = findValueCombo(valueCounts(board));
  return combo ? locate(board, combo) : null;
}

export function hasAnyMove(board: Board): boolean {
  return findValueCombo(valueCounts(board)) !== null;
}

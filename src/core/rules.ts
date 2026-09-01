import { isAlive, valueAt } from "./board";
import type { Board, MatchResult } from "./types";

export const TARGET_SUM = 10;
export const MIN_SELECTION = 2;
export const MAX_SELECTION = 5;

/**
 * The sums a mode clears on. Ten unless a mode says otherwise.
 *
 * One mode adds twenty and thirty, which changes nothing structural: every
 * allowed sum is a multiple of ten, so a board dealt as a union of tens is
 * still exactly emptiable, and the extra targets only widen what a player may
 * take in one go.
 */
export const DEFAULT_TARGETS: readonly number[] = [TARGET_SUM];

/**
 * Each extra tile doubles the reward.
 *
 * Tuned against the 81-tile deck, where the two ways to play pull apart:
 * clearing with pairs empties the board down to its last tile for 400, while
 * chasing long chains tops out near 550 but strands about 27 tiles. Stars
 * reward the first, score the second, and no single run does both.
 */
export const SCORE_BY_COUNT: Readonly<Record<number, number>> = {
  2: 10,
  3: 20,
  4: 40,
  5: 80,
};

/**
 * A clear is worth its length, times how many tens it took off the board.
 *
 * Twenty is twice the tiles' worth of ten, so it pays twice; thirty three
 * times. Anything else would make the bigger sums a worse deal than taking the
 * same tiles as two smaller ones.
 */
export function scoreFor(count: number, target: number = TARGET_SUM): number {
  return (SCORE_BY_COUNT[count] ?? 0) * Math.max(1, Math.round(target / TARGET_SUM));
}

/**
 * A selection clears when two to five surviving tiles hit one of the sums the
 * mode is playing for — ten in every mode, and twenty or thirty in the one
 * that asks for them.
 *
 * Where the tiles sit does not matter: any tiles on the board may be combined,
 * however far apart. Repeated values are fine — 1+1+1+7 is a perfectly good
 * chain — and matching two tiles because they show the same number is not a
 * rule here; 3+3 is six, so it does not clear.
 *
 * Position used to matter (tiles had to share an unobstructed straight line).
 * If that ever comes back, this is the only function that has to know.
 */
export function evaluateSelection(
  board: Board,
  indices: readonly number[],
  targets: readonly number[] = DEFAULT_TARGETS,
): MatchResult {
  if (indices.length < MIN_SELECTION) return { ok: false, score: 0, failure: "too-few" };
  if (indices.length > MAX_SELECTION) return { ok: false, score: 0, failure: "too-many" };
  if (new Set(indices).size !== indices.length) {
    return { ok: false, score: 0, failure: "duplicate" };
  }
  for (const i of indices) {
    if (!isAlive(board, i)) return { ok: false, score: 0, failure: "cleared" };
  }
  const sum = indices.reduce((total, i) => total + valueAt(board, i), 0);
  if (!targets.includes(sum)) return { ok: false, score: 0, failure: "bad-sum" };
  return { ok: true, score: scoreFor(indices.length, sum) };
}

export function isSelectionValid(
  board: Board,
  indices: readonly number[],
  targets: readonly number[] = DEFAULT_TARGETS,
): boolean {
  return evaluateSelection(board, indices, targets).ok;
}

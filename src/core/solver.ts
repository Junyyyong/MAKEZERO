import { MAX_VALUE, MIN_VALUE, aliveIndices, allGroups, valueAt, valueCounts } from "./board";
import { DEFAULT_TARGETS, MAX_SELECTION, MIN_SELECTION } from "./rules";
import type { Board } from "./types";

/**
 * The best combination of values still on the board, longest first.
 *
 * Since position does not matter, this is pure arithmetic: pick 2..5 values
 * from what is left that add to one of the sums this mode clears on. Searching
 * the nine value counts rather than the tiles keeps it cheap however big the
 * board is.
 */
export function findValueCombo(
  counts: readonly number[],
  targets: readonly number[] = DEFAULT_TARGETS,
): number[] | null {
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

  // Biggest target first: a thirty is worth more than a ten and takes three
  // times as much off the board, so it is the one to offer when both exist.
  for (const target of [...targets].sort((a, b) => b - a)) {
    walk(MIN_VALUE, target);
    if (best) return best;
  }
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

function fits(counts: readonly number[], group: readonly number[]): boolean {
  const need = new Array(MAX_VALUE + 1).fill(0);
  for (const value of group) need[value]++;
  return need.every((n, value) => (counts[value] ?? 0) >= n);
}

function without(counts: readonly number[], group: readonly number[]): number[] {
  const out = [...counts];
  for (const value of group) out[value] = (out[value] ?? 0) - 1;
  return out;
}

/**
 * The best clear that still leaves the board finishable.
 *
 * A hint that only looks at what is legal right now is a trap. Simulated on
 * MAKE 10 · 20 · 30, a player who always took the biggest legal clear — which
 * is what the hint used to offer — emptied one board in sixty, because the
 * thirties eat the big digits first and strand the rest. The same line that
 * checks each move against `canEmpty` empties every board.
 *
 * `canEmpty` only knows how to take a board apart into tens, so it says no to
 * some positions that twenty and thirty could still rescue. That is the right
 * way to be wrong: it never approves a move that strands the board, only
 * declines one that might have been fine. When it can approve nothing — the
 * board is already past saving — this returns null and the caller falls back
 * to whatever is legal.
 */
export function findSafeCombo(
  counts: readonly number[],
  targets: readonly number[] = DEFAULT_TARGETS,
): number[] | null {
  if (!canEmpty(counts)) return null;
  let best: number[] | null = null;
  let bestSum = 0;
  for (const group of allGroups(targets)) {
    if (!fits(counts, group)) continue;
    const sum = group.reduce((total, value) => total + value, 0);
    // Worth more first — a bigger target pays more and takes more off the
    // board — and, at the same value, the one that takes the most tiles.
    if (best && (sum < bestSum || (sum === bestSum && group.length <= best.length))) continue;
    if (!canEmpty(without(counts, group))) continue;
    best = [...group];
    bestSum = sum;
  }
  return best;
}

/** One clearable selection, or null when nothing left can make a target. */
export function findHint(
  board: Board,
  targets: readonly number[] = DEFAULT_TARGETS,
): number[] | null {
  const counts = valueCounts(board);
  const combo = findSafeCombo(counts, targets) ?? findValueCombo(counts, targets);
  return combo ? locate(board, combo) : null;
}

export function hasAnyMove(board: Board, targets: readonly number[] = DEFAULT_TARGETS): boolean {
  return findValueCombo(valueCounts(board), targets) !== null;
}

/**
 * Can a board holding exactly these digits be emptied, with nothing left over?
 *
 * Exact, not a guess: it searches, and it always resolves the largest value
 * still present. Every way of taking the board apart has to deal with that
 * value somehow, so trying only the groups containing it loses no answer while
 * collapsing the search; the memo across calls does the rest.
 *
 * Story leans on this twice — once to promise that a deal can be finished, and
 * once to make sure splitting a block never quietly breaks that promise.
 */
const emptiable = new Map<string, boolean>();

export function canEmpty(counts: readonly number[]): boolean {
  let total = 0;
  for (const n of counts) total += n;
  if (total === 0) return true;

  const key = counts.join(",");
  const known = emptiable.get(key);
  if (known !== undefined) return known;

  let largest = MAX_VALUE;
  while (largest > 0 && !counts[largest]) largest--;

  let found = false;
  for (const group of allGroups()) {
    if (group[group.length - 1] !== largest) continue;
    const rest = [...counts];
    let ok = true;
    for (const value of group) {
      if ((rest[value] ?? 0) <= 0) {
        ok = false;
        break;
      }
      rest[value] = (rest[value] ?? 0) - 1;
    }
    if (!ok) continue;
    if (canEmpty(rest)) {
      found = true;
      break;
    }
  }
  emptiable.set(key, found);
  return found;
}

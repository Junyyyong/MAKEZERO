import type { Board, Cell } from "./types";
import type { Rng } from "./rng";
import { MAX_SELECTION, MIN_SELECTION, TARGET_SUM } from "./rules";

export const MIN_VALUE = 1;
export const MAX_VALUE = 9;

/**
 * Relative chance of dealing a group of 2, 3, 4 or 5 tiles.
 *
 * Counter-intuitively, dealing many *large* groups makes a board easier, not
 * harder. Five values that add to ten average two apiece, so the board fills
 * with small, flexible numbers that combine every which way. Dealing pairs
 * instead spreads the values out, and a rigid 8 or 9 — which needs exactly a 2
 * or a 1 — is what actually strands a board. Simulated on the same stage:
 * large groups left 5.4 tiles standing, pairs left 17.8.
 */
export const EASY_GROUPS: readonly number[] = [2, 3, 3, 2];
export const HARD_GROUPS: readonly number[] = [6, 3, 1, 0];

/**
 * Every way 2 to 5 digits add to ten, smallest first. About thirty of them.
 *
 * Built on first use, not at import: rules.ts and board.ts refer to each other,
 * so anything that reads TARGET_SUM while the modules are still loading blows
 * the stack.
 *
 * The dealer works from this list rather than rolling digits one at a time.
 * Rolling was the old way and it skewed the board badly: a group of five that
 * adds to ten averages two a tile, so the board filled with 1s and 2s — 55% of
 * every deal — while a 9 turned up on one tile in a hundred. The player spent
 * the small numbers on long combinations and was left with 7s, 8s and 9s that
 * had nothing to pair with.
 */
let groupCache: readonly (readonly number[])[] | undefined;
export function allGroups(): readonly (readonly number[])[] {
  if (groupCache) return groupCache;
  const out: number[][] = [];
  const build = (start: number, sum: number, picked: number[]) => {
    if (sum === TARGET_SUM && picked.length >= MIN_SELECTION) {
      out.push([...picked]);
      return;
    }
    if (sum >= TARGET_SUM || picked.length === MAX_SELECTION) return;
    for (let value = start; value <= MAX_VALUE; value++) {
      if (sum + value > TARGET_SUM) break;
      picked.push(value);
      build(value, sum + value, picked);
      picked.pop();
    }
  };
  build(MIN_VALUE, 0, []);
  groupCache = out;
  return out;
}

/**
 * How common each digit should be, 1 to 9. Values are relative, not counts.
 *
 * This is the dial that decides what a board *feels* like, and it decides the
 * group sizes on its own: a group of five can only be made of 1s and 2s, so a
 * deal that wants few 1s ends up dealing mostly pairs without being told to.
 */
export const GENTLE_DIGITS: readonly number[] = [0, 23, 18, 14, 12, 10, 8, 6, 5, 4];
export const LEVEL_DIGITS: readonly number[] = [0, 12, 12, 12, 11, 11, 11, 11, 10, 10];

/**
 * Deals whole groups, choosing each one to pull the board's digit histogram
 * toward `digitWeights`.
 *
 * Dealing in groups is what makes a board clearable at all — every clear takes
 * exactly ten away, so a board that is not a union of tens can never be
 * emptied. Choosing *which* group by what the board is short of is what keeps
 * the digits spread the way the stage asked for.
 */
export function createWeightedBoard(
  rng: Rng,
  width: number,
  rows: number,
  digitWeights: readonly number[],
): Board {
  const capacity = width * rows;
  const total = digitWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  // How many of each digit the finished board should hold.
  const want = digitWeights.map((weight) => (weight / total) * capacity);
  const placed = new Array(MAX_VALUE + 1).fill(0);
  const values: number[] = [];

  while (values.length < capacity) {
    const room = capacity - values.length;
    const groups = allGroups();
    const usable = groups.filter((group) => {
      if (group.length > room) return false;
      // Never leave a single cell behind: no group can fill it.
      return room - group.length !== 1;
    });
    const pool = usable.length > 0 ? usable : groups.filter((group) => group.length <= room);
    if (pool.length === 0) break;

    // Score by how badly the board still wants these digits, so a shortage
    // pulls groups containing that digit to the front.
    let best = -Infinity;
    let chosen = pool[0]!;
    for (const group of pool) {
      let score = 0;
      for (const value of group) score += (want[value] ?? 0) - (placed[value] ?? 0);
      // Per tile, not per group. Summed, a group of five always outscores a
      // pair simply by having more terms, and the board fills with 1s and 2s
      // again — which is the whole thing this dealer exists to stop.
      score /= group.length;
      // A nudge of noise, or every board of a size would deal identically.
      score += (rng() - 0.5) * 0.6;
      if (score > best) {
        best = score;
        chosen = group;
      }
    }

    for (const value of chosen) {
      values.push(value);
      placed[value] = (placed[value] ?? 0) + 1;
    }
  }

  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return { width, cells: values.map((value) => ({ value, cleared: false })) };
}

export function rowOf(board: Board, i: number): number {
  return Math.floor(i / board.width);
}

export function colOf(board: Board, i: number): number {
  return i % board.width;
}

export function rowCount(board: Board): number {
  return Math.ceil(board.cells.length / board.width);
}

export function isAlive(board: Board, i: number): boolean {
  const cell = board.cells[i];
  return cell !== undefined && !cell.cleared;
}

export function valueAt(board: Board, i: number): number {
  const cell = board.cells[i];
  if (cell === undefined) throw new RangeError(`no cell at index ${i}`);
  return cell.value;
}

export function aliveIndices(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.cells.length; i++) if (isAlive(board, i)) out.push(i);
  return out;
}

export function aliveCount(board: Board): number {
  let n = 0;
  for (const cell of board.cells) if (!cell.cleared) n++;
  return n;
}

/** How many of each value are still standing, indexed by value. */
export function valueCounts(board: Board): number[] {
  const counts = new Array<number>(MAX_VALUE + 1).fill(0);
  for (const cell of board.cells) if (!cell.cleared) counts[cell.value]!++;
  return counts;
}

// ---- dealing ---------------------------------------------------------------

function weightedPick(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return 0;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i] ?? 0);
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** One group of `parts` values in 1..9 that adds up to exactly ten. */
export function makeGroup(rng: Rng, parts: number): number[] {
  const out: number[] = [];
  let left = TARGET_SUM;
  for (let i = 0; i < parts; i++) {
    const rest = parts - i - 1;
    const min = Math.max(MIN_VALUE, left - rest * MAX_VALUE);
    const max = Math.min(MAX_VALUE, left - rest * MIN_VALUE);
    const v = min + Math.floor(rng() * (max - min + 1));
    out.push(v);
    left -= v;
  }
  return out;
}

/**
 * Deals an exact set of tiles — so many 1s, so many 2s — shuffled into place.
 *
 * The counts are the puzzle. Nine of each digit is 81 tiles totalling 405, and
 * since every clear removes exactly ten, that last digit never moves: one 5
 * always survives. See docs/DECISIONS.md.
 */
export function createDeck(rng: Rng, width: number, counts: readonly number[]): Board {
  const values: number[] = [];
  for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
    for (let n = 0; n < (counts[v] ?? 0); n++) values.push(v);
  }
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return { width, cells: values.map((value) => ({ value, cleared: false })) };
}

/** Nine of every digit: 81 tiles on a 9x9 board. */
export function evenDeck(perDigit = 9): number[] {
  return Array.from({ length: MAX_VALUE + 1 }, (_, v) => (v === 0 ? 0 : perDigit));
}

/**
 * Deals a board made entirely of groups that add up to ten, then scatters them.
 *
 * A board of loose random numbers can never be cleared: every clear removes
 * exactly ten, so the total's last digit never changes, and only one deal in
 * ten starts on a multiple of ten. Dealing whole groups makes the values
 * exactly partitionable, so a perfect clear is at least possible.
 */
export function createBoard(
  rng: Rng,
  width: number,
  rows: number,
  groupWeights: readonly number[] = EASY_GROUPS,
): Board {
  const capacity = width * rows;
  const values: number[] = [];

  while (values.length < capacity) {
    const remaining = capacity - values.length;
    let parts = MIN_SELECTION + weightedPick(rng, groupWeights);
    parts = Math.max(MIN_SELECTION, Math.min(parts, Math.min(MAX_SELECTION, remaining)));
    // Never leave a single orphan cell that no legal group could fill. If a
    // five-part group would leave one of six cells behind, making it larger is
    // impossible; make it four instead and leave a final pair.
    if (remaining - parts === 1) {
      parts = parts < Math.min(MAX_SELECTION, remaining) ? parts + 1 : parts - 1;
    }
    values.push(...makeGroup(rng, parts));
  }

  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }

  return { width, cells: values.map((value) => ({ value, cleared: false })) };
}

/** The indices of squares nothing is standing on. */
export function emptyIndices(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.cells.length; i++) if (!isAlive(board, i)) out.push(i);
  return out;
}

/**
 * Deals only part of the board, leaving the rest open. Used by the modes where
 * tiles keep arriving: the empty squares are the room those tiles land in.
 */
export function createSparseBoard(
  rng: Rng,
  width: number,
  rows: number,
  fill: number,
  groupWeights: readonly number[] = EASY_GROUPS,
): Board {
  const capacity = width * rows;
  // Value 0 marks a square nothing has ever stood on, so it renders blank
  // rather than showing the ghost of a tile that was never there.
  const cells: Cell[] = Array.from({ length: capacity }, () => ({ value: 0, cleared: true }));
  const wanted = Math.max(MIN_SELECTION, Math.round(capacity * fill));
  const board = { width, cells };

  while (aliveCount(board) < wanted) {
    const room = capacity - aliveCount(board);
    if (room < MIN_SELECTION) break;
    if (!placeGroup(board, rng, groupWeights)) break;
  }
  return board;
}

/**
 * Drops one whole group of tiles onto free squares.
 *
 * Whole groups only: the board is dealt so its values split exactly into tens,
 * and adding a partial group would break that and strand the leftovers.
 * Returns false when there is no longer room for even the smallest group.
 */
export function placeGroup(
  board: Board,
  rng: Rng,
  groupWeights: readonly number[] = EASY_GROUPS,
): boolean {
  const free = emptyIndices(board);
  if (free.length < MIN_SELECTION) return false;

  const wanted = MIN_SELECTION + weightedPick(rng, groupWeights);
  const parts = Math.min(wanted, MAX_SELECTION, free.length);
  const values = makeGroup(rng, parts);

  for (const value of values) {
    const pick = Math.floor(rng() * free.length);
    const [index] = free.splice(pick, 1);
    board.cells[index!] = { value, cleared: false };
  }
  return true;
}

/** Drops any row whose cells are all cleared, pulling the rest up. */
export function collapseRows(board: Board): { board: Board; removed: number } {
  const kept: Cell[] = [];
  let removed = 0;
  for (let start = 0; start < board.cells.length; start += board.width) {
    const row = board.cells.slice(start, start + board.width);
    if (row.every((cell) => cell.cleared)) {
      removed++;
      continue;
    }
    kept.push(...row);
  }
  return { board: { width: board.width, cells: kept }, removed };
}

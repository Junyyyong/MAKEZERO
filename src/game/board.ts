import type { Board, Cell } from "./types";
import type { Rng } from "./rng";

export const MIN_VALUE = 1;
export const MAX_VALUE = 9;
export const TARGET_SUM = 10;
export const MIN_GROUP = 2;
export const MAX_GROUP = 5;

/**
 * Relative chance of dealing a group of 2, 3, 4 or 5 tiles.
 *
 * Counter-intuitively, dealing many *large* groups makes a board easier, not
 * harder. Five values that add to ten average two apiece, so the board fills
 * with small, flexible numbers that combine every which way. Dealing pairs
 * instead spreads the values out, and a rigid 8 or 9 — which needs exactly a 2
 * or a 1 — is what actually strands a board.
 */
export const EASY_GROUPS: readonly number[] = [2, 3, 3, 2];
export const HARD_GROUPS: readonly number[] = [6, 3, 1, 0];

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

// ---- connection ------------------------------------------------------------

/**
 * Two tiles connect when a straight line — horizontal, vertical or diagonal —
 * runs between them with no surviving tile in the way. Neighbours qualify
 * trivially, and cleared squares are see-through, so the board opens up as it
 * empties. This is the whole rule; there is no separate reading-order case.
 */
export function areConnected(board: Board, a: number, b: number): boolean {
  if (a === b || !isAlive(board, a) || !isAlive(board, b)) return false;
  const dr = rowOf(board, b) - rowOf(board, a);
  const dc = colOf(board, b) - colOf(board, a);
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return false;

  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  for (let s = 1; s < steps; s++) {
    const between = (rowOf(board, a) + stepR * s) * board.width + (colOf(board, a) + stepC * s);
    if (isAlive(board, between)) return false;
  }
  return true;
}

export function connectedNeighbours(board: Board, i: number): number[] {
  const out: number[] = [];
  for (const j of aliveIndices(board)) if (areConnected(board, i, j)) out.push(j);
  return out;
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
 * Deals a board made entirely of groups that add up to ten, then scatters them.
 * Because the values are exactly partitionable, clearing every tile is always
 * arithmetically possible — a board of loose random numbers is not, since each
 * clear removes exactly ten and can never change the total's last digit.
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
    let remaining = capacity - values.length;
    let parts = MIN_GROUP + weightedPick(rng, groupWeights);
    // Never leave a single orphan cell that no group could fill.
    if (parts > remaining) parts = remaining;
    if (remaining - parts === 1) parts = remaining >= MAX_GROUP ? parts + 1 : remaining;
    parts = Math.max(MIN_GROUP, Math.min(parts, Math.min(MAX_GROUP, remaining)));
    values.push(...makeGroup(rng, parts));
  }

  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }

  return { width, cells: values.map((value) => ({ value, cleared: false })) };
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

/**
 * The rescue action: keeps every surviving number and only moves it. Copying
 * the survivors instead would duplicate whatever the player is stuck on and
 * grow the board without end.
 */
export function shuffleSurvivors(board: Board, rng: Rng): Board {
  const values = board.cells.filter((cell) => !cell.cleared).map((cell) => cell.value);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return { width: board.width, cells: values.map((value) => ({ value, cleared: false })) };
}

/**
 * Whether any 2..5 of the surviving values add up to ten, ignoring where they
 * sit. When this is false no amount of shuffling can help and the run is over.
 */
export function hasArithmeticMove(board: Board): boolean {
  const counts = new Array<number>(MAX_VALUE + 1).fill(0);
  for (const i of aliveIndices(board)) counts[board.cells[i]!.value]!++;

  const search = (from: number, left: number, used: number): boolean => {
    if (left === 0) return used >= MIN_GROUP;
    if (used >= MAX_GROUP || from > MAX_VALUE) return false;
    for (let v = from; v <= Math.min(MAX_VALUE, left); v++) {
      if (counts[v]! === 0) continue;
      counts[v]!--;
      const hit = search(v, left - v, used + 1);
      counts[v]!++;
      if (hit) return true;
    }
    return false;
  };
  return search(MIN_VALUE, TARGET_SUM, 0);
}

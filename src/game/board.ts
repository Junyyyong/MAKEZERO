import type { Board, Cell } from "./types";
import type { Rng } from "./rng";

export const BOARD_WIDTH = 9;
export const INITIAL_ROWS = 3;
export const MIN_VALUE = 1;
export const MAX_VALUE = 9;

/** Every value equally likely — the baseline the story stages skew away from. */
export const UNIFORM_WEIGHTS: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1];

export function rowOf(board: Board, i: number): number {
  return Math.floor(i / board.width);
}

export function colOf(board: Board, i: number): number {
  return i % board.width;
}

export function rowCount(board: Board): number {
  return Math.ceil(board.cells.length / board.width);
}

export function cellAt(board: Board, i: number): Cell | undefined {
  return board.cells[i];
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
  for (let i = 0; i < board.cells.length; i++) {
    if (isAlive(board, i)) out.push(i);
  }
  return out;
}

export function aliveCount(board: Board): number {
  let n = 0;
  for (const cell of board.cells) if (!cell.cleared) n++;
  return n;
}

/** Draws one value in 1..9, honouring the relative weights of a stage. */
export function pickValue(rng: Rng, weights: readonly number[] = UNIFORM_WEIGHTS): number {
  let total = 0;
  for (let v = MIN_VALUE; v <= MAX_VALUE; v++) total += weights[v - MIN_VALUE] ?? 0;
  if (total <= 0) return MIN_VALUE + Math.floor(rng() * (MAX_VALUE - MIN_VALUE + 1));

  let roll = rng() * total;
  for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
    roll -= weights[v - MIN_VALUE] ?? 0;
    if (roll < 0) return v;
  }
  return MAX_VALUE;
}

export function createBoard(
  rng: Rng,
  rows: number = INITIAL_ROWS,
  weights: readonly number[] = UNIFORM_WEIGHTS,
  width: number = BOARD_WIDTH,
): Board {
  const cells: Cell[] = [];
  for (let i = 0; i < rows * width; i++) {
    cells.push({ value: pickValue(rng, weights), cleared: false });
  }
  return { width, cells };
}

/** Grid neighbours, diagonals included. Cleared cells in between are irrelevant. */
export function areAdjacent(board: Board, a: number, b: number): boolean {
  if (a === b) return false;
  const dr = Math.abs(rowOf(board, a) - rowOf(board, b));
  const dc = Math.abs(colOf(board, a) - colOf(board, b));
  return dr <= 1 && dc <= 1;
}

/** Neighbours in reading order once every cleared cell between them is skipped. */
export function areReadingConsecutive(board: Board, a: number, b: number): boolean {
  if (a === b) return false;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (let i = lo + 1; i < hi; i++) {
    if (isAlive(board, i)) return false;
  }
  return true;
}

export function areConnected(board: Board, a: number, b: number): boolean {
  if (!isAlive(board, a) || !isAlive(board, b)) return false;
  return areAdjacent(board, a, b) || areReadingConsecutive(board, a, b);
}

/** Every live cell that could legally follow `i` in a selection chain. */
export function connectedNeighbours(board: Board, i: number): number[] {
  if (!isAlive(board, i)) return [];
  const found = new Set<number>();
  const row = rowOf(board, i);
  const col = colOf(board, i);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || c >= board.width) continue;
      const j = r * board.width + c;
      if (isAlive(board, j)) found.add(j);
    }
  }
  for (let j = i - 1; j >= 0; j--) {
    if (isAlive(board, j)) {
      found.add(j);
      break;
    }
  }
  for (let j = i + 1; j < board.cells.length; j++) {
    if (isAlive(board, j)) {
      found.add(j);
      break;
    }
  }
  return [...found];
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

/** The "+" action: copy every surviving number onto the end of the board. */
export function appendRemaining(board: Board): Board {
  const added = board.cells
    .filter((cell) => !cell.cleared)
    .map((cell) => ({ value: cell.value, cleared: false }));
  return { width: board.width, cells: [...board.cells, ...added] };
}

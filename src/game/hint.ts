import { aliveIndices, connectedNeighbours, valueAt } from "./board";
import { MAX_SELECTION, TARGET_SUM } from "./rules";
import type { Board } from "./types";

/**
 * Finds one clearable selection, preferring cheap two-tile answers before
 * walking longer chains. Returns null when the board is stuck.
 */
export function findHint(board: Board): number[] | null {
  const alive = aliveIndices(board);

  // Same-number pairs escape the sum rule, so they need their own sweep.
  for (const i of alive) {
    for (const j of connectedNeighbours(board, i)) {
      if (j > i && valueAt(board, i) === valueAt(board, j)) return [i, j];
    }
  }

  const path: number[] = [];
  const inPath = new Set<number>();

  // Values are all at least 1, so a chain that reaches ten can never grow.
  const walk = (sum: number): number[] | null => {
    if (sum === TARGET_SUM && path.length >= 2) return [...path];
    if (sum >= TARGET_SUM || path.length >= MAX_SELECTION) return null;
    const last = path[path.length - 1]!;
    for (const next of connectedNeighbours(board, last)) {
      if (inPath.has(next)) continue;
      const value = valueAt(board, next);
      if (sum + value > TARGET_SUM) continue;
      path.push(next);
      inPath.add(next);
      const hit = walk(sum + value);
      path.pop();
      inPath.delete(next);
      if (hit) return hit;
    }
    return null;
  };

  for (const start of alive) {
    path.push(start);
    inPath.add(start);
    const hit = walk(valueAt(board, start));
    path.pop();
    inPath.delete(start);
    if (hit) return hit;
  }
  return null;
}

export function hasAnyMove(board: Board): boolean {
  return findHint(board) !== null;
}

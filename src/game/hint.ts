import { MAX_GROUP, TARGET_SUM, aliveIndices, connectedNeighbours, valueAt } from "./board";
import type { Board } from "./types";

/**
 * Finds one clearable chain, preferring the longest it can reach so the hint
 * points at the most valuable move rather than the first one.
 */
export function findHint(board: Board): number[] | null {
  let best: number[] | null = null;
  const path: number[] = [];
  const inPath = new Set<number>();

  // Every value is at least one, so a chain that reaches ten can never grow.
  const walk = (sum: number): void => {
    if (sum === TARGET_SUM && path.length >= 2) {
      if (!best || path.length > best.length) best = [...path];
      return;
    }
    if (sum >= TARGET_SUM || path.length >= MAX_GROUP) return;
    for (const next of connectedNeighbours(board, path[path.length - 1]!)) {
      if (inPath.has(next)) continue;
      const value = valueAt(board, next);
      if (sum + value > TARGET_SUM) continue;
      path.push(next);
      inPath.add(next);
      walk(sum + value);
      path.pop();
      inPath.delete(next);
      if (best?.length === MAX_GROUP) return;
    }
  };

  for (const start of aliveIndices(board)) {
    path.push(start);
    inPath.add(start);
    walk(valueAt(board, start));
    path.pop();
    inPath.delete(start);
    if (best !== null && (best as number[]).length === MAX_GROUP) break;
  }
  return best;
}

export function hasAnyMove(board: Board): boolean {
  return findHint(board) !== null;
}

import { describe, expect, it } from "vitest";
import { areConnected, appendRemaining, collapseRows, connectedNeighbours } from "./board";
import { evaluateSelection } from "./rules";
import { findHint, hasAnyMove } from "./hint";
import type { Board } from "./types";

/** Builds a board from rows of digits; 0 marks an already-cleared square. */
function boardOf(...rows: number[][]): Board {
  const width = rows[0]!.length;
  const cells = rows.flat().map((v) => ({ value: v === 0 ? 1 : v, cleared: v === 0 }));
  return { width, cells };
}

describe("connection", () => {
  const board = boardOf(
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  );

  it("links orthogonal and diagonal grid neighbours", () => {
    expect(areConnected(board, 0, 1)).toBe(true); // right
    expect(areConnected(board, 0, 3)).toBe(true); // down
    expect(areConnected(board, 0, 4)).toBe(true); // diagonal
  });

  it("rejects far-apart live cells", () => {
    expect(areConnected(board, 0, 5)).toBe(false);
    expect(areConnected(board, 0, 8)).toBe(false);
  });

  it("links cells that become consecutive once cleared cells are skipped", () => {
    const gapped = boardOf(
      [1, 0, 0],
      [0, 0, 0],
      [0, 0, 9],
    );
    expect(areConnected(gapped, 0, 8)).toBe(true);
  });

  it("wraps from the end of a row to the start of the next", () => {
    expect(areConnected(board, 2, 3)).toBe(true);
  });

  it("never links a cleared cell", () => {
    const gapped = boardOf([1, 0, 3]);
    expect(areConnected(gapped, 0, 1)).toBe(false);
  });

  it("reports neighbours consistently with areConnected", () => {
    const gapped = boardOf(
      [1, 0, 3],
      [0, 5, 0],
      [7, 0, 9],
    );
    for (let i = 0; i < gapped.cells.length; i++) {
      const listed = new Set(connectedNeighbours(gapped, i));
      for (let j = 0; j < gapped.cells.length; j++) {
        expect(listed.has(j)).toBe(areConnected(gapped, i, j));
      }
    }
  });
});

describe("evaluateSelection", () => {
  const board = boardOf(
    [3, 7, 4],
    [3, 6, 2],
    [1, 2, 9],
  );

  it("clears two tiles that sum to ten", () => {
    expect(evaluateSelection(board, [0, 1])).toEqual({ ok: true, score: 10 });
  });

  it("clears two tiles showing the same number", () => {
    expect(evaluateSelection(board, [0, 3])).toEqual({ ok: true, score: 10 });
  });

  it("scores a three-tile chain above a pair, diagonals included", () => {
    // 3 (0,0) + 6 (1,1) + 1 (2,0): right-down diagonal, then down-left diagonal.
    expect(evaluateSelection(board, [0, 4, 6])).toEqual({ ok: true, score: 30 });
  });

  it("requires an exact ten beyond two tiles", () => {
    // 4 + 7 + 3 = 14
    expect(evaluateSelection(board, [2, 1, 0]).failure).toBe("bad-sum");
  });

  it("does not extend the same-number shortcut past two tiles", () => {
    const twins = boardOf([3, 3, 3]);
    expect(evaluateSelection(twins, [0, 1])).toEqual({ ok: true, score: 10 });
    expect(evaluateSelection(twins, [0, 1, 2]).failure).toBe("bad-sum");
  });

  it("rejects a broken chain even when the sum is right", () => {
    const spread = boardOf(
      [1, 9, 5],
      [5, 5, 5],
      [5, 5, 9],
    );
    expect(evaluateSelection(spread, [0, 8]).failure).toBe("disconnected");
  });

  it("rejects fewer than two and more than five tiles", () => {
    const ones = boardOf([1, 1, 1], [1, 1, 1]);
    expect(evaluateSelection(ones, [0]).failure).toBe("too-few");
    expect(evaluateSelection(ones, [0, 1, 2, 3, 4, 5]).failure).toBe("too-many");
  });

  it("rejects a repeated tile", () => {
    expect(evaluateSelection(board, [0, 0]).failure).toBe("duplicate");
  });

  it("rejects an already cleared tile", () => {
    const gapped = boardOf([3, 0, 7]);
    expect(evaluateSelection(gapped, [0, 1]).failure).toBe("cleared");
  });

  it("awards the full curve by tile count", () => {
    expect(evaluateSelection(boardOf([4, 6]), [0, 1]).score).toBe(10);
    expect(evaluateSelection(boardOf([4, 3, 3]), [0, 1, 2]).score).toBe(30);
    expect(evaluateSelection(boardOf([1, 2, 3, 4]), [0, 1, 2, 3]).score).toBe(70);
    expect(evaluateSelection(boardOf([1, 2, 3, 2, 2]), [0, 1, 2, 3, 4]).score).toBe(150);
  });

  it("counts a chain in the order the player drew it", () => {
    // 2 -> 3 -> 1 -> 4 walks left and right along the row, but every step touches.
    const chain = boardOf([1, 2, 3, 4]);
    expect(evaluateSelection(chain, [1, 2, 0, 3]).failure).toBe("disconnected");
    expect(evaluateSelection(chain, [3, 2, 1, 0]).score).toBe(70);
  });
});

describe("collapseRows", () => {
  it("removes fully cleared rows and pulls the rest up", () => {
    const board = boardOf(
      [1, 2, 3],
      [0, 0, 0],
      [7, 8, 9],
    );
    const { board: next, removed } = collapseRows(board);
    expect(removed).toBe(1);
    expect(next.cells.map((c) => c.value)).toEqual([1, 2, 3, 7, 8, 9]);
  });

  it("keeps a row that still has one live tile", () => {
    const board = boardOf([0, 0, 3], [0, 0, 0]);
    const { board: next, removed } = collapseRows(board);
    expect(removed).toBe(1);
    expect(next.cells).toHaveLength(3);
  });
});

describe("appendRemaining", () => {
  it("copies live values onto the end in reading order", () => {
    const board = boardOf([1, 0, 3], [4, 0, 0]);
    const next = appendRemaining(board);
    expect(next.cells).toHaveLength(9);
    expect(next.cells.slice(6).map((c) => c.value)).toEqual([1, 3, 4]);
    expect(next.cells.slice(6).every((c) => !c.cleared)).toBe(true);
  });
});

describe("findHint", () => {
  it("returns a selection the rules accept", () => {
    const board = boardOf(
      [4, 8, 2],
      [5, 1, 7],
      [9, 3, 6],
    );
    const hint = findHint(board);
    expect(hint).not.toBeNull();
    expect(evaluateSelection(board, hint!).ok).toBe(true);
  });

  it("finds a same-number pair when no sum of ten exists", () => {
    const board = boardOf([9, 9]);
    expect(findHint(board)).toEqual([0, 1]);
  });

  it("reports a stuck board", () => {
    // 9 and 8 are not equal, sum to 17, and nothing else is live.
    const board = boardOf([9, 8]);
    expect(findHint(board)).toBeNull();
    expect(hasAnyMove(board)).toBe(false);
  });

  it("treats an empty board as having no moves", () => {
    expect(hasAnyMove(boardOf([0, 0, 0]))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  areConnected,
  collapseRows,
  connectedNeighbours,
  createBoard,
  hasArithmeticMove,
  makeGroup,
  shuffleSurvivors,
} from "./board";
import { mulberry32 } from "./rng";
import { evaluateSelection } from "./rules";
import { findHint, hasAnyMove } from "./hint";
import type { Board } from "./types";

/** Builds a board from rows of digits; 0 marks an already-cleared square. */
function boardOf(...rows: number[][]): Board {
  const width = rows[0]!.length;
  const cells = rows.flat().map((v) => ({ value: v === 0 ? 1 : v, cleared: v === 0 }));
  return { width, cells };
}

describe("line of sight", () => {
  const full = boardOf(
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  );

  it("links neighbours in all eight directions", () => {
    expect(areConnected(full, 4, 1)).toBe(true); // up
    expect(areConnected(full, 4, 7)).toBe(true); // down
    expect(areConnected(full, 4, 3)).toBe(true); // left
    expect(areConnected(full, 4, 5)).toBe(true); // right
    expect(areConnected(full, 4, 0)).toBe(true); // diagonal
    expect(areConnected(full, 4, 8)).toBe(true); // diagonal
  });

  it("blocks a line that a surviving tile stands in", () => {
    expect(areConnected(full, 0, 2)).toBe(false); // 1 blocks the way
    expect(areConnected(full, 0, 6)).toBe(false);
    expect(areConnected(full, 0, 8)).toBe(false);
  });

  it("sees straight through cleared squares, however many", () => {
    const gapped = boardOf(
      [1, 0, 3],
      [0, 0, 0],
      [7, 0, 9],
    );
    expect(areConnected(gapped, 0, 2)).toBe(true); // along the row
    expect(areConnected(gapped, 0, 6)).toBe(true); // down the column
    expect(areConnected(gapped, 0, 8)).toBe(true); // along the diagonal
  });

  it("never links tiles that share no straight line", () => {
    const gapped = boardOf(
      [1, 0, 0],
      [0, 0, 0],
      [0, 9, 0],
    );
    expect(areConnected(gapped, 0, 7)).toBe(false); // a knight's move apart
  });

  it("does not wrap from the end of a row to the start of the next", () => {
    const gapped = boardOf(
      [0, 0, 3],
      [4, 0, 0],
    );
    expect(areConnected(gapped, 2, 3)).toBe(false);
  });

  it("never links a cleared cell", () => {
    expect(areConnected(boardOf([1, 0, 3]), 0, 1)).toBe(false);
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
  it("clears two connected tiles that add up to ten", () => {
    expect(evaluateSelection(boardOf([4, 6]), [0, 1])).toEqual({ ok: true, score: 10 });
  });

  it("accepts a repeated value inside a chain", () => {
    // 1 + 1 + 8 is a legal chain even though two tiles show the same number.
    expect(evaluateSelection(boardOf([1, 1, 8]), [0, 1, 2])).toEqual({ ok: true, score: 30 });
  });

  it("refuses two tiles that merely show the same number", () => {
    expect(evaluateSelection(boardOf([3, 3]), [0, 1]).failure).toBe("bad-sum");
    expect(evaluateSelection(boardOf([9, 9]), [0, 1]).failure).toBe("bad-sum");
  });

  it("still accepts a same-number pair when it happens to make ten", () => {
    expect(evaluateSelection(boardOf([5, 5]), [0, 1]).ok).toBe(true);
  });

  it("requires an exact ten", () => {
    expect(evaluateSelection(boardOf([4, 7]), [0, 1]).failure).toBe("bad-sum");
    expect(evaluateSelection(boardOf([1, 2]), [0, 1]).failure).toBe("bad-sum");
  });

  it("rejects a broken chain even when the sum is right", () => {
    const blocked = boardOf([2, 5, 8]); // the 5 stands between 2 and 8
    expect(evaluateSelection(blocked, [0, 2]).failure).toBe("disconnected");
  });

  it("rejects fewer than two and more than five tiles", () => {
    const row = boardOf([1, 1, 1, 1, 1, 5]);
    expect(evaluateSelection(row, [0]).failure).toBe("too-few");
    expect(evaluateSelection(row, [0, 1, 2, 3, 4, 5]).failure).toBe("too-many");
  });

  it("rejects a repeated tile and an already cleared one", () => {
    expect(evaluateSelection(boardOf([4, 6]), [0, 0]).failure).toBe("duplicate");
    expect(evaluateSelection(boardOf([4, 0, 6]), [0, 1]).failure).toBe("cleared");
  });

  it("awards the full curve by tile count", () => {
    expect(evaluateSelection(boardOf([4, 6]), [0, 1]).score).toBe(10);
    expect(evaluateSelection(boardOf([4, 3, 3]), [0, 1, 2]).score).toBe(30);
    expect(evaluateSelection(boardOf([1, 2, 3, 4]), [0, 1, 2, 3]).score).toBe(70);
    expect(evaluateSelection(boardOf([1, 2, 3, 2, 2]), [0, 1, 2, 3, 4]).score).toBe(150);
  });

  it("counts the chain in the order the player drew it", () => {
    const chain = boardOf([1, 2, 3, 4]);
    expect(evaluateSelection(chain, [1, 2, 0, 3]).failure).toBe("disconnected");
    expect(evaluateSelection(chain, [3, 2, 1, 0]).score).toBe(70);
  });
});

describe("makeGroup", () => {
  it("always produces values in range that add up to ten", () => {
    const rng = mulberry32(7);
    for (let parts = 2; parts <= 5; parts++) {
      for (let run = 0; run < 200; run++) {
        const group = makeGroup(rng, parts);
        expect(group).toHaveLength(parts);
        expect(group.reduce((a, b) => a + b, 0)).toBe(10);
        for (const v of group) expect(v).toBeGreaterThanOrEqual(1);
        for (const v of group) expect(v).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe("createBoard", () => {
  it("fills the board exactly and totals a multiple of ten", () => {
    const shapes: [number, number][] = [
      [5, 8],
      [6, 9],
      [7, 11],
      [9, 14],
    ];
    for (const [w, r] of shapes) {
      const board = createBoard(mulberry32(w * r), w, r);
      expect(board.cells).toHaveLength(w * r);
      const total = board.cells.reduce((a, c) => a + c.value, 0);
      expect(total % 10).toBe(0);
    }
  });

  it("deals values that can be partitioned into tens, so a full clear is possible", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const board = createBoard(mulberry32(seed), 6, 9);
      expect(hasArithmeticMove(board)).toBe(true);
    }
  });
});

describe("collapseRows", () => {
  it("removes fully cleared rows and pulls the rest up", () => {
    const { board, removed } = collapseRows(boardOf([1, 2, 3], [0, 0, 0], [7, 8, 9]));
    expect(removed).toBe(1);
    expect(board.cells.map((c) => c.value)).toEqual([1, 2, 3, 7, 8, 9]);
  });
});

describe("shuffleSurvivors", () => {
  it("keeps every surviving number and drops the holes", () => {
    const before = boardOf([1, 0, 3], [4, 0, 0]);
    const after = shuffleSurvivors(before, mulberry32(5));
    expect(after.cells).toHaveLength(3);
    expect(after.cells.every((c) => !c.cleared)).toBe(true);
    expect(after.cells.map((c) => c.value).sort()).toEqual([1, 3, 4]);
  });

  it("never grows the board", () => {
    const before = createBoard(mulberry32(3), 6, 9);
    const after = shuffleSurvivors(before, mulberry32(4));
    expect(after.cells.length).toBeLessThanOrEqual(before.cells.length);
  });
});

describe("hasArithmeticMove", () => {
  it("sees a combination that only a rearrangement could reach", () => {
    // Only 9+1 makes ten, and they sit a knight's move apart with no line.
    const scattered = boardOf([9, 2, 2], [2, 2, 1]);
    expect(hasAnyMove(scattered)).toBe(false);
    expect(hasArithmeticMove(scattered)).toBe(true);
  });

  it("reports a board no shuffle could rescue", () => {
    expect(hasArithmeticMove(boardOf([9, 9, 9]))).toBe(false);
    expect(hasArithmeticMove(boardOf([8, 8]))).toBe(false);
  });

  it("treats an empty board as having nothing left to do", () => {
    expect(hasArithmeticMove(boardOf([0, 0, 0]))).toBe(false);
  });
});

describe("findHint", () => {
  it("returns a selection the rules accept", () => {
    const board = createBoard(mulberry32(11), 6, 9);
    const hint = findHint(board);
    expect(hint).not.toBeNull();
    expect(evaluateSelection(board, hint!).ok).toBe(true);
  });

  it("prefers the longest chain it can find", () => {
    // 1+2+3+4 is available along the row; so is the shorter 4+6.
    const board = boardOf([1, 2, 3, 4], [0, 0, 0, 0]);
    expect(findHint(board)).toHaveLength(4);
  });

  it("reports a stuck board", () => {
    expect(findHint(boardOf([9, 8]))).toBeNull();
    expect(hasAnyMove(boardOf([9, 8]))).toBe(false);
  });
});

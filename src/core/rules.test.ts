import { describe, expect, it } from "vitest";
import { collapseRows, createBoard, makeGroup, valueCounts } from "./board";
import { mulberry32 } from "./rng";
import { evaluateSelection } from "./rules";
import { findHint, findValueCombo, hasAnyMove, locate } from "./solver";
import type { Board } from "./types";

/** Builds a board from rows of digits; 0 marks an already-cleared square. */
function boardOf(...rows: number[][]): Board {
  const width = rows[0]!.length;
  const cells = rows.flat().map((v) => ({ value: v === 0 ? 1 : v, cleared: v === 0 }));
  return { width, cells };
}

describe("evaluateSelection", () => {
  it("clears two tiles that add up to ten", () => {
    expect(evaluateSelection(boardOf([4, 6]), [0, 1])).toEqual({ ok: true, score: 10 });
  });

  it("ignores where the tiles sit, however far apart", () => {
    // The 1 and the 9 sit in opposite corners with live tiles all between.
    const spread = boardOf([1, 5, 5], [5, 5, 5], [5, 5, 9]);
    expect(evaluateSelection(spread, [0, 8])).toEqual({ ok: true, score: 10 });
  });

  it("accepts repeated values inside a chain", () => {
    expect(evaluateSelection(boardOf([1, 1, 1, 7]), [0, 1, 2, 3])).toEqual({ ok: true, score: 40 });
    expect(evaluateSelection(boardOf([1, 1, 8]), [0, 1, 2])).toEqual({ ok: true, score: 20 });
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
    expect(evaluateSelection(boardOf([4, 3, 3]), [0, 1, 2]).score).toBe(20);
    expect(evaluateSelection(boardOf([1, 2, 3, 4]), [0, 1, 2, 3]).score).toBe(40);
    expect(evaluateSelection(boardOf([1, 2, 3, 2, 2]), [0, 1, 2, 3, 4]).score).toBe(80);
  });

  it("does not care what order the tiles were picked in", () => {
    const chain = boardOf([1, 2, 3, 4]);
    expect(evaluateSelection(chain, [3, 1, 0, 2]).score).toBe(40);
    expect(evaluateSelection(chain, [0, 1, 2, 3]).score).toBe(40);
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
        for (const v of group) {
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(9);
        }
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
      expect(board.cells.reduce((a, c) => a + c.value, 0) % 10).toBe(0);
    }
  });

  it("deals values that can always make ten, so no board opens dead", () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(hasAnyMove(createBoard(mulberry32(seed), 6, 9))).toBe(true);
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

describe("findValueCombo", () => {
  const counts = (...values: number[]) => {
    const out = new Array(10).fill(0);
    for (const v of values) out[v]++;
    return out;
  };

  it("prefers the longest combination available", () => {
    expect(findValueCombo(counts(1, 2, 3, 4, 6))).toHaveLength(4); // 1+2+3+4
  });

  it("uses a value as many times as the board holds it", () => {
    expect(findValueCombo(counts(1, 1, 1, 7))).toEqual([1, 1, 1, 7]);
  });

  it("never uses a value more often than it appears", () => {
    // One 5 alone cannot make ten; 5+5 needs two of them.
    expect(findValueCombo(counts(5, 9, 8))).toBeNull();
    expect(findValueCombo(counts(5, 5))).toEqual([5, 5]);
  });

  it("reports a board that no arrangement could rescue", () => {
    expect(findValueCombo(counts(9, 9, 9))).toBeNull();
    expect(findValueCombo(counts(8, 8))).toBeNull();
    expect(findValueCombo(counts())).toBeNull();
  });
});

describe("findHint", () => {
  it("returns a selection the rules accept", () => {
    const board = createBoard(mulberry32(11), 6, 9);
    const hint = findHint(board);
    expect(hint).not.toBeNull();
    expect(evaluateSelection(board, hint!).ok).toBe(true);
  });

  it("finds tiles that are nowhere near each other", () => {
    const spread = boardOf([9, 5, 5], [5, 5, 5], [5, 5, 1]);
    const hint = findHint(spread);
    expect(hint).not.toBeNull();
    expect(evaluateSelection(spread, hint!).ok).toBe(true);
  });

  it("skips cleared tiles when locating a combination", () => {
    const board = boardOf([4, 0, 6]);
    expect(locate(board, [4, 6])).toEqual([0, 2]);
    expect(valueCounts(board)).toHaveLength(10);
  });

  it("reports a stuck board", () => {
    expect(findHint(boardOf([9, 8]))).toBeNull();
    expect(hasAnyMove(boardOf([9, 8]))).toBe(false);
  });
});

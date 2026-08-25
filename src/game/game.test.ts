import { describe, expect, it } from "vitest";
import { aliveCount } from "./board";
import {
  INITIAL_ADDS,
  INITIAL_HINTS,
  commitSelection,
  newGame,
  useAdd,
  useHint,
} from "./game";
import { evaluateSelection } from "./rules";
import type { GameState } from "./game";
import type { Board } from "./types";

function boardOf(...rows: number[][]): Board {
  const width = rows[0]!.length;
  const cells = rows.flat().map((v) => ({ value: v === 0 ? 1 : v, cleared: v === 0 }));
  return { width, cells };
}

function stateWith(board: Board, overrides: Partial<GameState> = {}): GameState {
  return {
    board,
    score: 0,
    addsLeft: INITIAL_ADDS,
    hintsLeft: INITIAL_HINTS,
    status: "playing",
    seed: 1,
    ...overrides,
  };
}

describe("newGame", () => {
  it("is reproducible from a seed", () => {
    expect(newGame(42).board).toEqual(newGame(42).board);
  });

  it("opens with 27 tiles and a playable board", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const game = newGame(seed);
      expect(game.board.cells).toHaveLength(27);
      expect(aliveCount(game.board)).toBe(27);
      expect(game.status).toBe("playing");
      expect(useHint(game).indices).not.toBeNull();
    }
  });
});

describe("commitSelection", () => {
  it("adds the score and clears the tiles", () => {
    const before = stateWith(boardOf([4, 6, 2], [1, 3, 5]));
    const { state, result } = commitSelection(before, [0, 1]);
    expect(result.ok).toBe(true);
    expect(state.score).toBe(10);
    expect(aliveCount(state.board)).toBe(4);
  });

  it("leaves the state untouched on an illegal selection", () => {
    const before = stateWith(boardOf([4, 6, 2], [1, 3, 5]));
    const { state, result } = commitSelection(before, [0, 2]);
    expect(result.ok).toBe(false);
    expect(state).toBe(before);
  });

  it("drops a row once every tile in it is gone", () => {
    const before = stateWith(boardOf([4, 6, 0], [1, 3, 5]));
    const { state, rowsRemoved } = commitSelection(before, [0, 1]);
    expect(rowsRemoved).toBe(1);
    expect(state.board.cells.map((c) => c.value)).toEqual([1, 3, 5]);
  });

  it("wins when the last tile is cleared", () => {
    const { state } = commitSelection(stateWith(boardOf([4, 6])), [0, 1]);
    expect(state.status).toBe("won");
  });

  it("loses when no move is left and no add remains", () => {
    const before = stateWith(boardOf([4, 6, 9, 8]), { addsLeft: 0 });
    const { state } = commitSelection(before, [0, 1]);
    expect(state.status).toBe("lost");
  });

  it("keeps playing while an add could still rescue the board", () => {
    const before = stateWith(boardOf([4, 6, 9, 8]), { addsLeft: 1 });
    const { state } = commitSelection(before, [0, 1]);
    expect(state.status).toBe("playing");
  });
});

describe("useAdd", () => {
  it("appends the survivors and spends one add", () => {
    const before = stateWith(boardOf([9, 0, 8]));
    const after = useAdd(before);
    expect(after.addsLeft).toBe(INITIAL_ADDS - 1);
    expect(after.board.cells.map((c) => c.value)).toEqual([9, 1, 8, 9, 8]);
  });

  it("can revive a stuck board", () => {
    // 9 and 8 alone are dead, but a second 9 next to the first is a pair.
    const before = stateWith(boardOf([9, 8]));
    expect(useHint(before).indices).toBeNull();
    expect(useHint(useAdd(before)).indices).not.toBeNull();
  });

  it("does nothing once adds run out", () => {
    const before = stateWith(boardOf([9, 8]), { addsLeft: 0 });
    expect(useAdd(before)).toBe(before);
  });
});

describe("useHint", () => {
  it("spends a hint and returns a legal selection", () => {
    const before = stateWith(boardOf([4, 6, 2], [1, 3, 5]));
    const { state, indices } = useHint(before);
    expect(indices).not.toBeNull();
    expect(evaluateSelection(before.board, indices!).ok).toBe(true);
    expect(state.hintsLeft).toBe(INITIAL_HINTS - 1);
  });

  it("does not spend a hint when the board is stuck", () => {
    const before = stateWith(boardOf([9, 8]));
    const { state, indices } = useHint(before);
    expect(indices).toBeNull();
    expect(state.hintsLeft).toBe(INITIAL_HINTS);
  });

  it("does nothing once hints run out", () => {
    const before = stateWith(boardOf([4, 6]), { hintsLeft: 0 });
    expect(useHint(before).indices).toBeNull();
  });
});

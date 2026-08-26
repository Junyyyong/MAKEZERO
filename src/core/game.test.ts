import { describe, expect, it } from "vitest";
import { aliveCount } from "./board";
import { commitSelection, newGame, stars, tick, useHint } from "./game";
import { evaluateSelection } from "./rules";
import { ENDLESS_CONFIG, TIME_ATTACK_CONFIG, stageConfig } from "../content/stages";
import type { GameState } from "./game";
import type { Board, RunConfig } from "./types";

function boardOf(...rows: number[][]): Board {
  const width = rows[0]!.length;
  const cells = rows.flat().map((v) => ({ value: v === 0 ? 1 : v, cleared: v === 0 }));
  return { width, cells };
}

function stateWith(board: Board, overrides: Partial<GameState> = {}): GameState {
  const config: RunConfig = overrides.config ?? ENDLESS_CONFIG;
  return {
    config,
    board,
    score: 0,
    hintsLeft: config.hints,
    status: "playing",
    startingCells: board.cells.length,
    remainingMs: config.timeLimitMs ?? 0,
    nextSeed: 1,
    ...overrides,
  };
}

describe("newGame", () => {
  it("is reproducible from a seed", () => {
    expect(newGame(ENDLESS_CONFIG, 42).board).toEqual(newGame(ENDLESS_CONFIG, 42).board);
  });

  it("deals the configured board, full and playable", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const game = newGame(ENDLESS_CONFIG, seed);
      expect(game.board.cells).toHaveLength(ENDLESS_CONFIG.width * ENDLESS_CONFIG.rows);
      expect(aliveCount(game.board)).toBe(game.board.cells.length);
      expect(game.status).toBe("playing");
      expect(useHint(game).indices).not.toBeNull();
    }
  });

  it("takes its board and resources from the config", () => {
    const config = stageConfig(7);
    const game = newGame(config, 5);
    expect(game.board.width).toBe(config.width);
    expect(game.board.cells).toHaveLength(config.width * config.rows);
    expect(game.hintsLeft).toBe(config.hints);
    expect(game.startingCells).toBe(config.width * config.rows);
  });
});

describe("commitSelection", () => {
  it("adds the score and clears the tiles", () => {
    const { state, result } = commitSelection(stateWith(boardOf([4, 6, 2], [1, 3, 5])), [0, 1]);
    expect(result.ok).toBe(true);
    expect(state.score).toBe(10);
    expect(aliveCount(state.board)).toBe(4);
  });

  it("leaves the state untouched on an illegal selection", () => {
    const before = stateWith(boardOf([4, 6, 2], [1, 3, 5]));
    const { state, result } = commitSelection(before, [0, 3]); // 4 + 1
    expect(result.ok).toBe(false);
    expect(state).toBe(before);
  });

  it("drops a row once every tile in it is gone", () => {
    const { state, rowsRemoved } = commitSelection(stateWith(boardOf([4, 6, 0], [1, 3, 5])), [0, 1]);
    expect(rowsRemoved).toBe(1);
    expect(state.board.cells.map((c) => c.value)).toEqual([1, 3, 5]);
  });

  it("wins when the last tile is cleared", () => {
    const { state } = commitSelection(stateWith(boardOf([4, 6])), [0, 1]);
    expect(state.status).toBe("won");
    expect(stars(state)).toBe(3);
  });

  it("ends the run exactly when nothing left can make ten", () => {
    const { state } = commitSelection(stateWith(boardOf([4, 6, 9, 8])), [0, 1]);
    expect(state.status).toBe("lost");
  });

  it("keeps playing while a combination survives anywhere on the board", () => {
    // The 9 and the 1 are at opposite ends, which no longer matters.
    const { state } = commitSelection(stateWith(boardOf([9, 4, 6, 2], [2, 2, 2, 1])), [1, 2]);
    expect(state.status).toBe("playing");
  });
});

describe("stars", () => {
  const graded = (left: number) =>
    stars(
      stateWith(boardOf(Array.from({ length: Math.max(left, 1) }, () => (left ? 9 : 0))), {
        config: { ...ENDLESS_CONFIG, starTargets: [16, 10, 5] },
      }),
    );

  it("reads the targets off the run's own config", () => {
    expect(graded(0)).toBe(3);
    expect(graded(5)).toBe(3);
    expect(graded(6)).toBe(2);
    expect(graded(11)).toBe(1);
    expect(graded(17)).toBe(0);
  });
});

describe("time attack", () => {
  const timed = (board: Board) => stateWith(board, { config: TIME_ATTACK_CONFIG });

  it("starts with a full minute on the clock", () => {
    expect(newGame(TIME_ATTACK_CONFIG, 3).remainingMs).toBe(60_000);
  });

  it("runs the clock down and ends at zero", () => {
    const mid = tick(newGame(TIME_ATTACK_CONFIG, 3), 59_000);
    expect(mid.remainingMs).toBe(1_000);
    expect(mid.status).toBe("playing");
    expect(tick(mid, 1_000).status).toBe("timeUp");
  });

  it("never overshoots zero and stops ticking once time is up", () => {
    const done = tick(newGame(TIME_ATTACK_CONFIG, 3), 99_999);
    expect(done.remainingMs).toBe(0);
    expect(tick(done, 1_000)).toBe(done);
  });

  it("deals a fresh board instead of winning when the last tile goes", () => {
    const { state } = commitSelection(timed(boardOf([4, 6])), [0, 1]);
    expect(state.status).toBe("playing");
    expect(aliveCount(state.board)).toBeGreaterThan(0);
    expect(state.score).toBe(10);
  });

  it("redeals instead of losing on a dead board", () => {
    const { state } = commitSelection(timed(boardOf([4, 6, 9, 8])), [0, 1]);
    expect(state.status).toBe("playing");
    expect(useHint({ ...state, hintsLeft: 1 }).indices).not.toBeNull();
  });
});

describe("useHint", () => {
  it("spends a hint and returns a legal selection", () => {
    const before = stateWith(boardOf([4, 6, 2], [1, 3, 5]));
    const { state, indices } = useHint(before);
    expect(indices).not.toBeNull();
    expect(evaluateSelection(before.board, indices!).ok).toBe(true);
    expect(state.hintsLeft).toBe(ENDLESS_CONFIG.hints - 1);
  });

  it("does not spend a hint when the board is dead", () => {
    const before = stateWith(boardOf([9, 8]));
    const { state, indices } = useHint(before);
    expect(indices).toBeNull();
    expect(state.hintsLeft).toBe(ENDLESS_CONFIG.hints);
  });
});

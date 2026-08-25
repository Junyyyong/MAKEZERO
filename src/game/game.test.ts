import { describe, expect, it } from "vitest";
import { UNIFORM_WEIGHTS, aliveCount } from "./board";
import { commitSelection, newGame, tick, useAdd, useHint } from "./game";
import { evaluateSelection } from "./rules";
import { ENDLESS_CONFIG, TIME_ATTACK_CONFIG, stageConfig } from "./story";
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
    addsLeft: config.adds,
    hintsLeft: config.hints,
    status: "playing",
    remainingMs: config.timeLimitMs ?? 0,
    nextSeed: 1,
    ...overrides,
  };
}

describe("newGame", () => {
  it("is reproducible from a seed", () => {
    expect(newGame(ENDLESS_CONFIG, 42).board).toEqual(newGame(ENDLESS_CONFIG, 42).board);
  });

  it("opens endless with 27 tiles and a playable board", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const game = newGame(ENDLESS_CONFIG, seed);
      expect(game.board.cells).toHaveLength(27);
      expect(aliveCount(game.board)).toBe(27);
      expect(game.status).toBe("playing");
      expect(useHint(game).indices).not.toBeNull();
    }
  });

  it("takes its resources from the config", () => {
    const game = newGame(stageConfig(7), 5);
    const config = stageConfig(7);
    expect(game.addsLeft).toBe(config.adds);
    expect(game.hintsLeft).toBe(config.hints);
    expect(game.board.cells).toHaveLength(config.rows * 9);
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

describe("time attack", () => {
  const timed = (board: Board, overrides: Partial<GameState> = {}) =>
    stateWith(board, { config: TIME_ATTACK_CONFIG, ...overrides });

  it("starts with a full minute on the clock", () => {
    expect(newGame(TIME_ATTACK_CONFIG, 3).remainingMs).toBe(60_000);
  });

  it("runs the clock down and ends at zero", () => {
    const start = newGame(TIME_ATTACK_CONFIG, 3);
    const mid = tick(start, 59_000);
    expect(mid.remainingMs).toBe(1_000);
    expect(mid.status).toBe("playing");
    const done = tick(mid, 1_000);
    expect(done.remainingMs).toBe(0);
    expect(done.status).toBe("timeUp");
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
  });

  it("tops the board up instead of losing on a deadlock", () => {
    const { state } = commitSelection(timed(boardOf([4, 6, 9, 8])), [0, 1]);
    expect(state.status).toBe("playing");
    expect(useHint({ ...state, hintsLeft: 1 }).indices).not.toBeNull();
  });

  it("keeps the score across a refill", () => {
    const { state } = commitSelection(timed(boardOf([4, 6])), [0, 1]);
    expect(state.score).toBe(10);
  });
});

describe("useAdd", () => {
  it("appends the survivors and spends one add", () => {
    const before = stateWith(boardOf([9, 0, 8]));
    const after = useAdd(before);
    expect(after.addsLeft).toBe(ENDLESS_CONFIG.adds - 1);
    expect(after.board.cells.map((c) => c.value)).toEqual([9, 1, 8, 9, 8]);
  });

  it("can revive a stuck board", () => {
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
    expect(state.hintsLeft).toBe(ENDLESS_CONFIG.hints - 1);
  });

  it("does not spend a hint when the board is stuck", () => {
    const before = stateWith(boardOf([9, 8]));
    const { state, indices } = useHint(before);
    expect(indices).toBeNull();
    expect(state.hintsLeft).toBe(ENDLESS_CONFIG.hints);
  });

  it("does nothing once hints run out", () => {
    const before = stateWith(boardOf([4, 6]), { hintsLeft: 0 });
    expect(useHint(before).indices).toBeNull();
  });
});

describe("weighted spawning", () => {
  it("leans on high numbers as stages climb", () => {
    const share = (config: RunConfig) => {
      const board = newGame(config, 7).board;
      const big = board.cells.filter((c) => c.value >= 7).length;
      return big / board.cells.length;
    };
    const early = share({ ...stageConfig(1), rows: 12 });
    const late = share({ ...stageConfig(20), rows: 12 });
    expect(stageConfig(1).weights).toEqual(UNIFORM_WEIGHTS);
    expect(late).toBeGreaterThan(early);
  });
});

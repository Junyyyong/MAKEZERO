import { describe, expect, it } from "vitest";
import { aliveCount, emptyIndices } from "./board";
import { commitSelection, newGame, spawnIntervalMs, stars, tick, useHint } from "./game";
import { evaluateSelection } from "./rules";
import { ENDLESS_CONFIG, TIME_ATTACK_CONFIG, stageConfig } from "../content/stages";

/** An untimed run with no tiles arriving — the simplest case to reason about. */
const PLAIN = stageConfig(1);
import type { GameState } from "./game";
import type { Board, RunConfig } from "./types";

function boardOf(...rows: number[][]): Board {
  const width = rows[0]!.length;
  const cells = rows.flat().map((v) => ({ value: v === 0 ? 1 : v, cleared: v === 0 }));
  return { width, cells };
}

function stateWith(board: Board, overrides: Partial<GameState> = {}): GameState {
  const config: RunConfig = overrides.config ?? PLAIN;
  return {
    config,
    board,
    score: 0,
    hintsLeft: config.hints,
    status: "playing",
    startingCells: board.cells.length,
    remainingMs: config.timeLimitMs ?? 0,
    untilSpawnMs: Infinity,
    spawnCount: 0,
    nextSeed: 1,
    ...overrides,
  };
}

describe("newGame", () => {
  it("is reproducible from a seed", () => {
    expect(newGame(PLAIN, 42).board).toEqual(newGame(PLAIN, 42).board);
  });

  it("deals the configured board, full and playable", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const game = newGame(PLAIN, seed);
      expect(game.board.cells).toHaveLength(PLAIN.width * PLAIN.rows);
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
        config: { ...PLAIN, starTargets: [16, 10, 5] },
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
    expect(state.hintsLeft).toBe(PLAIN.hints - 1);
  });

  it("does not spend a hint when the board is dead", () => {
    const before = stateWith(boardOf([9, 8]));
    const { state, indices } = useHint(before);
    expect(indices).toBeNull();
    expect(state.hintsLeft).toBe(PLAIN.hints);
  });
});

describe("endless survival", () => {
  const spawn = ENDLESS_CONFIG.spawn!;

  it("deals only part of the board, leaving room to land in", () => {
    const game = newGame(ENDLESS_CONFIG, 4);
    const capacity = ENDLESS_CONFIG.width * ENDLESS_CONFIG.rows;
    expect(game.board.cells).toHaveLength(capacity);
    expect(aliveCount(game.board)).toBeLessThan(capacity);
    expect(emptyIndices(game.board).length).toBeGreaterThan(0);
  });

  it("drops a batch once the timer runs out", () => {
    const game = newGame(ENDLESS_CONFIG, 4);
    const before = aliveCount(game.board);
    const waiting = tick(game, spawn.startIntervalMs - 1);
    expect(aliveCount(waiting.board)).toBe(before);
    const landed = tick(waiting, 2);
    expect(aliveCount(landed.board)).toBeGreaterThan(before);
    expect(landed.spawnCount).toBe(1);
  });

  it("keeps every batch a whole group, so the board stays clearable", () => {
    let game = newGame(ENDLESS_CONFIG, 4);
    for (let i = 0; i < 12; i++) game = tick(game, spawn.startIntervalMs);
    const total = game.board.cells.filter((c) => !c.cleared).reduce((a, c) => a + c.value, 0);
    expect(total % 10).toBe(0);
  });

  it("shortens the gap between batches, down to a floor", () => {
    expect(spawnIntervalMs(ENDLESS_CONFIG, 0)).toBe(spawn.startIntervalMs);
    expect(spawnIntervalMs(ENDLESS_CONFIG, 1)).toBeLessThan(spawn.startIntervalMs);
    expect(spawnIntervalMs(ENDLESS_CONFIG, 500)).toBe(spawn.minIntervalMs);
  });

  it("never grows or shrinks the board, so cleared squares stay open", () => {
    const game = newGame(ENDLESS_CONFIG, 4);
    const capacity = game.board.cells.length;
    const hint = useHint(game).indices!;
    const { state: after, rowsRemoved } = commitSelection(game, hint);
    expect(after.board.cells).toHaveLength(capacity);
    expect(rowsRemoved).toBe(0);
  });

  it("plays on with an empty board rather than declaring a win", () => {
    const almost = stateWith(boardOf([4, 6, 0, 0]), { config: ENDLESS_CONFIG });
    const { state } = commitSelection(almost, [0, 1]);
    expect(aliveCount(state.board)).toBe(0);
    expect(state.status).toBe("playing");
  });

  it("plays on when nothing can make ten, since a batch may fix it", () => {
    const stuck = stateWith(boardOf([9, 8, 0, 0]), { config: ENDLESS_CONFIG });
    const { state } = commitSelection(stuck, [0, 1]);
    expect(state.status).toBe("playing");
  });

  it("ends when a batch has nowhere to land", () => {
    // A full board with one hole cannot take even the smallest group.
    const packed = stateWith(boardOf([9, 9, 9], [9, 9, 0]), {
      config: ENDLESS_CONFIG,
      untilSpawnMs: 10,
    });
    expect(tick(packed, 20).status).toBe("lost");
  });

  it("survives a long run without the board silently overflowing", () => {
    let game = newGame(ENDLESS_CONFIG, 9);
    const capacity = game.board.cells.length;
    for (let i = 0; i < 200 && game.status === "playing"; i++) {
      game = tick(game, spawnIntervalMs(ENDLESS_CONFIG, game.spawnCount));
      expect(game.board.cells).toHaveLength(capacity);
    }
    expect(game.status).toBe("lost"); // nobody was clearing anything
  });
});

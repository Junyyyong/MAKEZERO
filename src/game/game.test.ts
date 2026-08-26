import { describe, expect, it } from "vitest";
import { aliveCount, createBoard } from "./board";
import { commitSelection, newGame, stars, tick, useHint, useShuffle } from "./game";
import { mulberry32 } from "./rng";
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
    shufflesLeft: config.shuffles,
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
    expect(game.shufflesLeft).toBe(config.shuffles);
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
    const { state, result } = commitSelection(before, [0, 2]);
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

  it("can still earn three stars without emptying the board", () => {
    // Only 9+1 makes ten and no line joins them, so four tiles survive.
    const stranded = stateWith(boardOf([9, 4, 6, 2], [2, 2, 2, 1]), {
      config: { ...ENDLESS_CONFIG, starTargets: [16, 10, 5] },
      shufflesLeft: 0,
    });
    const { state } = commitSelection(stranded, [1, 2]);
    expect(state.status).toBe("lost");
    expect(aliveCount(state.board)).toBe(6);
    expect(stars(state)).toBe(2);
  });

  it("ends the run when nothing can make ten any more", () => {
    // 9 and 8 can never make ten, so shuffling is pointless and the run is over.
    const before = stateWith(boardOf([4, 6, 9, 8]));
    const { state } = commitSelection(before, [0, 1]);
    expect(state.status).toBe("lost");
  });

  // Once 4+6 goes, only 9+1 makes ten, and they sit three columns and a row
  // apart — no straight line joins them, so only a shuffle can save the board.
  const strandedPair = () => boardOf([9, 4, 6, 2], [2, 2, 2, 1]);

  it("keeps playing while a shuffle could still line something up", () => {
    const { state } = commitSelection(stateWith(strandedPair(), { shufflesLeft: 1 }), [1, 2]);
    expect(state.status).toBe("playing");
  });

  it("ends the run when the shuffles are gone", () => {
    const { state } = commitSelection(stateWith(strandedPair(), { shufflesLeft: 0 }), [1, 2]);
    expect(state.status).toBe("lost");
  });
});

describe("stars", () => {
  const targets = [16, 10, 5] as [number, number, number];
  const graded = (left: number) =>
    stars(
      stateWith(boardOf(Array.from({ length: Math.max(left, 1) }, () => (left ? 9 : 0))), {
        config: { ...ENDLESS_CONFIG, starTargets: targets },
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

describe("shuffle", () => {
  it("rearranges the survivors and spends one charge", () => {
    const before = stateWith(boardOf([9, 2, 2], [2, 2, 1]));
    const after = useShuffle(before);
    expect(after.shufflesLeft).toBe(ENDLESS_CONFIG.shuffles - 1);
    expect(after.board.cells.map((c) => c.value).sort()).toEqual([1, 2, 2, 2, 2, 9]);
    expect(after.board.cells).toHaveLength(before.board.cells.length);
  });

  it("never grows the board", () => {
    const before = stateWith(createBoard(mulberry32(3), 6, 9));
    expect(useShuffle(before).board.cells.length).toBeLessThanOrEqual(before.board.cells.length);
  });

  it("does nothing once the charges run out", () => {
    const before = stateWith(boardOf([9, 2, 2], [2, 2, 1]), { shufflesLeft: 0 });
    expect(useShuffle(before)).toBe(before);
  });
});

describe("time attack", () => {
  const timed = (board: Board, overrides: Partial<GameState> = {}) =>
    stateWith(board, { config: TIME_ATTACK_CONFIG, ...overrides });

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

  it("redeals instead of losing on a deadlock", () => {
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

  it("does not spend a hint when the board is stuck", () => {
    const before = stateWith(boardOf([9, 8]));
    const { state, indices } = useHint(before);
    expect(indices).toBeNull();
    expect(state.hintsLeft).toBe(ENDLESS_CONFIG.hints);
  });
});

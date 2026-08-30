import { describe, expect, it } from "vitest";
import { aliveCount, emptyIndices, valueCounts } from "./board";
import { canEmpty } from "./solver";
import { commitSelection, newGame, spawnIntervalMs, splitTile, stars, tick, undo, useHint } from "./game";
import { findHint } from "./solver";
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
    undosLeft: config.undos,
    splitsLeft: config.splits,
    status: "playing",
    startingCells: board.cells.length,
    remainingMs: config.timeLimitMs ?? 0,
    elapsedMs: 0,
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

  it("leaves the holes where they are when the run keeps its board", () => {
    // Story has a picture behind the board, so a row that closed up would drag
    // the holes out of line with the part of it they had uncovered.
    const kept = stateWith(boardOf([4, 6, 9, 1], [3, 7, 2, 8]), {
      config: { ...PLAIN, keepBoard: true },
    });
    const after = commitSelection(kept, [0, 1]).state;
    expect(after.board.cells).toHaveLength(8);
    expect(after.board.cells[0]!.cleared).toBe(true);
    expect(after.board.cells[4]!.value).toBe(3);
  });

  it("drops a row once every tile in it is gone", () => {
    const { state, rowsRemoved } = commitSelection(
      stateWith(boardOf([4, 6, 0], [1, 3, 5]), { config: { ...PLAIN, keepBoard: false } }),
      [0, 1],
    );
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
  const board = (left: number) =>
    boardOf(Array.from({ length: Math.max(left, 1) }, () => (left ? 9 : 0)));
  const story = { ...PLAIN, hints: 3, undos: 3, starTargets: [16, 0, 0] as const };
  const graded = (left: number, over: Partial<GameState> = {}) =>
    stars(stateWith(board(left), { config: story, ...over }));

  it("gives three stars only for an empty board played unaided", () => {
    expect(graded(0)).toBe(3);
    expect(graded(0, { hintsLeft: 2 })).toBe(2); // a hint was spent
    expect(graded(0, { undosLeft: 2 })).toBe(2); // a move was taken back
  });

  it("gives one star for coming close, and none for missing", () => {
    expect(graded(1)).toBe(1);
    expect(graded(16)).toBe(1);
    expect(graded(17)).toBe(0);
  });

  it("still grades the other modes on how few tiles were left", () => {
    const timed = { ...TIME_ATTACK_CONFIG, starTargets: [16, 10, 5] as const };
    const at = (left: number) => stars(stateWith(board(left), { config: timed }));
    expect(at(5)).toBe(3);
    expect(at(6)).toBe(2);
    expect(at(11)).toBe(1);
    expect(at(17)).toBe(0);
  });
});

describe("undo", () => {
  const rowOf = (...values: number[]) => boardOf(values);

  it("puts the board, the score and the status back", () => {
    const start = stateWith(rowOf(4, 6, 9, 1), { config: { ...PLAIN, undos: 2 } });
    const after = commitSelection(start, [0, 1]).state;
    expect(after.score).toBeGreaterThan(0);

    const back = undo(after);
    expect(aliveCount(back.board)).toBe(aliveCount(start.board));
    expect(back.score).toBe(0);
    expect(back.status).toBe("playing");
    expect(back.undosLeft).toBe(1);
  });

  it("rescues a run that has gone dead", () => {
    // 1+2+3+4 clears, and taking it strands 6 and 7 with nothing to pair.
    const start = stateWith(rowOf(1, 2, 3, 4, 6, 7, 9), { config: { ...PLAIN, undos: 1 } });
    const dead = commitSelection(start, [0, 1, 2, 3]).state;
    expect(dead.status).toBe("lost");
    expect(undo(dead).status).toBe("playing");
  });

  it("stops at the start of the run, and when the take-backs are gone", () => {
    const start = stateWith(rowOf(4, 6, 9, 1), { config: { ...PLAIN, undos: 1 } });
    expect(undo(start)).toBe(start); // nothing to go back to

    const after = commitSelection(start, [0, 1]).state;
    const back = undo(after);
    expect(back.undosLeft).toBe(0);
    const again = commitSelection(back, [0, 1]).state;
    expect(undo(again)).toBe(again); // spent
  });

  it("keeps no history at all in the modes that cannot take a move back", () => {
    const start = stateWith(rowOf(4, 6, 9, 1), { config: { ...PLAIN, undos: 0 } });
    expect(commitSelection(start, [0, 1]).state.previous).toBeUndefined();
  });
});

describe("splitTile", () => {
  const splittable = (over: Partial<GameState> = {}) =>
    stateWith(boardOf([5, 5, 9, 1], [0, 0, 0, 0]), {
      config: { ...PLAIN, splits: 2, undos: 0 },
      ...over,
    });

  it("breaks a block into pieces that add up to the same thing", () => {
    const before = splittable();
    const after = splitTile(before, 0, 12345);
    const total = (state: GameState) =>
      state.board.cells.filter((c) => !c.cleared).reduce((sum, c) => sum + c.value, 0);
    expect(after).not.toBe(before);
    expect(total(after)).toBe(total(before));
    expect(aliveCount(after.board)).toBeGreaterThan(aliveCount(before.board));
    expect(after.splitsLeft).toBe(1);
  });

  it("puts the pieces in squares that have already been cleared", () => {
    const before = splittable();
    const after = splitTile(before, 0, 12345);
    // The second row was cleared to start with; that is the only room there is.
    expect(after.board.cells).toHaveLength(before.board.cells.length);
  });

  it("leaves the board still emptiable, whatever the roll", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const after = splitTile(splittable(), 0, seed * 7919);
      const counts = valueCounts(after.board) as number[];
      expect(canEmpty(counts), `seed ${seed}`).toBe(true);
    }
  });

  it("refuses a block worth one, and refuses once the item is spent", () => {
    const ones = stateWith(boardOf([1, 9, 4, 6], [0, 0, 0, 0]), {
      config: { ...PLAIN, splits: 1, undos: 0 },
    });
    expect(splitTile(ones, 0, 7)).toBe(ones); // a 1 has nothing to break into
    const spent = splittable({ splitsLeft: 0 });
    expect(splitTile(spent, 0, 7)).toBe(spent);
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

describe("time attack rewards", () => {
  /** Plays a time-attack run forward by handing it scores directly. */
  const run = (score: number, board?: GameState["board"]): GameState => {
    const base = newGame(TIME_ATTACK_CONFIG, 7);
    return { ...base, score, ...(board ? { board } : {}) };
  };

  /**
   * A board with cleared squares scattered through it.
   *
   * Scattered, not contiguous: time attack drops any row whose every tile is
   * gone, so a solid block of holes would collapse away before the refill
   * ever saw it.
   */
  const withHoles = (score: number, every: number): GameState => {
    const base = run(score);
    const cells = base.board.cells.map((c, i) => ({ ...c, cleared: i % every === 0 }));
    return { ...base, board: { width: base.board.width, cells } };
  };
  const holesIn = (state: GameState): number =>
    state.board.cells.filter((c) => c.cleared).length;

  it("refills nine cleared squares every hundred points", () => {
    const before = withHoles(96, 3);
    const picked = findHint(before.board)!;
    const { state } = commitSelection(before, picked);
    expect(state.score).toBeGreaterThanOrEqual(100);

    // The board is a fixed frame: squares come back to life, none are added.
    expect(state.board.cells.length).toBe(before.board.cells.length);
    // The move opened as many holes as it cleared tiles; nine were then filled.
    expect(holesIn(state)).toBe(holesIn(before) + picked.length - 9);
  });

  it("refills with ones, twos and threes only", () => {
    const before = withHoles(96, 3);
    const picked = findHint(before.board)!;
    // Every square that is a hole by the time the reward runs: the ones that
    // were already open, and the ones this very move just opened.
    const open = new Set([
      ...before.board.cells.flatMap((c, i) => (c.cleared ? [i] : [])),
      ...picked,
    ]);
    const { state } = commitSelection(before, picked);
    const revived = state.board.cells.filter((c, i) => open.has(i) && !c.cleared);
    expect(revived.length).toBe(9);
    expect(revived.every((c) => c.value >= 1 && c.value <= 3)).toBe(true);
  });

  it("gives back only what there is room for", () => {
    // A nearly full board owes nine and has fewer than nine holes to put them
    // in. It fills what it has and stops — it never grows to make room.
    const base = run(96);
    const cells = base.board.cells.map((c, i) => ({ ...c, cleared: i === 4 || i === 40 }));
    const before: GameState = { ...base, board: { width: base.board.width, cells } };
    const picked = findHint(before.board)!;
    const { state } = commitSelection(before, picked);
    expect(state.board.cells.length).toBe(before.board.cells.length);
    expect(2 + picked.length).toBeLessThan(9);
    expect(holesIn(state)).toBe(0);
  });

  it("adds nothing when no hundred is crossed", () => {
    const before = withHoles(10, 3);
    const picked = findHint(before.board)!;
    const { state } = commitSelection(before, picked);
    expect(state.score).toBeLessThan(100);
    expect(holesIn(state)).toBe(holesIn(before) + picked.length);
  });

  it("buys thirty seconds and a fresh board at five hundred", () => {
    const before = run(495);
    const { state } = commitSelection(before, findHint(before.board)!);
    expect(state.score).toBeGreaterThanOrEqual(500);
    expect(state.remainingMs).toBe(before.remainingMs + 30_000);
    // A fresh deck, not the one that was being played.
    expect(state.board.cells.length).toBe(before.startingCells);
    expect(state.board.cells.every((c) => !c.cleared)).toBe(true);
  });

  it("extends only once, however long the run goes on", () => {
    let state = run(495);
    const clock = state.remainingMs;
    ({ state } = commitSelection(state, findHint(state.board)!));
    expect(state.remainingMs).toBe(clock + 30_000);
    // Well past five hundred now; the threshold must not pay again.
    const later = { ...state, score: 900 };
    const { state: after } = commitSelection(later, findHint(later.board)!);
    expect(after.remainingMs).toBe(clock + 30_000);
  });

  it("never shrinks the board — a cleared row stays as holes", () => {
    // The frame is fixed. It used to collapse emptied rows, so a good run
    // watched the board shrink under it (81, 72, 63...) and the refill reward
    // had fewer and fewer squares to put anything back into.
    let state = newGame(TIME_ATTACK_CONFIG, 11);
    const size = state.board.cells.length;
    for (let move = 0; move < 30; move++) {
      const picked = findHint(state.board);
      if (!picked) break;
      ({ state } = commitSelection(state, picked));
      expect(state.board.cells.length).toBe(size);
    }
    // And something actually happened, or the loop proved nothing.
    expect(state.score).toBeGreaterThan(0);
  });

  it("leaves the other modes alone", () => {
    const story = { ...newGame(stageConfig(1), 3), score: 96 };
    const { state } = commitSelection(story, findHint(story.board)!);
    expect(state.board.cells.length).toBeLessThanOrEqual(story.board.cells.length);
    expect(state.remainingMs).toBe(story.remainingMs);
  });
});

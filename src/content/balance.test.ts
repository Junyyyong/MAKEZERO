import { describe, expect, it } from "vitest";
import { aliveCount } from "../core/board";
import { commitSelection, newGame } from "../core/game";
import { findHint } from "../core/solver";
import { TOTAL_STAGES } from "./chapters";
import { stageConfig } from "./stages";

const SEEDS = [1, 2, 3, 5, 8, 13].map((n) => n * 7919);

/** Plays the solver's longest available selection until the board settles. */
function play(stage: number, seed: number) {
  let state = newGame(stageConfig(stage), seed);
  let moves = 0;
  while (state.status === "playing" && moves < 200) {
    const selection = findHint(state.board);
    if (!selection) break;
    const next = commitSelection(state, selection);
    expect(next.result.ok).toBe(true);
    state = next.state;
    moves++;
  }
  return { left: aliveCount(state.board), moves, status: state.status };
}

describe("progressive story deal", () => {
  it("runs ninety-nine stages, all of them nine by nine", () => {
    expect(TOTAL_STAGES).toBe(99);
    const first = stageConfig(1);
    const last = stageConfig(TOTAL_STAGES);
    expect(first.width * first.rows).toBe(81);
    expect(last.width * last.rows).toBe(81);
    // Nine columns throughout, so a block is the same size on every stage.
    for (let stage = 1; stage <= TOTAL_STAGES; stage++) expect(stageConfig(stage).width).toBe(9);
  });

  it("deals totals that can be partitioned into clears of ten", () => {
    for (const stage of [1, 25, 50, 75, TOTAL_STAGES]) {
      for (const seed of SEEDS) {
        const game = newGame(stageConfig(stage), seed);
        const total = game.board.cells.reduce((sum, cell) => sum + cell.value, 0);
        expect(total % 10, `stage ${stage}, seed ${seed}`).toBe(0);
      }
    }
  });

  it("always opens with a legal move and settles in finite time", () => {
    for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
      const game = newGame(stageConfig(stage), stage * 104729);
      expect(findHint(game.board)).not.toBeNull();
      const run = play(stage, stage * 104729);
      expect(run.moves).toBeLessThan(200);
      expect(["won", "lost"]).toContain(run.status);
    }
  });

  it("makes the deal itself stricter as the board grows", () => {
    const first = stageConfig(1);
    const last = stageConfig(TOTAL_STAGES);
    // A level histogram at the end, a small-heavy one at the start: this is
    // the dial that decides whether a careless line can still empty the board.
    // It sets the group sizes too — five tiles adding to ten can only be 1s
    // and 2s, so wanting fewer 1s deals more pairs without being asked.
    expect(last.digitWeights![1]).toBeLessThan(first.digitWeights![1]!);
    expect(last.digitWeights![9]).toBeGreaterThan(first.digitWeights![9]!);
    expect(last.hints).toBeLessThan(first.hints);
    expect(last.undos).toBeLessThan(first.undos);
  });

  it("never lets the help run out before the board grows", () => {
    for (let stage = 2; stage <= TOTAL_STAGES; stage++) {
      const prev = stageConfig(stage - 1);
      const next = stageConfig(stage);
      expect(next.rows).toBe(prev.rows);
      expect(next.hints).toBeLessThanOrEqual(prev.hints);
      expect(next.undos).toBeLessThanOrEqual(prev.undos);
      expect(next.undos).toBeGreaterThan(0); // one take-back, always
    }
  });
});

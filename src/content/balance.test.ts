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
  it("starts compact and finishes with four more nine-tile rows", () => {
    const first = stageConfig(1);
    const last = stageConfig(TOTAL_STAGES);
    expect(first.width * first.rows).toBe(45);
    expect(last.width * last.rows).toBe(81);
    expect(last.width * last.rows - first.width * first.rows).toBe(36);
  });

  it("deals totals that can be partitioned into clears of ten", () => {
    for (const stage of [1, 5, 10, 15, TOTAL_STAGES]) {
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
    expect(last.groupWeights[0]).toBeGreaterThan(first.groupWeights[0]!);
    expect(last.groupWeights[3]).toBeLessThan(first.groupWeights[3]!);
    expect(last.hints).toBeLessThan(first.hints);
    for (let tier = 0; tier < 3; tier++) {
      const firstShare = first.starTargets[tier]! / (first.width * first.rows);
      const lastShare = last.starTargets[tier]! / (last.width * last.rows);
      expect(lastShare).toBeLessThan(firstShare);
    }
  });
});

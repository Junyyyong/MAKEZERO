import { describe, expect, it } from "vitest";
import { aliveCount } from "../core/board";
import { commitSelection, newGame, stars } from "../core/game";
import { findHint } from "../core/solver";
import { TOTAL_STAGES } from "./chapters";
import { stageConfig } from "./stages";

/**
 * Plays a stage by always taking the longest chain the solver offers.
 *
 * That is close to optimal now that position does not matter — taking pairs
 * instead strands roughly three times as many tiles — so these grades are a
 * realistic floor for an attentive player, not a worst case.
 */
function playGreedy(stage: number, seed: number) {
  let state = newGame(stageConfig(stage), seed);
  let moves = 0;
  while (state.status === "playing" && moves < 5000) {
    const chain = findHint(state.board);
    if (!chain) break;
    const next = commitSelection(state, chain);
    expect(next.result.ok).toBe(true); // the hint must always be a legal move
    state = next.state;
    moves++;
  }
  return { status: state.status, left: aliveCount(state.board), moves, stars: stars(state) };
}

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233].map((n) => n * 7919);
const everyStage = Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1);
const grades = (stage: number) => SEEDS.map((seed) => playGreedy(stage, seed).stars);
const passRate = (stage: number) => grades(stage).filter((s) => s >= 1).length / SEEDS.length;
const average = (stage: number) => grades(stage).reduce((a, b) => a + b, 0) / SEEDS.length;

describe("stage solvability", () => {
  it("always terminates and always plays legal moves", () => {
    for (const stage of everyStage) {
      const run = playGreedy(stage, stage * 104729);
      expect(run.moves).toBeLessThan(5000);
      expect(["won", "lost", "playing"]).toContain(run.status);
    }
  });

  it("leaves no stage a solid player cannot pass", () => {
    for (const stage of everyStage) {
      expect(passRate(stage), `stage ${stage} cannot be passed`).toBeGreaterThan(0);
    }
  });

  it("opens gently — stage 1 passes almost every time", () => {
    expect(passRate(1)).toBeGreaterThanOrEqual(0.9);
  });

  it("finishes hard — the last stage grades worse than the first", () => {
    expect(average(TOTAL_STAGES)).toBeLessThan(average(1));
  });

  it("keeps three stars a real achievement rather than a formality", () => {
    const perfect = grades(TOTAL_STAGES).filter((s) => s === 3).length / SEEDS.length;
    expect(perfect).toBeLessThan(0.5);
  });
});

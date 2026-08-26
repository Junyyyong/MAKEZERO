import { describe, expect, it } from "vitest";
import { aliveCount } from "./board";
import { commitSelection, newGame, stars, useShuffle } from "./game";
import { findHint, hasAnyMove } from "./hint";
import { TOTAL_STAGES, stageConfig } from "./story";

/**
 * Plays a stage by always taking the first legal chain the hint finder returns,
 * spending an add whenever the board deadlocks. This is a deliberately poor
 * strategy — it burns small numbers early — so a human comfortably beats these
 * rates. Its value is as a floor: if greedy can clear a stage, a player can.
 */
function playGreedy(stage: number, seed: number) {
  let state = newGame(stageConfig(stage), seed);
  let moves = 0;
  while (state.status === "playing" && moves < 5000) {
    if (!hasAnyMove(state.board)) {
      if (state.shufflesLeft === 0) break;
      const shuffled = useShuffle(state);
      if (shuffled === state) break;
      state = shuffled;
      continue;
    }
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
const rate = (stage: number, min: number) =>
  grades(stage).filter((s) => s >= min).length / SEEDS.length;

describe("stage solvability", () => {
  it("always terminates and always plays legal moves", () => {
    for (const stage of everyStage) {
      const run = playGreedy(stage, stage * 104729);
      expect(run.moves).toBeLessThan(5000);
      expect(["won", "lost", "playing"]).toContain(run.status);
    }
  });

  it("leaves no stage a greedy player cannot pass", () => {
    for (const stage of everyStage) {
      expect(rate(stage, 1), `stage ${stage} cannot be passed`).toBeGreaterThan(0);
    }
  });

  it("opens gently — stage 1 passes almost every time", () => {
    expect(rate(1, 1)).toBeGreaterThanOrEqual(0.9);
  });

  it("finishes hard — the last stage grades worse than the first", () => {
    const average = (stage: number) =>
      grades(stage).reduce((a, b) => a + b, 0) / SEEDS.length;
    expect(average(TOTAL_STAGES)).toBeLessThan(average(1));
  });

  it("keeps three stars a genuine achievement, not a formality", () => {
    // Greedy is a poor strategy, so a perfect clear should mostly elude it.
    expect(rate(1, 3)).toBeLessThan(0.8);
  });
});

describe("difficulty dials", () => {
  it("keeps moving all the way to the final stage, never plateauing early", () => {
    const quarters = [1, 5, 10, 15, TOTAL_STAGES].map(stageConfig);
    for (let i = 1; i < quarters.length; i++) {
      const prev = quarters[i - 1]!;
      const next = quarters[i]!;
      const changed =
        next.width !== prev.width ||
        next.rows !== prev.rows ||
        next.shuffles !== prev.shuffles ||
        next.groupWeights[0] !== prev.groupWeights[0];
      expect(changed, `stages plateau between checkpoint ${i - 1} and ${i}`).toBe(true);
    }
  });

  it("reaches its hardest settings exactly at the final stage", () => {
    const last = stageConfig(TOTAL_STAGES);
    expect(last.width).toBe(10);
    expect(last.rows).toBe(15);
    expect(last.shuffles).toBe(1);
  });
});

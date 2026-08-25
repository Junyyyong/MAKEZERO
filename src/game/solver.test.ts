import { describe, expect, it } from "vitest";
import { aliveCount } from "./board";
import { commitSelection, newGame, useAdd } from "./game";
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
      if (state.addsLeft === 0) break;
      state = useAdd(state);
      continue;
    }
    const chain = findHint(state.board);
    if (!chain) break;
    const next = commitSelection(state, chain);
    expect(next.result.ok).toBe(true); // the hint must always be a legal move
    state = next.state;
    moves++;
  }
  return { status: state.status, left: aliveCount(state.board), moves };
}

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233].map((n) => n * 7919);
const clearRate = (stage: number) =>
  SEEDS.filter((seed) => playGreedy(stage, seed).status === "won").length / SEEDS.length;

const everyStage = Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1);

describe("stage solvability", () => {
  it("always terminates and always plays legal moves", () => {
    for (const stage of everyStage) {
      const run = playGreedy(stage, stage * 104729);
      expect(run.moves).toBeLessThan(5000);
      expect(["won", "lost", "playing"]).toContain(run.status);
    }
  });

  it("leaves no stage that a greedy player can never clear", () => {
    for (const stage of everyStage) {
      expect(clearRate(stage), `stage ${stage} is unclearable`).toBeGreaterThan(0);
    }
  });

  it("opens gently — stage 1 falls to greedy most of the time", () => {
    expect(clearRate(1)).toBeGreaterThanOrEqual(0.5);
  });

  it("finishes hard — the last stage resists greedy far more than the first", () => {
    expect(clearRate(TOTAL_STAGES)).toBeLessThan(clearRate(1));
  });
});

describe("difficulty dials", () => {
  it("keeps moving all the way to the final stage, never plateauing early", () => {
    // Some dial must change across every quarter of the run, or the back half
    // of the story would just be repeats of the same stage.
    const quarters = [1, 5, 10, 15, TOTAL_STAGES].map(stageConfig);
    for (let i = 1; i < quarters.length; i++) {
      const prev = quarters[i - 1]!;
      const next = quarters[i]!;
      const changed =
        next.rows !== prev.rows ||
        next.adds !== prev.adds ||
        next.weights[8] !== prev.weights[8];
      expect(changed, `stages plateau between checkpoint ${i - 1} and ${i}`).toBe(true);
    }
  });

  it("reaches its hardest settings exactly at the final stage", () => {
    const last = stageConfig(TOTAL_STAGES);
    const secondLast = stageConfig(TOTAL_STAGES - 1);
    expect(last.rows).toBeGreaterThanOrEqual(secondLast.rows);
    expect(last.adds).toBeLessThanOrEqual(secondLast.adds);
    expect(last.rows).toBe(7);
    expect(last.adds).toBe(2);
  });
});

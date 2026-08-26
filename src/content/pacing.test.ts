import { describe, expect, it } from "vitest";
import { commitSelection, newGame, tick } from "../core/game";
import { findHint } from "../core/solver";
import { ENDLESS_CONFIG } from "./stages";

/**
 * Simulates a player who clears one combination every `reactionMs`, taking the
 * longest chain each time. Real players are slower and less consistent, so
 * these times are a generous upper bound rather than a forecast.
 */
function survive(reactionMs: number, seed: number) {
  let state = newGame(ENDLESS_CONFIG, seed);
  const STEP = 50;
  const CAP_MS = 20 * 60_000;
  let elapsed = 0;
  let sinceMove = 0;

  while (state.status === "playing" && elapsed < CAP_MS) {
    state = tick(state, STEP);
    elapsed += STEP;
    sinceMove += STEP;
    if (sinceMove >= reactionMs && state.status === "playing") {
      sinceMove = 0;
      const chain = findHint(state.board);
      if (chain) state = commitSelection(state, chain).state;
    }
  }
  return { seconds: elapsed / 1000, score: state.score, status: state.status };
}

const SEEDS = [1, 2, 3, 5, 8].map((n) => n * 7919);
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const typical = (reactionMs: number) => median(SEEDS.map((s) => survive(reactionMs, s).seconds));

describe("endless pacing", () => {
  it("ends every run rather than letting one go forever", () => {
    for (const seed of SEEDS) {
      expect(survive(2500, seed).status).toBe("lost");
    }
  });

  it("keeps a casual run to a couple of minutes", () => {
    const casual = typical(2500);
    expect(casual).toBeGreaterThan(45);
    expect(casual).toBeLessThan(240);
  });

  it("rewards playing faster with a longer run", () => {
    expect(typical(1000)).toBeGreaterThan(typical(2500) * 1.3);
  });

  it("rewards playing faster with a much bigger score", () => {
    const scoreAt = (reactionMs: number) => median(SEEDS.map((s) => survive(reactionMs, s).score));
    expect(scoreAt(1000)).toBeGreaterThan(scoreAt(2500) * 2);
  });
});

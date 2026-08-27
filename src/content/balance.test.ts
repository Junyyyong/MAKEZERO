import { describe, expect, it } from "vitest";
import { aliveCount, valueCounts } from "../core/board";
import { commitSelection, newGame, stars } from "../core/game";
import { findValueCombo, locate } from "../core/solver";
import { TOTAL_STAGES } from "./chapters";
import { DECK, stageConfig } from "./stages";
import type { GameState } from "../core/game";

/** Plays to a strategy until nothing on the board can make ten. */
function playWith(stage: number, seed: number, want: "short" | "long") {
  let state = newGame(stageConfig(stage), seed);
  for (let move = 0; move < 200; move++) {
    const combo = pick(valueCounts(state.board), want);
    if (!combo) break;
    const tiles = locate(state.board, combo);
    if (!tiles) break;
    const next = commitSelection(state, tiles);
    expect(next.result.ok).toBe(true);
    state = next.state;
  }
  return { left: aliveCount(state.board), score: state.score, stars: stars(state) };
}

/** Shortest is the clearing line; longest is the scoring line. */
function pick(counts: readonly number[], want: "short" | "long"): number[] | null {
  if (want === "long") return findValueCombo(counts);
  const pool = [...counts];
  for (let a = 1; a <= 9; a++) {
    for (let b = a; b <= 9; b++) {
      if (a + b !== 10) continue;
      if (a === b ? pool[a]! >= 2 : pool[a]! >= 1 && pool[b]! >= 1) return [a, b];
    }
  }
  return findValueCombo(counts);
}

const SEEDS = [1, 2, 3, 5, 8, 13].map((n) => n * 7919);
const each = (f: (seed: number) => number) => SEEDS.map(f);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("the 81-tile deck", () => {
  it("deals nine of every digit, 81 tiles totalling 405", () => {
    expect(DECK.slice(1)).toEqual(Array(9).fill(9));
    const game = newGame(stageConfig(1), 7);
    expect(game.board.cells).toHaveLength(81);
    expect(game.board.cells.reduce((a, c) => a + c.value, 0)).toBe(405);
  });

  it("always strands exactly one tile, and it is a 5", () => {
    // 405 ends in 5 and every clear removes exactly ten, so the last digit
    // never moves. Pairing everything else away leaves a single 5.
    for (const seed of SEEDS) {
      const state = playAllPairs(seed);
      expect(aliveCount(state.board)).toBe(1);
      expect(state.board.cells.find((c) => !c.cleared)!.value).toBe(5);
    }
  });
});

function playAllPairs(seed: number): GameState {
  let state = newGame(stageConfig(1), seed);
  for (let move = 0; move < 200; move++) {
    const combo = pick(valueCounts(state.board), "short");
    if (!combo) break;
    const tiles = locate(state.board, combo);
    if (!tiles) break;
    state = commitSelection(state, tiles).state;
  }
  return state;
}

describe("clearing versus scoring", () => {
  it("lets a clearing line take top marks on every stage", () => {
    for (const stage of [1, 10, TOTAL_STAGES]) {
      const graded = each((seed) => playWith(stage, seed, "short").stars);
      expect(Math.min(...graded), `stage ${stage} cannot be three-starred`).toBe(3);
    }
  });

  it("pays a scoring line far more than a clearing one", () => {
    const clearing = avg(each((seed) => playWith(1, seed, "short").score));
    const scoring = avg(each((seed) => playWith(1, seed, "long").score));
    expect(scoring).toBeGreaterThan(clearing * 1.2);
  });

  it("makes the scoring line leave the board in a state stars will punish", () => {
    const left = avg(each((seed) => playWith(1, seed, "long").left));
    expect(left).toBeGreaterThan(10);
    expect(avg(each((seed) => playWith(1, seed, "long").stars))).toBeLessThan(3);
  });

  it("tightens the targets from the first stage to the last", () => {
    const first = stageConfig(1);
    const last = stageConfig(TOTAL_STAGES);
    for (let tier = 0; tier < 3; tier++) {
      expect(last.starTargets[tier]!).toBeLessThan(first.starTargets[tier]!);
    }
    expect(last.hints).toBeLessThan(first.hints);
  });

  it("keeps every stage's top target reachable", () => {
    for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
      // A clearing line always gets to one tile, so three stars must allow it.
      expect(stageConfig(stage).starTargets[2]).toBeGreaterThanOrEqual(1);
    }
  });
});

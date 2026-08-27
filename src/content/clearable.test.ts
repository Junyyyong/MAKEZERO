import { describe, expect, it } from "vitest";
import { aliveCount, valueCounts } from "../core/board";
import { commitSelection, newGame } from "../core/game";
import { locate } from "../core/solver";
import { TOTAL_STAGES } from "./chapters";
import { stageConfig } from "./stages";

/**
 * The promise story mode makes: **every board can be emptied completely.**
 *
 * That is not obvious. A board is dealt as groups that each add to ten, so the
 * numbers on it can always be taken apart into clears — but the player picks
 * the clears, and a clear that cuts across two groups can strand tiles nothing
 * will ever match. So there are two separate claims to check, and this file
 * checks both:
 *
 *   1. the deal itself can be emptied  — `clearable` below says so exactly
 *   2. a player who only makes moves that keep it emptiable always gets there
 *
 * The second is what makes the goal fair: being stuck is always a mistake, and
 * always one the player could have avoided. It is also what a take-back is
 * for — see `undo` in core/game.ts.
 */

/** Every way 2..5 digits add to ten, as value multisets. */
const COMBOS: number[][] = [];
(function build(start: number, sum: number, picked: number[]) {
  if (sum === 10 && picked.length >= 2) {
    COMBOS.push([...picked]);
    return;
  }
  if (sum >= 10 || picked.length === 5) return;
  for (let value = start; value <= 9; value++) {
    if (sum + value > 10) break;
    picked.push(value);
    build(value, sum + value, picked);
    picked.pop();
  }
})(1, 0, []);

const fits = (counts: readonly number[], combo: readonly number[]) => {
  const need = new Array(10).fill(0);
  for (const value of combo) need[value]++;
  return need.every((n, value) => (counts[value] ?? 0) >= n);
};
const without = (counts: readonly number[], combo: readonly number[]) => {
  const out = [...counts];
  for (const value of combo) out[value] = (out[value] ?? 0) - 1;
  return out;
};
const total = (counts: readonly number[]) => counts.reduce((a, b) => a + b, 0);

/**
 * Can what is left be taken apart into clears of ten with nothing over?
 *
 * Resolves the largest remaining value first. Every partition has to deal with
 * that value somehow, so trying only the groups containing it loses no answer
 * and collapses the search; the memo does the rest.
 */
const answers = new Map<string, boolean>();
function clearable(counts: readonly number[]): boolean {
  if (total(counts) === 0) return true;
  const key = counts.join(",");
  const known = answers.get(key);
  if (known !== undefined) return known;

  let largest = 9;
  while (largest > 0 && !counts[largest]) largest--;

  let found = false;
  for (const combo of COMBOS) {
    if (combo.at(-1) !== largest || !fits(counts, combo)) continue;
    if (clearable(without(counts, combo))) {
      found = true;
      break;
    }
  }
  answers.set(key, found);
  return found;
}

/** Plays to the end, only ever taking moves that keep the board emptiable. */
function playCarefully(stage: number, seed: number) {
  let state = newGame(stageConfig(stage), seed);
  for (let move = 0; move < 400; move++) {
    const counts = valueCounts(state.board) as number[];
    const options = COMBOS.filter((combo) => fits(counts, combo));
    if (options.length === 0) break;
    const safe = options.find((combo) => clearable(without(counts, combo))) ?? options[0]!;
    const tiles = locate(state.board, safe);
    if (!tiles) break;
    const next = commitSelection(state, tiles);
    if (!next.result.ok) break;
    state = next.state;
  }
  return state;
}

const CHECKPOINTS = [1, 12, 25, 40, 55, 70, 85, TOTAL_STAGES];
const SEEDS = [1, 2, 3, 5, 8].map((n) => n * 7919);

describe("every story board can be emptied", () => {
  it("deals numbers that come apart into clears of ten, at every stage", () => {
    for (const stage of CHECKPOINTS) {
      for (const seed of SEEDS) {
        const counts = valueCounts(newGame(stageConfig(stage), seed).board) as number[];
        expect(clearable(counts), `stage ${stage}, seed ${seed}`).toBe(true);
      }
    }
  });

  it("lets a careful line finish the job — no tile left standing", () => {
    for (const stage of CHECKPOINTS) {
      for (const seed of SEEDS) {
        const done = playCarefully(stage, seed);
        expect(aliveCount(done.board), `stage ${stage}, seed ${seed}`).toBe(0);
        expect(done.status).toBe("won");
      }
    }
  });

  it("hands three stars to a careful line, since it needs no help", () => {
    const done = playCarefully(TOTAL_STAGES, SEEDS[0]!);
    expect(done.hintsLeft).toBe(stageConfig(TOTAL_STAGES).hints);
    expect(done.undosLeft).toBe(stageConfig(TOTAL_STAGES).undos);
  });
});

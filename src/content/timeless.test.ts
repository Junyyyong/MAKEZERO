import { describe, expect, it } from "vitest";
import { aliveCount, allGroups, valueCounts } from "../core/board";
import { commitSelection, newGame, targetsOf, useHint } from "../core/game";
import { canEmpty, locate } from "../core/solver";
import { MAX_SELECTION, MIN_SELECTION, scoreFor } from "../core/rules";
import { TIMELESS_CONFIG } from "./stages";

/**
 * The promise TIMELESS makes: **every board can be emptied.**
 *
 * It rests on one fact. The board is dealt as a union of groups that each add
 * to ten, so there is always a solution using nothing but tens; allowing
 * twenty and thirty can only add ways through, never remove one. So the mode
 * is fair in the same sense story is: being stuck is a move that went wrong,
 * not a deal that was impossible — which is what the take-backs are for.
 */
const TARGETS = targetsOf(TIMELESS_CONFIG);
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((n) => n * 7919);

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

/** Plays to the end, taking only moves that leave the board still emptiable. */
function playCarefully(seed: number) {
  let state = newGame(TIMELESS_CONFIG, seed);
  for (let move = 0; move < 400; move++) {
    const counts = valueCounts(state.board) as number[];
    const options = allGroups(TARGETS).filter((combo) => fits(counts, combo));
    if (options.length === 0) break;
    const safe = options.find((combo) => canEmpty(without(counts, combo)));
    const tiles = locate(state.board, safe ?? options[0]!);
    if (!tiles) break;
    const next = commitSelection(state, tiles);
    if (!next.result.ok) break;
    state = next.state;
  }
  return state;
}

/** Plays by pressing hint and taking whatever it points at, every move. */
function playGreedily(seed: number) {
  let state = newGame(TIMELESS_CONFIG, seed);
  for (let move = 0; move < 400; move++) {
    const { indices } = useHint({ ...state, hintsLeft: 1 });
    if (!indices) break;
    const next = commitSelection(state, indices);
    if (!next.result.ok) break;
    state = next.state;
  }
  return state;
}

describe("TIMELESS", () => {
  it("clears on ten, twenty and thirty and nothing else", () => {
    expect([...TARGETS]).toEqual([10, 20, 30]);
    // Every target a whole number of tens is what keeps a board dealt from
    // ten-groups exactly emptiable. A target of 15 would break the promise.
    for (const target of TARGETS) expect(target % 10).toBe(0);
  });

  it("deals a full board that comes apart into clears with nothing over", () => {
    for (const seed of SEEDS) {
      const state = newGame(TIMELESS_CONFIG, seed);
      expect(aliveCount(state.board), `seed ${seed}`).toBe(81);
      expect(canEmpty(valueCounts(state.board)), `seed ${seed}`).toBe(true);
    }
  });

  it("lets a careful line finish the job — no block left standing", () => {
    for (const seed of SEEDS) {
      const done = playCarefully(seed);
      expect(aliveCount(done.board), `seed ${seed}`).toBe(0);
      expect(done.status).toBe("won");
    }
  });

  it("hands out hints a player can follow all the way to an empty board", () => {
    /*
     * The hint has to be advice, not bait. Taking the biggest legal clear every
     * time — what the hint used to offer — emptied one board in sixty here,
     * because the thirties eat the big digits and strand the rest. Following
     * the hint that checks each move against `canEmpty` empties every one.
     */
    for (const seed of SEEDS) {
      const done = playGreedily(seed);
      expect(aliveCount(done.board), `seed ${seed}`).toBe(0);
      expect(done.status).toBe("won");
    }
  });

  it("pays a clear by its length, times the tens it took off the board", () => {
    /*
     * The whole table, and which cells of it can even happen: twenty needs at
     * least three blocks because two nines are eighteen, and thirty needs at
     * least four because three nines are twenty-seven.
     */
    const reachable = (count: number, target: number) =>
      count >= MIN_SELECTION && count <= MAX_SELECTION && count * 9 >= target && count <= target;
    const table: Record<number, Record<number, number>> = {
      10: { 2: 10, 3: 20, 4: 40, 5: 80 },
      20: { 3: 40, 4: 80, 5: 160 },
      30: { 4: 120, 5: 240 },
    };
    for (const target of TARGETS) {
      for (let count = MIN_SELECTION; count <= MAX_SELECTION; count++) {
        if (!reachable(count, target)) {
          expect(table[target]![count], `${count} blocks cannot make ${target}`).toBeUndefined();
          continue;
        }
        expect(scoreFor(count, target), `${count} blocks making ${target}`).toBe(
          table[target]![count],
        );
      }
    }
    // A twenty is worth exactly what the same blocks would be worth as tens,
    // so reaching for one is never a worse deal than not.
    expect(scoreFor(4, 20)).toBe(scoreFor(4, 10) * 2);
    expect(scoreFor(5, 30)).toBe(scoreFor(5, 10) * 3);
  });

  it("carries enough help to make being stuck recoverable", () => {
    expect(TIMELESS_CONFIG.undos).toBeGreaterThan(0);
    expect(TIMELESS_CONFIG.hints).toBeGreaterThan(0);
  });

  it("is not a race — no clock, and no tiles arriving on one", () => {
    expect(TIMELESS_CONFIG.timeLimitMs).toBeUndefined();
    expect(TIMELESS_CONFIG.spawn).toBeUndefined();
    expect(TIMELESS_CONFIG.keepBoard).toBe(true);
  });
});

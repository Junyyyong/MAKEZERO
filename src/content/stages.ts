import { EASY_GROUPS, GENTLE_DIGITS, LEVEL_DIGITS, evenDeck } from "../core/board";
import { TOTAL_STAGES } from "./chapters";
import type { RunConfig } from "../core/types";

/**
 * The story: ninety-nine stages on one board size — nine by nine, eighty-one
 * blocks, the same in every mode. Every stage is dealt so that it can be
 * emptied completely, and emptying it uncovers the picture behind it.
 *
 * With the board fixed, two dials are left:
 *
 *   digitWeights  small numbers mostly → an even spread
 *                 the real one. A board dealt from loose groups leaves small
 *                 flexible numbers behind and forgives a careless line; a
 *                 level one spreads 8s and 9s about, and a 9 can only ever
 *                 pair with a 1. It sets the group sizes too — five blocks
 *                 adding to ten can only be 1s and 2s.
 *   hints 5 → 0, undos 8 → 1, splits 3 → 1
 *                 how much help there is when it goes wrong
 *
 * **Eighty-one blocks is a lot to keep clearable.** A line that takes any
 * legal move empties a 27-block board about half the time and an 81-block one
 * almost never, so on this size the forgiveness has to come from the
 * take-backs rather than from the board being small. That is why the early
 * stages carry so many. See docs/BALANCE.md.
 */
const EASIEST = { hints: 5, undos: 8, splits: 3, nearly: 0.16 };
const HARDEST = { hints: 0, undos: 1, splits: 1, nearly: 0.14 };

/** Nine by nine, every stage and every mode. Eighty-one blocks. */
export const BOARD_ROWS = 9;

export const BOARD_WIDTH = 9;
export const DECK = evenDeck(9);

export function stageConfig(stage: number): RunConfig {
  const clamped = Math.min(Math.max(stage, 1), TOTAL_STAGES);
  const t = TOTAL_STAGES > 1 ? (clamped - 1) / (TOTAL_STAGES - 1) : 0;
  const lerp = (from: number, to: number) => from + (to - from) * t;
  const cells = BOARD_WIDTH * BOARD_ROWS;

  return {
    mode: "story",
    width: BOARD_WIDTH,
    rows: BOARD_ROWS,
    groupWeights: EASY_GROUPS,
    digitWeights: GENTLE_DIGITS.map((gentle, i) => lerp(gentle, LEVEL_DIGITS[i] ?? gentle)),
    keepBoard: true,
    hints: Math.round(lerp(EASIEST.hints, HARDEST.hints)),
    undos: Math.round(lerp(EASIEST.undos, HARDEST.undos)),
    splits: Math.round(lerp(EASIEST.splits, HARDEST.splits)),
    /*
     * Only the first of these is a leftover target any more, and it is the
     * consolation mark: a board this close counts as passed so the run never
     * hard-locks, while the stars worth having are for emptying the board.
     * The other two are unused in story and kept at 0 so nothing reads them by
     * accident.
     */
    starTargets: [Math.max(2, Math.round(cells * lerp(EASIEST.nearly, HARDEST.nearly))), 0, 0],
    stage,
  };
}

export const TIME_ATTACK_CONFIG: RunConfig = {
  mode: "timeAttack",
  width: BOARD_WIDTH,
  rows: BOARD_ROWS,
  deck: DECK,
  groupWeights: EASY_GROUPS,
  hints: 0,
  undos: 0,
  splits: 0,
  starTargets: [0, 0, 0],
  timeLimitMs: 60_000,
  /*
   * The board is a fixed nine-by-nine frame. Without this an emptied row
   * collapses and the board shrinks under the player mid-run — and the reward
   * that refills cleared squares needs those squares to still be there.
   */
  keepBoard: true,
};

/**
 * Endless is a survival mode: tiles keep landing and the run ends when a batch
 * has nowhere to go. The gap between batches shrinks as the run goes on, which
 * is the whole difficulty curve — see docs/BALANCE.md before retuning.
 */
export const ENDLESS_CONFIG: RunConfig = {
  mode: "endless",
  width: BOARD_WIDTH,
  rows: BOARD_ROWS,
  groupWeights: [3, 3, 2, 1],
  hints: 3,
  undos: 0,
  splits: 0,
  starTargets: [0, 0, 0],
  spawn: {
    initialFill: 0.45,
    startIntervalMs: 3200,
    // The floor has to sit just *below* how fast a person can actually play.
    // Above it, a quick player clears faster than tiles land and never dies;
    // far below it, the floor kills everyone at the same rate and skill stops
    // mattering. At 650ms a simulated player who moves every 3s lasts about a
    // minute and a half, one moving every second lasts three minutes.
    minIntervalMs: 650,
    rampMs: 55,
  },
};

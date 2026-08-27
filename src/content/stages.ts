import { EASY_GROUPS, GENTLE_DIGITS, LEVEL_DIGITS, evenDeck } from "../core/board";
import { TOTAL_STAGES } from "./chapters";
import type { RunConfig } from "../core/types";

/**
 * The story: ninety-nine stages, on nine columns, ending on a nine-by-eleven
 * board. Every one of them is dealt so that it can be emptied completely, and
 * emptying it is the goal — see docs/BALANCE.md for the measurements behind
 * that claim and behind every number in this file.
 *
 * Three dials move together across the run, and each one was chosen because a
 * simulated player's chance of emptying the board responds to it:
 *
 *   rows          4 → 11   more to hold in your head, and a longer run in
 *                          which one careless move can cost the board
 *   groupWeights  큰 조각 → 짝 위주
 *                          the real difficulty dial. Boards dealt from big
 *                          loose groups leave small flexible numbers behind
 *                          and a careless line still empties them about two
 *                          runs in five; boards dealt from rigid pairs strand
 *                          8s and 9s and a careless line empties them almost
 *                          never
 *   hints 5 → 0, undos 5 → 1
 *                          how much help there is when it goes wrong
 *
 * Note what is NOT a dial: whether the board *can* be emptied. It always can,
 * at every size and every mix. What changes is how easily a wrong move throws
 * it away.
 */
const EASIEST = { rows: 4, hints: 5, undos: 5, splits: 3, nearly: 0.16 };
const HARDEST = { rows: 11, hints: 0, undos: 1, splits: 1, nearly: 0.14 };

export const BOARD_WIDTH = 9;
export const DECK = evenDeck(9);

export function stageConfig(stage: number): RunConfig {
  const clamped = Math.min(Math.max(stage, 1), TOTAL_STAGES);
  const t = TOTAL_STAGES > 1 ? (clamped - 1) / (TOTAL_STAGES - 1) : 0;
  const lerp = (from: number, to: number) => from + (to - from) * t;
  const rows = Math.round(lerp(EASIEST.rows, HARDEST.rows));
  const cells = BOARD_WIDTH * rows;

  return {
    mode: "story",
    width: BOARD_WIDTH,
    rows,
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
  rows: 9,
  deck: DECK,
  groupWeights: EASY_GROUPS,
  hints: 0,
  undos: 0,
  splits: 0,
  starTargets: [0, 0, 0],
  timeLimitMs: 60_000,
  autoRefill: true,
};

/**
 * Endless is a survival mode: tiles keep landing and the run ends when a batch
 * has nowhere to go. The gap between batches shrinks as the run goes on, which
 * is the whole difficulty curve — see docs/BALANCE.md before retuning.
 */
export const ENDLESS_CONFIG: RunConfig = {
  mode: "endless",
  width: BOARD_WIDTH,
  rows: 11,
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

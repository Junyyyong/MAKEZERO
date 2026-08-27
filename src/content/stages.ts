import { EASY_GROUPS, evenDeck } from "../core/board";
import { TOTAL_STAGES } from "./chapters";
import type { RunConfig } from "../core/types";

/**
 * Every stage deals the same 81 tiles: nine of each digit on a 9x9 board.
 *
 * That deck is the puzzle. Clearing it with pairs empties all but its last
 * tile — 81 is odd and 5 only pairs with itself, so one 5 always survives.
 * Chasing long chains scores far more but strands about 27 tiles, so stars and
 * score pull in opposite directions and a run has to pick one.
 *
 * Difficulty is the targets and the help, not the deck. Tuning lives here.
 */
const EASIEST = { hints: 5, stars: [24, 10, 3] };
const HARDEST = { hints: 1, stars: [12, 4, 1] };

export const BOARD_WIDTH = 9;
export const DECK = evenDeck(9);

export function stageConfig(stage: number): RunConfig {
  const clamped = Math.min(Math.max(stage, 1), TOTAL_STAGES);
  const t = TOTAL_STAGES > 1 ? (clamped - 1) / (TOTAL_STAGES - 1) : 0;
  const lerp = (from: number, to: number) => Math.round(from + (to - from) * t);

  return {
    mode: "story",
    width: BOARD_WIDTH,
    rows: 9,
    deck: DECK,
    groupWeights: EASY_GROUPS,
    hints: lerp(EASIEST.hints, HARDEST.hints),
    starTargets: [
      lerp(EASIEST.stars[0]!, HARDEST.stars[0]!),
      lerp(EASIEST.stars[1]!, HARDEST.stars[1]!),
      lerp(EASIEST.stars[2]!, HARDEST.stars[2]!),
    ],
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

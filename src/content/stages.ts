import { EASY_GROUPS, evenDeck } from "../core/board";
import { TOTAL_STAGES } from "./chapters";
import type { RunConfig } from "../core/types";

/**
 * Every stage deals a whole deck: the same nine digits, the same number of
 * each, on a board exactly big enough to hold them.
 *
 * That deck is the puzzle. Pairing everything away — 1+9, 2+8, 3+7, 4+6, 5+5 —
 * empties the board down to nothing, or to a single 5 when the deck holds an
 * odd number of them. Chasing long chains scores far more but strands about a
 * third of the tiles, so stars and score pull in opposite directions and a run
 * has to pick one.
 *
 * DIFFICULTY IS THE BOARD SIZE AND THE TARGETS, NOT THE MIX.
 * Simulated play over every deck shape settles two things:
 *
 *   - More tiles at the same even mix never makes a stage unwinnable: perfect
 *     pairing still ends at 0 or 1. It makes a stage *longer* — 27 moves at
 *     nine rows, 49 at eleven — and it widens the gap careless play opens up
 *     (a random line leaves 18 of 54, but 33 of 99). So the board grows and
 *     the targets barely move: the same star costs more care every stage.
 *   - Skewing the mix toward 8s and 9s does make a stage harder, but in a way
 *     the player cannot fix. A 9 clears only with a 1; deal more 9s than 1s
 *     and the extras are dead on arrival — best play leaves 27 tiles and no
 *     skill touches them. That is unfairness, not difficulty. Rejected.
 *
 * Tuning lives here; the reasoning lives in docs/BALANCE.md.
 */
const EASIEST = { rows: 6, hints: 5, stars: [0.42, 0.23, 0.075] };
const HARDEST = { rows: 11, hints: 1, stars: [0.2, 0.1, 0.028] };

export const BOARD_WIDTH = 9;

/** The full deck used by the modes that do not grow: nine of each digit. */
export const DECK = evenDeck(9);

/** How many rows — and so how many of each digit — a stage deals. */
export function stageRows(stage: number): number {
  return lerpAt(stage, EASIEST.rows, HARDEST.rows);
}

export function stageConfig(stage: number): RunConfig {
  const rows = stageRows(stage);
  const targets = starTargetsFor(stage);

  return {
    mode: "story",
    width: BOARD_WIDTH,
    rows,
    deck: evenDeck(rows),
    groupWeights: EASY_GROUPS,
    hints: lerpAt(stage, EASIEST.hints, HARDEST.hints),
    starTargets: targets,
    stage,
  };
}

/**
 * How few tiles a stage must be left with to earn one, two and three stars.
 *
 * Each tier is a shrinking share of the board — but the board grows, so the
 * raw counts would step *up* every time a row is added, and a stage that asks
 * for less than the one before it reads as a mistake. Each target is therefore
 * pinned to the best it has ever been: a target never loosens, and a wider
 * board simply has to meet the same number with more tiles on it.
 */
function starTargetsFor(stage: number): [number, number, number] {
  const best: [number, number, number] = [Infinity, Infinity, Infinity];
  for (let s = 1; s <= Math.min(Math.max(stage, 1), TOTAL_STAGES); s++) {
    const tiles = BOARD_WIDTH * stageRows(s);
    for (let tier = 0; tier < 3; tier++) {
      const share = lerpAtRaw(s, EASIEST.stars[tier]!, HARDEST.stars[tier]!);
      best[tier] = Math.min(best[tier]!, Math.max(1, Math.round(share * tiles)));
    }
  }
  return best;
}

/** Where a stage sits on the curve, 0 at the first and 1 at the last. */
function progress(stage: number): number {
  const clamped = Math.min(Math.max(stage, 1), TOTAL_STAGES);
  return TOTAL_STAGES > 1 ? (clamped - 1) / (TOTAL_STAGES - 1) : 0;
}

const lerpAtRaw = (stage: number, from: number, to: number) =>
  from + (to - from) * progress(stage);
const lerpAt = (stage: number, from: number, to: number) =>
  Math.round(lerpAtRaw(stage, from, to));

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

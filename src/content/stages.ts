import { EASY_GROUPS, HARD_GROUPS, evenDeck } from "../core/board";
import { TOTAL_STAGES } from "./chapters";
import type { RunConfig } from "../core/types";

/**
 * Story stages keep nine columns so the tiles stay large and consistent with
 * the supplied layout. Difficulty adds rows downward (leaving the rest of the
 * screen as a character stage), shifts flexible groups toward rigid pairs,
 * removes hints and tightens the star targets.
 */
const EASIEST = { width: 9, rows: 5, hints: 4, stars: [0.34, 0.18, 0.08] };
const HARDEST = { width: 9, rows: 9, hints: 1, stars: [0.24, 0.12, 0.03] };

export const BOARD_WIDTH = 9;
export const DECK = evenDeck(9);

export function stageConfig(stage: number): RunConfig {
  const clamped = Math.min(Math.max(stage, 1), TOTAL_STAGES);
  const t = TOTAL_STAGES > 1 ? (clamped - 1) / (TOTAL_STAGES - 1) : 0;
  const lerp = (from: number, to: number) => from + (to - from) * t;
  const width = Math.round(lerp(EASIEST.width, HARDEST.width));
  const rows = Math.round(lerp(EASIEST.rows, HARDEST.rows));
  const cells = width * rows;
  const target = (tier: number) =>
    Math.max(tier === 2 ? 0 : 2, Math.round(cells * lerp(EASIEST.stars[tier]!, HARDEST.stars[tier]!)));

  return {
    mode: "story",
    width,
    rows,
    groupWeights: EASY_GROUPS.map((easy, i) => lerp(easy, HARD_GROUPS[i] ?? easy)),
    hints: Math.round(lerp(EASIEST.hints, HARDEST.hints)),
    starTargets: [target(0), target(1), target(2)],
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

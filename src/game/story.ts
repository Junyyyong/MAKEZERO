import { EASY_GROUPS, HARD_GROUPS } from "./board";
import type { RunConfig } from "./types";

export const STAGES_PER_CHAPTER = 5;

/**
 * A story beat, shown once the last stage of a chapter is cleared.
 *
 * `character` is a path under `public/`. The art shipped today is placeholder
 * artwork — drop replacements at the same paths and nothing else has to change.
 * `lines` are likewise meant to be rewritten; the game reads them straight from
 * here, so editing this array is the whole job.
 */
export interface Chapter {
  id: string;
  title: string;
  character: string;
  characterName: string;
  lines: string[];
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: "sprout",
    title: "1장 · 첫 그루터기",
    character: "./story/sprout.svg",
    characterName: "새싹",
    lines: [
      "숲 한가운데 오래된 그루터기가 있었어.",
      "그 위에 숫자가 새겨진 나무조각들이 흩어져 있었지.",
      "열을 맞춰 짝을 지어주면, 조각은 제자리로 돌아간대.",
    ],
  },
  {
    id: "grove",
    title: "2장 · 안개 낀 숲",
    character: "./story/grove.svg",
    characterName: "안개지기",
    lines: [
      "안개가 짙어질수록 조각은 더 많이 쌓여.",
      "서두르면 오히려 길을 잃어.",
      "한 수 앞이 아니라, 세 수 앞을 봐.",
    ],
  },
  {
    id: "hollow",
    title: "3장 · 깊은 구멍",
    character: "./story/hollow.svg",
    characterName: "구멍지기",
    lines: [
      "여기 조각들은 크고 무거워.",
      "큰 수끼리는 좀처럼 열이 되지 않지.",
      "작은 조각을 아껴 둬. 나중에 그게 열쇠가 될 테니까.",
    ],
  },
  {
    id: "canopy",
    title: "4장 · 우듬지",
    character: "./story/canopy.svg",
    characterName: "우듬지",
    lines: [
      "여기까지 올라온 사람은 많지 않아.",
      "이제 도와줄 손은 거의 남지 않았어.",
      "마지막 한 조각까지, 네 눈으로 찾아내.",
    ],
  },
];

export const TOTAL_STAGES = CHAPTERS.length * STAGES_PER_CHAPTER;

export function chapterIndexFor(stage: number): number {
  return Math.min(Math.floor((stage - 1) / STAGES_PER_CHAPTER), CHAPTERS.length - 1);
}

export function chapterFor(stage: number): Chapter {
  return CHAPTERS[chapterIndexFor(stage)]!;
}

/** True on the last stage of a chapter, where the story beat plays. */
export function isChapterFinale(stage: number): boolean {
  return stage % STAGES_PER_CHAPTER === 0 || stage === TOTAL_STAGES;
}

/**
 * Grades a finished stage by how few tiles are left standing.
 *
 * Counting absolute tiles rather than a fraction is deliberate. A wider board
 * also widens every line of sight, so the leftover count lands near ten however
 * big the board is — grading by fraction would make the late, larger stages the
 * easy ones. The board grows for the look of it; the target is what tightens.
 *
 * Top marks are a small number rather than an empty board on purpose. The deal
 * is always partitionable into tens, but whether those tens ever line up is
 * down to the deal: on two of three sampled boards, 120 randomised playthroughs
 * never got below three tiles. Demanding a perfect clear would grade the deal
 * rather than the player.
 */
export function starsFor(targets: readonly [number, number, number], left: number): number {
  if (left <= targets[2]) return 3;
  if (left <= targets[1]) return 2;
  if (left <= targets[0]) return 1;
  return 0;
}

/**
 * Board shape at the first and last stage. Tiles are square and the board
 * always fills the screen, so the column-to-row ratio has to stay close to the
 * phone's own — widening the board is what makes it denser and harder.
 */
/**
 * Star targets are a share of the board, not a flat count. Once the deal leans
 * on rigid high numbers the leftovers scale with the board, so a fixed count
 * would make the big late stages unwinnable rather than merely hard. The share
 * still tightens stage by stage, which is where the difficulty comes from.
 */
const EASIEST = { width: 5, rows: 8, shuffles: 5, stars: [0.32, 0.18, 0.08] };
const HARDEST = { width: 10, rows: 15, shuffles: 1, stars: [0.26, 0.14, 0.05] };

/**
 * The difficulty curve. Three dials move together: a bigger board, fewer
 * shuffles, and a deal that leans on four- and five-tile groups, which are far
 * harder to spot than a plain pair. Interpolated so each one reaches its
 * extreme at the final stage rather than plateauing partway.
 */
export function stageConfig(stage: number): RunConfig {
  const clamped = Math.min(Math.max(stage, 1), TOTAL_STAGES);
  const t = TOTAL_STAGES > 1 ? (clamped - 1) / (TOTAL_STAGES - 1) : 0;
  const lerp = (from: number, to: number) => from + (to - from) * t;

  const groupWeights = EASY_GROUPS.map((easy, i) => lerp(easy, HARD_GROUPS[i] ?? easy));

  const width = Math.round(lerp(EASIEST.width, HARDEST.width));
  const rows = Math.round(lerp(EASIEST.rows, HARDEST.rows));
  const cells = width * rows;
  const target = (tier: number) =>
    Math.max(tier === 2 ? 1 : 2, Math.round(cells * lerp(EASIEST.stars[tier]!, HARDEST.stars[tier]!)));

  return {
    mode: "story",
    width,
    rows,
    groupWeights,
    shuffles: Math.round(lerp(EASIEST.shuffles, HARDEST.shuffles)),
    starTargets: [target(0), target(1), target(2)],
    hints: 3,
    stage,
  };
}

export const TIME_ATTACK_CONFIG: RunConfig = {
  mode: "timeAttack",
  width: 7,
  rows: 11,
  groupWeights: EASY_GROUPS,
  shuffles: 0,
  starTargets: [0, 0, 0],
  hints: 0,
  timeLimitMs: 60_000,
  autoRefill: true,
};

export const ENDLESS_CONFIG: RunConfig = {
  mode: "endless",
  width: 7,
  rows: 11,
  groupWeights: [4, 3, 2, 1],
  shuffles: 5,
  starTargets: [16, 10, 5],
  hints: 3,
};

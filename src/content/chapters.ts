export const STAGES_PER_CHAPTER = 5;

/**
 * A story beat, shown once the last stage of a chapter is cleared.
 *
 * `character` is a path under `public/`. The art shipped today is placeholder
 * work — drop replacements at the same paths and nothing else has to change.
 * `lines` are likewise meant to be rewritten; the game reads them straight from
 * here, so editing this array is the whole job. See docs/CONTENT.md.
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

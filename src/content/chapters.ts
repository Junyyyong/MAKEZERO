export const STAGES_PER_CHAPTER = 9;

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
    title: "1장",
    character: "./story/sprout.svg",
    characterName: "새싹",
    lines: [
      "숲 한가운데 오래된 그루터기가 있었어.",
      "그 위에 숫자가 새겨진 나무조각들이 흩어져 있었지.",
      "열을 맞춰 짝을 지어주면, 조각은 제자리로 돌아간대.",
    ],
  },
  {
    id: "clearing",
    title: "2장",
    character: "./story/grove.svg",
    characterName: "빈터지기",
    lines: [
      "하나도 남기지 않는 게 이 숲의 규칙이야.",
      "조각 하나가 남으면, 그 조각은 영영 짝을 못 찾아.",
      "지울 수 있는 수와, 지워도 되는 수는 다르단다.",
    ],
  },
  {
    id: "grove",
    title: "3장",
    character: "./story/grove.svg",
    characterName: "안개지기",
    lines: [
      "안개가 짙어질수록 조각은 더 많이 쌓여.",
      "서두르면 오히려 길을 잃어.",
      "한 수 앞이 아니라, 세 수 앞을 봐.",
    ],
  },
  {
    id: "brook",
    title: "4장",
    character: "./story/sprout.svg",
    characterName: "개울지기",
    lines: [
      "되돌아오는 건 부끄러운 일이 아니야.",
      "다만 되돌아올 수 있는 횟수는 정해져 있지.",
      "한 수를 물리기 전에, 왜 막혔는지를 먼저 봐.",
    ],
  },
  {
    id: "hollow",
    title: "5장",
    character: "./story/hollow.svg",
    characterName: "구멍지기",
    lines: [
      "여기 조각들은 크고 무거워.",
      "큰 수끼리는 좀처럼 열이 되지 않지.",
      "작은 조각을 아껴 둬. 나중에 그게 열쇠가 될 테니까.",
    ],
  },
  {
    id: "roots",
    title: "6장",
    character: "./story/hollow.svg",
    characterName: "뿌리지기",
    lines: [
      "긴 조합은 점수를 많이 주지.",
      "그런데 그렇게 쓸어담고 나면, 남은 조각들이 서로를 못 찾아.",
      "높은 점수와 빈 판, 둘 다는 못 가져.",
    ],
  },
  {
    id: "ridge",
    title: "7장",
    character: "./story/grove.svg",
    characterName: "능선지기",
    lines: [
      "여기서부터는 도와줄 손이 줄어들어.",
      "힌트 없이 한 판을 비워 본 적 있니?",
      "없다면, 지금이 그때야.",
    ],
  },
  {
    id: "mist",
    title: "8장",
    character: "./story/grove.svg",
    characterName: "물안개",
    lines: [
      "판이 넓어질수록 실수 한 번이 오래 남아.",
      "처음 몇 수가 마지막 몇 수를 정해.",
      "천천히 시작해도 괜찮아.",
    ],
  },
  {
    id: "canopy",
    title: "9장",
    character: "./story/canopy.svg",
    characterName: "우듬지",
    lines: [
      "여기까지 올라온 사람은 많지 않아.",
      "이제 도와줄 손은 거의 남지 않았어.",
      "마지막 한 조각까지, 네 눈으로 찾아내.",
    ],
  },
  {
    id: "starfall",
    title: "10장",
    character: "./story/canopy.svg",
    characterName: "별지기",
    lines: [
      "별 셋은 아무 도움도 받지 않고 비운 판에만 내려와.",
      "두 번째 별은 되돌아온 사람에게도 주어져.",
      "그러니 부끄러워하지 말고, 대신 기억해 둬.",
    ],
  },
  {
    id: "stump",
    title: "11장",
    character: "./story/sprout.svg",
    characterName: "새싹",
    lines: [
      "처음 그 그루터기로 돌아왔구나.",
      "조각은 그대로인데, 네 눈이 달라졌어.",
      "이제 마지막 판이야. 하나도 남기지 마.",
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

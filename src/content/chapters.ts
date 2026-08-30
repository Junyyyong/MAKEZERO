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
    title: "Chapter 1",
    character: "./story/sprout.svg",
    characterName: "Sprout",
    lines: [
      "Deep in the forest stood an old tree stump.",
      "Wooden pieces with numbers on them lay scattered on top.",
      "Match them up to ten and each piece finds its way home.",
    ],
  },
  {
    id: "clearing",
    title: "Chapter 2",
    character: "./story/grove.svg",
    characterName: "Clearing Keeper",
    lines: [
      "Leaving nothing behind is the rule of this forest.",
      "One piece left over never finds its pair.",
      "What you can clear and what you should clear are not the same.",
    ],
  },
  {
    id: "grove",
    title: "Chapter 3",
    character: "./story/grove.svg",
    characterName: "Mist Keeper",
    lines: [
      "The thicker the fog, the more pieces pile up.",
      "Hurry and you only lose your way.",
      "Look three moves ahead, not one.",
    ],
  },
  {
    id: "brook",
    title: "Chapter 4",
    character: "./story/sprout.svg",
    characterName: "Brook Keeper",
    lines: [
      "There is no shame in going back.",
      "But you only get so many chances to do it.",
      "Before you undo, look at why you got stuck.",
    ],
  },
  {
    id: "hollow",
    title: "Chapter 5",
    character: "./story/hollow.svg",
    characterName: "Hollow Keeper",
    lines: [
      "The pieces here are big and heavy.",
      "Large numbers rarely add up to ten together.",
      "Save the small ones. They are the key later on.",
    ],
  },
  {
    id: "roots",
    title: "Chapter 6",
    character: "./story/hollow.svg",
    characterName: "Root Keeper",
    lines: [
      "Long combinations score the most.",
      "But sweep them up and the rest can no longer find each other.",
      "A high score and an empty board — you cannot have both.",
    ],
  },
  {
    id: "ridge",
    title: "Chapter 7",
    character: "./story/grove.svg",
    characterName: "Ridge Keeper",
    lines: [
      "From here on there is less help to go around.",
      "Have you ever emptied a board with no hints?",
      "If not, now is the time.",
    ],
  },
  {
    id: "mist",
    title: "Chapter 8",
    character: "./story/grove.svg",
    characterName: "Water Mist",
    lines: [
      "The wider the board, the longer one mistake lingers.",
      "Your first few moves decide your last few.",
      "It is fine to start slowly.",
    ],
  },
  {
    id: "canopy",
    title: "Chapter 9",
    character: "./story/canopy.svg",
    characterName: "Treetop",
    lines: [
      "Not many climb this high.",
      "There is almost no help left now.",
      "Find every last piece with your own eyes.",
    ],
  },
  {
    id: "starfall",
    title: "Chapter 10",
    character: "./story/canopy.svg",
    characterName: "Star Keeper",
    lines: [
      "Three stars fall only on a board emptied unaided.",
      "The second star still comes to those who went back.",
      "So do not be ashamed — just remember it.",
    ],
  },
  {
    id: "stump",
    title: "Chapter 11",
    character: "./story/sprout.svg",
    characterName: "Sprout",
    lines: [
      "You are back at that first stump.",
      "The pieces are the same. Your eyes are not.",
      "This is the last board. Leave nothing behind.",
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

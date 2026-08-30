/**
 * The hands-on tutorial: five boards, each teaching one thing by making the
 * player do it.
 *
 * Every board is built so that **exactly one** combination adds up to ten. That
 * means the game's own rules can judge the answer — there is no separate
 * "is this the move I meant?" check to keep in step with them. Change a layout
 * and tutorial.test.ts will tell you if a second answer crept in.
 *
 * `0` is an empty square.
 */
export interface TutorialStep {
  id: string;
  /** Rows of tile values, laid out as the player will see them. */
  layout: number[][];
  /** What to do, shown above the board. */
  instruction: string;
  /** The lesson, shown once the move lands. */
  reward: string;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "sum-ten",
    layout: [
      [4, 0, 6],
      [0, 3, 0],
      [2, 0, 0],
    ],
    instruction: "Tap numbers that add up to 10 and they clear.\nTry 4 and 6.",
    reward: "That's it! Add up to 10 and they go.",
  },
  {
    id: "three-tiles",
    layout: [
      [2, 0, 5],
      [0, 1, 0],
      [3, 0, 0],
    ],
    instruction: "It does not have to be two.\nTry 2 + 3 + 5.",
    reward: "You can join 2 to 5 blocks.",
  },
  {
    id: "same-number",
    layout: [
      [3, 0, 3],
      [0, 0, 0],
      [0, 4, 0],
    ],
    instruction: "3 + 3 is 6, so nothing happens.\nAdd the 4 as well.",
    reward: "Matching numbers do nothing. Adding to 10 does.",
  },
  {
    id: "anywhere",
    layout: [
      [9, 0, 4, 0, 0],
      [0, 4, 0, 4, 0],
      [0, 0, 4, 0, 1],
    ],
    instruction: "They can be far apart.\nTry 9 and 1.",
    reward: "Any squares can go together.",
  },
  {
    id: "long-chain",
    layout: [
      [1, 0, 2, 0, 3],
      [0, 2, 0, 2, 0],
    ],
    instruction: "The more you join, the more you score.\nTap all five.",
    reward: "2 blocks 10 · 3 blocks 20 · 4 blocks 40 · 5 blocks 80!",
  },
];

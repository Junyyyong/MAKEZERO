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
    instruction: "숫자를 눌러 합이 10을 만들면 지워집니다.\n4와 6을 눌러보세요.",
    reward: "그거예요! 합이 10이면 사라집니다.",
  },
  {
    id: "three-tiles",
    layout: [
      [2, 0, 5],
      [0, 1, 0],
      [3, 0, 0],
    ],
    instruction: "두 개가 아니어도 됩니다.\n2 + 3 + 5 를 눌러보세요.",
    reward: "2개부터 5개까지 이을 수 있어요.",
  },
  {
    id: "same-number",
    layout: [
      [3, 0, 3],
      [0, 0, 0],
      [0, 4, 0],
    ],
    instruction: "3 + 3 은 6이라 지워지지 않아요.\n4까지 함께 눌러보세요.",
    reward: "같은 숫자끼리는 안 되지만, 합이 10이면 됩니다.",
  },
  {
    id: "anywhere",
    layout: [
      [9, 0, 4, 0, 0],
      [0, 4, 0, 4, 0],
      [0, 0, 4, 0, 1],
    ],
    instruction: "멀리 떨어져 있어도 괜찮아요.\n9와 1을 눌러보세요.",
    reward: "어느 칸이든 함께 고를 수 있습니다.",
  },
  {
    id: "long-chain",
    layout: [
      [1, 0, 2, 0, 3],
      [0, 2, 0, 2, 0],
    ],
    instruction: "많이 이을수록 점수가 큽니다.\n다섯 개를 모두 눌러보세요.",
    reward: "2개 10점 · 3개 20점 · 4개 40점 · 5개 80점!",
  },
];

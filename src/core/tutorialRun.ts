import { evaluateSelection } from "./rules";
import type { TutorialStep } from "../content/tutorial";
import type { Board } from "./types";

/** Turns a step's layout into a board; 0 marks an empty square. */
export function tutorialBoard(step: TutorialStep): Board {
  const width = step.layout[0]!.length;
  const cells = step.layout.flat().map((value) => ({ value, cleared: value === 0 }));
  return { width, cells };
}

export interface TutorialState {
  index: number;
  board: Board;
  /** Set once the step's move lands, while its lesson is on screen. */
  solved: boolean;
}

export function startTutorial(steps: readonly TutorialStep[]): TutorialState {
  return { index: 0, board: tutorialBoard(steps[0]!), solved: false };
}

/**
 * Plays a selection against the current step.
 *
 * Judged by the game's own rules, so the tutorial can never teach something the
 * game would then reject. Each board is built with exactly one combination that
 * makes ten, so any move the rules accept is the move the step was asking for —
 * boards may still carry other tiles, there to make the point (the two 3s that
 * look pairable, the distance between a 9 and a 1).
 */
export function playTutorial(state: TutorialState, indices: readonly number[]): TutorialState {
  if (state.solved) return state;
  if (!evaluateSelection(state.board, indices).ok) return state;

  const cells = state.board.cells.map((cell) => ({ ...cell }));
  for (const i of indices) cells[i]!.cleared = true;
  return { ...state, board: { width: state.board.width, cells }, solved: true };
}

/** Moves to the next step, or returns null when the tutorial is finished. */
export function nextTutorialStep(
  state: TutorialState,
  steps: readonly TutorialStep[],
): TutorialState | null {
  const index = state.index + 1;
  if (index >= steps.length) return null;
  return { index, board: tutorialBoard(steps[index]!), solved: false };
}

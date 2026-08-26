import { describe, expect, it } from "vitest";
import { evaluateSelection } from "../core/rules";
import { findValueCombo } from "../core/solver";
import { TUTORIAL_STEPS } from "./tutorial";
import {
  nextTutorialStep,
  playTutorial,
  startTutorial,
  tutorialBoard,
} from "../core/tutorialRun";
import { valueCounts } from "../core/board";

const startAt = (step: (typeof TUTORIAL_STEPS)[number]) => ({
  index: TUTORIAL_STEPS.indexOf(step),
  board: tutorialBoard(step),
  solved: false,
});

/** Every distinct set of 2..5 live tiles that adds up to ten. */
function allAnswers(step: (typeof TUTORIAL_STEPS)[number]): number[][] {
  const board = tutorialBoard(step);
  const live = board.cells.flatMap((cell, i) => (cell.cleared ? [] : [i]));
  const found: number[][] = [];
  const walk = (start: number, picked: number[]) => {
    if (picked.length >= 2 && evaluateSelection(board, picked).ok) found.push([...picked]);
    if (picked.length >= 5) return;
    for (let k = start; k < live.length; k++) walk(k + 1, [...picked, live[k]!]);
  };
  walk(0, []);
  return found;
}

describe("tutorial steps", () => {
  it("each teaches one thing and says what it taught", () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.instruction.length).toBeGreaterThan(0);
      expect(step.reward.length).toBeGreaterThan(0);
    }
  });

  it("has exactly one right answer per step, so the rules can judge it", () => {
    for (const step of TUTORIAL_STEPS) {
      const answers = allAnswers(step);
      expect(answers.length, `step "${step.id}" has ${answers.length} answers`).toBe(1);
    }
  });

  it("lays every board out as an even grid", () => {
    for (const step of TUTORIAL_STEPS) {
      const width = step.layout[0]!.length;
      for (const row of step.layout) expect(row).toHaveLength(width);
      expect(tutorialBoard(step).cells).toHaveLength(width * step.layout.length);
    }
  });

  it("counts the answer as solved, whatever else is left on the board", () => {
    for (const step of TUTORIAL_STEPS) {
      const answer = allAnswers(step)[0]!;
      const played = playTutorial(startAt(step), answer);
      expect(played.solved, `step "${step.id}" did not register its answer`).toBe(true);
      for (const i of answer) expect(played.board.cells[i]!.cleared).toBe(true);
    }
  });

  it("ignores a selection the rules reject", () => {
    const step = TUTORIAL_STEPS[0]!;
    const board = tutorialBoard(step);
    const live = board.cells.flatMap((c, i) => (c.cleared ? [] : [i]));
    const wrong = [live[0]!, live[live.length - 1]!]; // 4 and 2, which make six
    const played = playTutorial(startAt(step), wrong);
    expect(played.solved).toBe(false);
    expect(played.board).toEqual(board);
  });

  it("walks through every step and then finishes", () => {
    let state = startTutorial(TUTORIAL_STEPS);
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      expect(state.index).toBe(i);
      state = playTutorial(state, allAnswers(TUTORIAL_STEPS[i]!)[0]!);
      expect(state.solved).toBe(true);
      const next = nextTutorialStep(state, TUTORIAL_STEPS);
      if (i === TUTORIAL_STEPS.length - 1) {
        expect(next).toBeNull();
      } else {
        state = next!;
        expect(state.solved).toBe(false);
      }
    }
  });

  it("builds up from a pair to a five-tile chain", () => {
    const sizes = TUTORIAL_STEPS.map((s) => allAnswers(s)[0]!.length);
    expect(sizes[0]).toBe(2);
    expect(sizes.at(-1)).toBe(5);
  });

  it("teaches the same-number trap with a board that looks like a pair", () => {
    const trap = TUTORIAL_STEPS.find((s) => s.id === "same-number")!;
    const board = tutorialBoard(trap);
    // The two 3s are right there and must not clear on their own.
    const threes = board.cells.flatMap((c, i) => (!c.cleared && c.value === 3 ? [i] : []));
    expect(threes).toHaveLength(2);
    expect(evaluateSelection(board, threes).ok).toBe(false);
    expect(findValueCombo(valueCounts(board))).toEqual([3, 3, 4]);
  });
});

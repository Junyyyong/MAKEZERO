import { isSelectionValid } from "../../core/rules";
import { nextTutorialStep, playTutorial, startTutorial } from "../../core/tutorialRun";
import type { TutorialState } from "../../core/tutorialRun";
import { TUTORIAL_STEPS } from "../../content/tutorial";
import { BoardView } from "../boardView";
import { el } from "../dom";
import { feedback } from "../feedback";

/**
 * Teaches the rules by making the player use them. Each board has exactly one
 * combination that makes ten, so the game's own rules decide whether the move
 * was right — the tutorial cannot drift out of step with them.
 */
export class TutorialScreen {
  private state: TutorialState = startTutorial(TUTORIAL_STEPS);
  private onFinish: (() => void) | null = null;
  /** How many blocks the selection held last time it changed. */
  private held = 0;

  private readonly view: BoardView;
  private readonly instruction = el<HTMLParagraphElement>("tutorial-instruction");
  private readonly reward = el<HTMLParagraphElement>("tutorial-reward");
  private readonly nextBtn = el<HTMLButtonElement>("btn-tutorial-next");
  private readonly dots = el<HTMLDivElement>("tutorial-dots");

  constructor() {
    this.view = new BoardView({
      wrap: el("tutorial-board-wrap"),
      grid: el("tutorial-board"),
      isValid: (selection) => isSelectionValid(this.state.board, selection),
      onCommit: (selection) => this.commit(selection),
      // The practice board has to sound like the real one, or the lesson is
      // about a game the player is not about to play.
      onReject: () => {
        this.held = 0;
        feedback.reject();
      },
      onSelectionChange: (values) => {
        if (values.length > this.held) feedback.pick(values.length);
        this.held = values.length;
      },
      maxTilePx: 74,
    });
    this.nextBtn.addEventListener("click", () => this.advance());
    el<HTMLButtonElement>("btn-tutorial-skip").addEventListener("click", () => this.finish());
  }

  /** Restarts from the first step. */
  start(onFinish: () => void): void {
    this.onFinish = onFinish;
    this.state = startTutorial(TUTORIAL_STEPS);
    this.view.setBoard(this.state.board);
    this.view.setInteractive(true);
    this.render();
  }

  private commit(selection: readonly number[]): void {
    const next = playTutorial(this.state, selection);
    if (next === this.state) return;
    this.held = 0;
    feedback.clear(selection.length);
    this.state = next;
    this.view.sync(next.board);
    this.render();
  }

  private advance(): void {
    const next = nextTutorialStep(this.state, TUTORIAL_STEPS);
    if (!next) {
      this.finish();
      return;
    }
    this.state = next;
    this.view.setBoard(next.board);
    this.view.setInteractive(true);
    this.render();
  }

  private finish(): void {
    this.view.setInteractive(false);
    const done = this.onFinish;
    this.onFinish = null;
    done?.();
  }

  private render(): void {
    const step = TUTORIAL_STEPS[this.state.index]!;
    this.instruction.textContent = step.instruction;
    this.reward.textContent = this.state.solved ? step.reward : "";
    this.nextBtn.classList.toggle("hidden", !this.state.solved);
    this.nextBtn.textContent =
      this.state.index >= TUTORIAL_STEPS.length - 1 ? "Start" : "Next";
    if (this.state.solved) this.view.setInteractive(false);

    this.dots.replaceChildren(
      ...TUTORIAL_STEPS.map((_, i) => {
        const dot = document.createElement("span");
        dot.className = i < this.state.index ? "dot done" : i === this.state.index ? "dot now" : "dot";
        return dot;
      }),
    );
    this.view.render();
  }
}

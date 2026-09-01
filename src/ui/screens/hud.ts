import { aliveCount, emptyIndices } from "../../core/board";
import { canSplit, targetsOf } from "../../core/game";
import type { GameState } from "../../core/game";
import { el, formatClock } from "../dom";

/**
 * Everything around the board: what the run is called, the three numbers it is
 * measured by, the equation being built, and the three tools.
 *
 * The three stat slots are the same slots in every mode — only their labels
 * and values change — so switching modes never moves the board.
 */
export class Hud {
  private readonly runTitle = el<HTMLDivElement>("run-title");
  private readonly stats = [
    { box: el<HTMLDivElement>("stat-a"), value: el<HTMLElement>("stat-a-value") },
    { box: el<HTMLDivElement>("stat-b"), value: el<HTMLElement>("stat-b-value") },
    { box: el<HTMLDivElement>("stat-c"), value: el<HTMLElement>("stat-c-value") },
  ];
  private readonly sumBox = el<HTMLElement>("selection-sum");
  private readonly goalLine = el<HTMLParagraphElement>("goal-line");
  private readonly sumTerms = el<HTMLElement>("sum-terms");
  private readonly sumTotal = el<HTMLElement>("sum-total");
  private readonly timerBar = el<HTMLDivElement>("timer-bar");
  private readonly timerFill = el<HTMLSpanElement>("timer-fill");
  private readonly noticeEl = el<HTMLParagraphElement>("notice");
  readonly hintBtn = el<HTMLButtonElement>("btn-hint");
  private readonly hintBadge = el<HTMLSpanElement>("badge-hint");
  readonly undoBtn = el<HTMLButtonElement>("btn-undo");
  private readonly undoBadge = el<HTMLSpanElement>("badge-undo");
  readonly splitBtn = el<HTMLButtonElement>("btn-split");
  private readonly splitBadge = el<HTMLSpanElement>("badge-split");

  /** Clears in a row without a refused selection between them. */
  combo = 0;
  bestForMode = 0;
  /** The sums that clear, so the equation knows when it is finished. */
  private targets: readonly number[] = [10];

  /** Shows the equation as it is built: 2 + 3 + 2 = ?, then = 10. */
  setSelection(values: readonly number[]): void {
    const sum = values.reduce((total, value) => total + value, 0);
    this.sumTerms.replaceChildren(
      ...values.flatMap((value, i) => {
        const term = document.createElement("b");
        term.className = "sum-term";
        term.dataset.v = String(value);
        term.textContent = String(value);
        if (i === 0) return [term];
        const plus = document.createElement("span");
        plus.className = "sum-plus";
        plus.textContent = "+";
        return [plus, term];
      }),
    );
    this.sumTotal.textContent = values.length === 0 ? "?" : String(sum);
    this.sumBox.classList.toggle("active", values.length > 0);
    this.sumBox.classList.toggle("ready", values.length > 0 && this.targets.includes(sum));
  }

  /** An override for the line under the board, or null to let it speak again. */
  setNotice(text: string | null): void {
    this.override = text;
    if (text !== null) this.noticeEl.textContent = text;
  }

  private override: string | null = null;

  render(state: GameState): void {
    const { config, status, remainingMs, elapsedMs } = state;
    this.targets = targetsOf(config);
    // Only worth saying when there is more than one right answer.
    this.goalLine.classList.toggle("hidden", this.targets.length < 2);
    this.goalLine.textContent = `MAKE ${this.targets.join(" \u00b7 ")}`;

    this.hintBadge.textContent = String(state.hintsLeft);
    this.hintBtn.disabled = state.hintsLeft === 0 || status !== "playing";
    this.hintBtn.classList.toggle("hidden", config.hints === 0);

    // Taking a move back is what makes "empty the board" a fair goal, so the
    // button stays live on a board that has gone dead — that is the one moment
    // it matters most.
    this.undoBadge.textContent = String(state.undosLeft);
    this.undoBtn.disabled = state.undosLeft === 0 || !state.previous;
    this.undoBtn.classList.toggle("hidden", config.undos === 0);
    this.undoBtn.classList.toggle("urge", status === "lost" && !this.undoBtn.disabled);

    this.splitBadge.textContent = String(state.splitsLeft);
    this.splitBtn.disabled = !canSplit(state);
    this.splitBtn.classList.toggle("hidden", config.splits === 0);

    const timed = config.timeLimitMs !== undefined;
    this.timerBar.classList.toggle("hidden", !timed);
    if (timed) {
      this.timerFill.style.transform = `scaleX(${Math.max(0, remainingMs / config.timeLimitMs!)})`;
      this.timerBar.classList.toggle("urgent", remainingMs <= 10_000);
    }

    if (config.mode === "story") {
      this.runTitle.textContent = `STAGE ${config.stage ?? 1}`;
      this.stat(0, "REVEAL", `${this.revealed(state)}%`);
      this.stat(1, "TIME", formatClock(elapsedMs));
      this.stat(2, "COMBO", String(this.combo));
    } else if (config.mode === "timeAttack") {
      this.runTitle.textContent = "TIME ATTACK";
      this.stat(0, "TIME", formatClock(remainingMs));
      this.stat(1, "SCORE", state.score.toLocaleString());
      this.stat(2, "COMBO", String(this.combo));
    } else if (config.mode === "clearAll") {
      this.runTitle.textContent = "MAKE 10 · 20 · 30";
      // LEFT, not TIME: nothing is being raced, and how many blocks are still
      // standing is the only number that decides whether the board is done.
      this.stat(0, "LEFT", String(aliveCount(state.board)));
      this.stat(1, "SCORE", state.score.toLocaleString());
      this.stat(2, "TIME", formatClock(elapsedMs));
    } else {
      this.runTitle.textContent = "ENDLESS";
      this.stat(0, "TIME", formatClock(elapsedMs));
      this.stat(1, "SCORE", state.score.toLocaleString());
      this.stat(2, "BEST", this.bestForMode.toLocaleString());
    }

    // In endless the timer bar shows how close the board is to overflowing,
    // which is the only thing that ends the run.
    if (config.spawn) {
      const room = emptyIndices(state.board).length / state.board.cells.length;
      this.timerBar.classList.remove("hidden");
      this.timerFill.style.transform = `scaleX(${Math.max(0, Math.min(1, room))})`;
      this.timerBar.classList.toggle("urgent", room <= 0.15);
    }

    this.noticeEl.textContent = this.override ?? this.notice(state);
  }

  /** How much of the picture is uncovered, as a whole percent. */
  private revealed(state: GameState): number {
    const total = state.board.cells.length;
    if (total === 0) return 0;
    return Math.round(((total - aliveCount(state.board)) / total) * 100);
  }

  private stat(slot: number, label: string, value: string): void {
    const target = this.stats[slot]!;
    target.box.firstElementChild!.textContent = label;
    target.value.textContent = value;
  }

  /**
   * The line under the board. It never counts the blocks that are left: the
   * board already shows that, and REVEAL puts a number on it. Only what the
   * player cannot see goes here.
   */
  private notice(state: GameState): string {
    if (state.config.spawn) {
      if (state.status === "lost") return "The board is full.";
      return emptyIndices(state.board).length <= 6 ? "Almost full!" : "";
    }
    const targets = targetsOf(state.config);
    const wanted = targets.length > 1 ? targets.slice(0, -1).join(", ") + " or " + targets[targets.length - 1] : "ten";
    if (state.status === "won") {
      return state.config.mode === "clearAll" ? "Board cleared!" : "The whole picture is showing!";
    }
    if (state.status === "lost") {
      return state.undosLeft > 0 && state.previous
        ? "Stuck — undo a move and try again"
        : `Nothing left that makes ${wanted}.`;
    }
    // The one rule this mode has that the others do not, said where it is
    // needed: a tap settles at ten, so a bigger sum has to be dragged out.
    if (state.config.mode === "clearAll") return "Tap for 10 · drag on for 20 or 30";
    if (state.config.mode !== "story") return "Make ten to score";
    return "Clear every block to win the picture";
  }
}

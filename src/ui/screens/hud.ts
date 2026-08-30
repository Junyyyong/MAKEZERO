import { aliveCount, emptyIndices } from "../../core/board";
import { canSplit } from "../../core/game";
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
    this.sumBox.classList.toggle("ready", sum === 10);
  }

  /** An override for the line under the board, or null to let it speak again. */
  setNotice(text: string | null): void {
    this.override = text;
    if (text !== null) this.noticeEl.textContent = text;
  }

  private override: string | null = null;

  render(state: GameState): void {
    const { config, status, remainingMs, elapsedMs } = state;

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
    if (state.status === "lost") {
      return state.undosLeft > 0 && state.previous
        ? "Stuck — undo a move and try again"
        : "No numbers left that make ten.";
    }
    if (state.config.mode !== "story") return "Make ten to score";
    if (state.status === "won") return "The whole picture is showing!";
    return "Clear every block to win the picture";
  }
}

import { emptyIndices } from "../../core/board";
import { canSplit } from "../../core/game";
import type { GameState } from "../../core/game";
import { chapterFor } from "../../content/chapters";
import { el, formatClock } from "../dom";

/** The score, mode chips, timer and hint button above and below the board. */
export class Hud {
  private readonly scoreEl = el<HTMLDivElement>("score");
  private readonly bestEl = el<HTMLDivElement>("score-best");
  private readonly sumEl = el<HTMLElement>("selection-sum").querySelector("b")!;
  private readonly chipLeft = el<HTMLDivElement>("chip-left");
  private readonly chipRight = el<HTMLDivElement>("chip-right");
  private readonly timerBar = el<HTMLDivElement>("timer-bar");
  private readonly timerFill = el<HTMLSpanElement>("timer-fill");
  private readonly noticeEl = el<HTMLParagraphElement>("notice");
  readonly hintBtn = el<HTMLButtonElement>("btn-hint");
  private readonly hintBadge = el<HTMLSpanElement>("badge-hint");
  readonly undoBtn = el<HTMLButtonElement>("btn-undo");
  private readonly undoBadge = el<HTMLSpanElement>("badge-undo");
  readonly splitBtn = el<HTMLButtonElement>("btn-split");
  private readonly splitBadge = el<HTMLSpanElement>("badge-split");

  /** Games played today, shown in endless mode. */
  gamesToday = 1;
  bestToday = 0;
  bestForMode = 0;

  setSelectionSum(sum: number): void {
    this.sumEl.textContent = String(sum);
    const root = this.sumEl.parentElement!;
    root.classList.toggle("active", sum > 0);
    root.classList.toggle("ready", sum === 10);
  }

  /** An override for the line under the board, or null to let it speak again. */
  setNotice(text: string | null): void {
    this.override = text;
    if (text !== null) this.noticeEl.textContent = text;
  }

  private override: string | null = null;

  render(state: GameState): void {
    const { config, score, hintsLeft, status, remainingMs } = state;
    this.scoreEl.textContent = String(score);
    this.bestEl.textContent = `BEST ${Math.max(this.bestForMode, score)}`;
    this.hintBadge.textContent = String(hintsLeft);
    this.hintBtn.disabled = hintsLeft === 0 || status !== "playing";
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
      const stage = config.stage ?? 1;
      this.chipLeft.textContent = `스테이지 ${stage}`;
      this.chipRight.textContent = chapterFor(stage).title;
    } else if (config.mode === "timeAttack") {
      this.chipLeft.textContent = "타임어택";
      this.chipRight.textContent = formatClock(remainingMs);
    } else {
      this.chipLeft.textContent = `게임 ${this.gamesToday}`;
      this.chipRight.textContent = `오늘 ${Math.max(this.bestToday, score)} ♛`;
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

  private notice(state: GameState): string {
    if (state.config.spawn) {
      if (state.status === "lost") return "보드가 가득 찼어요.";
      const room = emptyIndices(state.board).length;
      return room <= 6 ? "곧 가득 차요!" : "";
    }
    if (state.status === "lost") {
      return state.undosLeft > 0 && state.previous
        ? "막혔어요 — 한 수 물려서 다시 해보세요"
        : "10을 만들 수 있는 숫자가 없어요.";
    }
    if (state.config.mode !== "story") return "10을 만들어 점수를 올리세요";
    if (state.status === "won") return "그림이 전부 드러났어요";
    return "한 칸도 남기지 않으면 그림을 얻어요";
  }
}

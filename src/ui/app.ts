import { aliveCount, areConnected, isAlive } from "../game/board";
import {
  commitSelection,
  isStuck,
  newGame,
  useAdd,
  useHint,
} from "../game/game";
import type { GameState } from "../game/game";
import { MAX_SELECTION, evaluateSelection } from "../game/rules";
import { loadDaily, saveDaily } from "./storage";
import type { DailyStats } from "./storage";

const HINT_MS = 2700;
const EDGE_SCROLL_PX = 56;

const RULES_TEXT = `같은 수 두 개, 또는 합이 10이 되도록 이어서 지웁니다.
3개부터 5개까지 이어도 되고, 길수록 점수가 큽니다.
<span class="rule-num">2개 10점 · 3개 30점 · 4개 70점 · 5개 150점</span>
가로·세로·대각선으로 붙어 있거나, 지워진 칸을 건너뛰어 순서상 이웃이면 이을 수 있습니다.
막히면 ＋ 로 남은 숫자를 아래에 더하세요.`;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

export class App {
  private state: GameState;
  private daily: DailyStats;
  private selection: number[] = [];
  private hinted: number[] = [];
  private hintTimer: number | undefined;

  private dragging = false;
  private dragMoved = false;

  private readonly boardEl = el<HTMLDivElement>("board");
  private readonly boardWrap = el<HTMLDivElement>("board-wrap");
  private readonly scoreEl = el<HTMLDivElement>("score");
  private readonly bestEl = el<HTMLElement>("best");
  private readonly gamesEl = el<HTMLDivElement>("chip-games");
  private readonly noticeEl = el<HTMLParagraphElement>("notice");
  private readonly addBtn = el<HTMLButtonElement>("btn-add");
  private readonly hintBtn = el<HTMLButtonElement>("btn-hint");
  private readonly addBadge = el<HTMLSpanElement>("badge-add");
  private readonly hintBadge = el<HTMLSpanElement>("badge-hint");
  private readonly overlay = el<HTMLDivElement>("overlay");
  private readonly overlayTitle = el<HTMLHeadingElement>("overlay-title");
  private readonly overlayBody = el<HTMLParagraphElement>("overlay-body");
  private readonly againBtn = el<HTMLButtonElement>("btn-again");

  private tiles: HTMLButtonElement[] = [];

  constructor() {
    this.daily = loadDaily();
    this.daily.games += 1;
    saveDaily(this.daily);
    this.state = newGame();
    this.bindEvents();
    this.render();
  }

  private bindEvents(): void {
    this.boardEl.addEventListener("pointerdown", this.onPointerDown);
    this.boardEl.addEventListener("pointermove", this.onPointerMove);
    this.boardEl.addEventListener("pointerup", this.onPointerUp);
    this.boardEl.addEventListener("pointercancel", this.onPointerCancel);
    this.boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

    this.addBtn.addEventListener("click", () => this.onAdd());
    this.hintBtn.addEventListener("click", () => this.onHint());
    this.againBtn.addEventListener("click", () => this.restart());
    el<HTMLButtonElement>("btn-restart").addEventListener("click", () => this.restart());
    el<HTMLButtonElement>("btn-help").addEventListener("click", () => this.showRules());
    window.addEventListener("resize", () => this.syncPitch());
  }

  // ---- input -------------------------------------------------------------

  private tileIndexFrom(target: EventTarget | null): number | null {
    const tile = (target as HTMLElement | null)?.closest?.(".tile") as HTMLElement | null;
    if (!tile?.dataset.i) return null;
    const i = Number(tile.dataset.i);
    return isAlive(this.state.board, i) ? i : null;
  }

  private tileIndexAtPoint(x: number, y: number): number | null {
    return this.tileIndexFrom(document.elementFromPoint(x, y));
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.state.status !== "playing") return;
    const i = this.tileIndexFrom(event.target);
    if (i === null) return;
    event.preventDefault();
    this.boardEl.setPointerCapture(event.pointerId);
    this.dragging = true;
    this.dragMoved = false;
    this.clearHint();

    const at = this.selection.indexOf(i);
    if (at >= 0) {
      // Tapping a tile already in the chain rewinds the chain to just before it.
      this.selection = this.selection.slice(0, at);
      this.render();
      return;
    }
    if (!this.extend(i)) this.selection = [i];
    this.render();
    // Only taps settle on their own; a drag waits for the finger to lift.
    this.tryAutoCommit();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    event.preventDefault();
    this.autoScroll(event.clientY);
    const i = this.tileIndexAtPoint(event.clientX, event.clientY);
    if (i === null || i === this.selection[this.selection.length - 1]) return;
    this.dragMoved = true;
    if (i === this.selection[this.selection.length - 2]) {
      this.selection.pop();
      this.render();
      return;
    }
    if (this.extend(i)) this.render();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.boardEl.releasePointerCapture?.(event.pointerId);
    if (!this.dragMoved) return; // a tap keeps its selection on screen
    this.settleDrag();
  };

  private readonly onPointerCancel = (): void => {
    this.dragging = false;
    this.selection = [];
    this.render();
  };

  /** Adds `i` to the chain when the rules allow it. */
  private extend(i: number): boolean {
    if (this.selection.length === 0) return false;
    if (this.selection.length >= MAX_SELECTION) return false;
    if (this.selection.includes(i)) return false;
    const last = this.selection[this.selection.length - 1]!;
    if (!areConnected(this.state.board, last, i)) return false;
    this.selection.push(i);
    return true;
  }

  private autoScroll(clientY: number): void {
    const box = this.boardWrap.getBoundingClientRect();
    if (clientY < box.top + EDGE_SCROLL_PX) this.boardWrap.scrollTop -= 10;
    else if (clientY > box.bottom - EDGE_SCROLL_PX) this.boardWrap.scrollTop += 10;
  }

  // ---- moves -------------------------------------------------------------

  private tryAutoCommit(): void {
    if (evaluateSelection(this.state.board, this.selection).ok) this.commit();
  }

  private settleDrag(): void {
    if (evaluateSelection(this.state.board, this.selection).ok) {
      this.commit();
      return;
    }
    if (this.selection.length >= 2) this.rejectSelection();
    this.selection = [];
    this.render();
  }

  private commit(): void {
    const anchor = this.selection[this.selection.length - 1]!;
    const { state, result } = commitSelection(this.state, this.selection);
    if (!result.ok) return;
    this.popScore(anchor, result.score);
    this.state = state;
    this.selection = [];
    this.syncBest();
    this.render();
  }

  private rejectSelection(): void {
    this.boardEl.classList.remove("shake");
    void this.boardEl.offsetWidth; // restart the animation
    this.boardEl.classList.add("shake");
  }

  private onAdd(): void {
    if (this.state.addsLeft === 0 || this.state.status !== "playing") return;
    this.selection = [];
    this.clearHint();
    const before = this.state.board.cells.length;
    this.state = useAdd(this.state);
    this.render();
    if (this.state.board.cells.length > before) {
      this.boardWrap.scrollTo({ top: this.boardWrap.scrollHeight, behavior: "smooth" });
    }
  }

  private onHint(): void {
    if (this.state.hintsLeft === 0 || this.state.status !== "playing") return;
    const { state, indices } = useHint(this.state);
    this.state = state;
    if (!indices) {
      this.render();
      return;
    }
    this.selection = [];
    this.hinted = indices;
    this.render();
    const first = this.tiles[indices[0]!];
    first?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      this.hinted = [];
      this.render();
    }, HINT_MS);
  }

  private clearHint(): void {
    if (this.hinted.length === 0) return;
    window.clearTimeout(this.hintTimer);
    this.hinted = [];
  }

  private restart(): void {
    this.daily = loadDaily();
    this.daily.games += 1;
    saveDaily(this.daily);
    this.state = newGame();
    this.selection = [];
    this.clearHint();
    this.overlay.classList.add("hidden");
    this.boardWrap.scrollTop = 0;
    this.render();
  }

  private syncBest(): void {
    if (this.state.score <= this.daily.best) return;
    this.daily = { ...this.daily, best: this.state.score };
    saveDaily(this.daily);
  }

  // ---- rendering ---------------------------------------------------------

  private popScore(anchor: number, score: number): void {
    const tile = this.tiles[anchor];
    if (!tile) return;
    const box = tile.getBoundingClientRect();
    const wrap = this.boardWrap.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "pop";
    pop.textContent = `+${score}`;
    pop.style.left = `${box.left - wrap.left + box.width / 2}px`;
    pop.style.top = `${box.top - wrap.top}px`;
    this.boardWrap.appendChild(pop);
    pop.addEventListener("animationend", () => pop.remove());
  }

  private rebuildTiles(): void {
    const frag = document.createDocumentFragment();
    this.tiles = this.state.board.cells.map((_, i) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.i = String(i);
      frag.appendChild(tile);
      return tile;
    });
    this.boardEl.replaceChildren(frag);
    this.syncPitch();
  }

  /** Publishes the rendered tile pitch so the CSS can rule the empty squares. */
  private syncPitch(): void {
    const first = this.tiles[0];
    if (!first) {
      this.boardWrap.classList.remove("ruled");
      return;
    }
    const gap = parseFloat(getComputedStyle(this.boardEl).gap) || 0;
    const size = first.getBoundingClientRect().width;
    if (size <= 0) return;
    this.boardWrap.style.setProperty("--pitch", `${size + gap}px`);
    this.boardWrap.classList.add("ruled");
  }

  private render(): void {
    const { board, score, addsLeft, hintsLeft, status } = this.state;
    if (this.tiles.length !== board.cells.length) this.rebuildTiles();

    const selected = new Set(this.selection);
    const hinted = new Set(this.hinted);
    board.cells.forEach((cell, i) => {
      const tile = this.tiles[i]!;
      tile.textContent = String(cell.value);
      tile.className = [
        "tile",
        cell.cleared ? "cleared" : "",
        selected.has(i) ? "sel" : "",
        hinted.has(i) ? "hint" : "",
      ]
        .filter(Boolean)
        .join(" ");
      tile.disabled = cell.cleared;
    });

    this.boardEl.classList.toggle("ok", evaluateSelection(board, this.selection).ok);
    this.scoreEl.textContent = String(score);
    this.bestEl.textContent = String(Math.max(this.daily.best, score));
    this.gamesEl.textContent = `게임 ${this.daily.games}`;
    this.addBadge.textContent = String(addsLeft);
    this.hintBadge.textContent = String(hintsLeft);
    this.addBtn.disabled = addsLeft === 0 || status !== "playing";
    this.hintBtn.disabled = hintsLeft === 0 || status !== "playing";

    const stuck = isStuck(this.state);
    this.addBtn.classList.toggle("urge", stuck && addsLeft > 0);
    this.noticeEl.textContent = stuck
      ? addsLeft > 0
        ? "이을 수 있는 조합이 없어요. ＋ 로 숫자를 더하세요."
        : "더 이상 이을 수 없어요."
      : `${aliveCount(board)}개 남음`;

    if (status !== "playing") this.showResult();
  }

  private showResult(): void {
    const cleared = this.state.status === "won";
    this.overlayTitle.textContent = cleared ? "클리어!" : "게임 종료";
    this.overlayBody.textContent = cleared
      ? `보드를 모두 지웠습니다.\n점수 ${this.state.score}점\n오늘 최고 ${this.daily.best}점`
      : `점수 ${this.state.score}점\n오늘 최고 ${this.daily.best}점\n남은 숫자 ${aliveCount(this.state.board)}개`;
    this.againBtn.textContent = "다시 하기";
    this.overlay.classList.remove("hidden");
  }

  private showRules(): void {
    this.overlayTitle.textContent = "규칙";
    this.overlayBody.innerHTML = RULES_TEXT;
    this.againBtn.textContent = "닫기";
    this.overlay.classList.remove("hidden");
    this.againBtn.onclick = () => {
      this.againBtn.onclick = null;
      this.overlay.classList.add("hidden");
      if (this.state.status !== "playing") this.showResult();
    };
  }
}

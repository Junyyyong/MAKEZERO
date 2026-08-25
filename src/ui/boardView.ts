import { isAlive } from "../game/board";
import { MAX_SELECTION } from "../game/rules";
import type { Board } from "../game/types";

const EDGE_SCROLL_PX = 56;
const HINT_MS = 2700;

export interface BoardViewOptions {
  wrap: HTMLElement;
  grid: HTMLElement;
  /** Whether two live tiles may sit next to each other in a chain. */
  isConnected(a: number, b: number): boolean;
  /** Whether the current selection would clear. */
  isValid(selection: readonly number[]): boolean;
  /** Fired when a selection should actually be played. */
  onCommit(selection: readonly number[]): void;
}

/**
 * Owns the tile grid: rendering, the pointer gestures that build a chain, and
 * the hint and score-pop flourishes. It holds the in-progress selection but no
 * game state — validity questions go back to the controller.
 */
export class BoardView {
  private board: Board = { width: 9, cells: [] };
  private tiles: HTMLButtonElement[] = [];
  private selection: number[] = [];
  private hinted: number[] = [];
  private hintTimer: number | undefined;
  private dragging = false;
  private dragMoved = false;
  private interactive = true;

  constructor(private readonly options: BoardViewOptions) {
    const { grid } = options;
    grid.addEventListener("pointerdown", this.onPointerDown);
    grid.addEventListener("pointermove", this.onPointerMove);
    grid.addEventListener("pointerup", this.onPointerUp);
    grid.addEventListener("pointercancel", this.onPointerCancel);
    grid.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("resize", () => this.syncPitch());
  }

  setBoard(board: Board): void {
    this.board = board;
    this.selection = [];
    this.render();
  }

  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    if (!interactive) {
      this.dragging = false;
      this.selection = [];
      this.render();
    }
  }

  clearSelection(): void {
    if (this.selection.length === 0) return;
    this.selection = [];
    this.render();
  }

  showHint(indices: number[]): void {
    this.selection = [];
    this.hinted = indices;
    this.render();
    this.tiles[indices[0]!]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      this.hinted = [];
      this.render();
    }, HINT_MS);
  }

  clearHint(): void {
    if (this.hinted.length === 0) return;
    window.clearTimeout(this.hintTimer);
    this.hinted = [];
  }

  scrollToBottom(): void {
    this.options.wrap.scrollTo({ top: this.options.wrap.scrollHeight, behavior: "smooth" });
  }

  scrollToTop(): void {
    this.options.wrap.scrollTop = 0;
  }

  reject(): void {
    this.options.grid.classList.remove("shake");
    void this.options.grid.offsetWidth; // restart the animation
    this.options.grid.classList.add("shake");
  }

  /** Floats the earned points off the last tile of the chain. */
  popScore(anchor: number, score: number): void {
    const tile = this.tiles[anchor];
    if (!tile) return;
    const box = tile.getBoundingClientRect();
    const wrapBox = this.options.wrap.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "pop";
    pop.textContent = `+${score}`;
    pop.style.left = `${box.left - wrapBox.left + box.width / 2}px`;
    pop.style.top = `${box.top - wrapBox.top}px`;
    this.options.wrap.appendChild(pop);
    pop.addEventListener("animationend", () => pop.remove());
  }

  // ---- input -------------------------------------------------------------

  private tileIndexFrom(target: EventTarget | null): number | null {
    const tile = (target as HTMLElement | null)?.closest?.(".tile") as HTMLElement | null;
    if (!tile?.dataset.i) return null;
    const i = Number(tile.dataset.i);
    return isAlive(this.board, i) ? i : null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.interactive) return;
    const i = this.tileIndexFrom(event.target);
    if (i === null) return;
    event.preventDefault();
    this.options.grid.setPointerCapture(event.pointerId);
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
    if (this.options.isValid(this.selection)) this.options.onCommit([...this.selection]);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    event.preventDefault();
    this.autoScroll(event.clientY);
    const i = this.tileIndexFrom(document.elementFromPoint(event.clientX, event.clientY));
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
    this.options.grid.releasePointerCapture?.(event.pointerId);
    if (!this.dragMoved) return; // a tap keeps its selection on screen
    if (this.options.isValid(this.selection)) {
      this.options.onCommit([...this.selection]);
      return;
    }
    if (this.selection.length >= 2) this.reject();
    this.selection = [];
    this.render();
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
    if (!this.options.isConnected(this.selection[this.selection.length - 1]!, i)) return false;
    this.selection.push(i);
    return true;
  }

  private autoScroll(clientY: number): void {
    const box = this.options.wrap.getBoundingClientRect();
    if (clientY < box.top + EDGE_SCROLL_PX) this.options.wrap.scrollTop -= 10;
    else if (clientY > box.bottom - EDGE_SCROLL_PX) this.options.wrap.scrollTop += 10;
  }

  // ---- rendering ---------------------------------------------------------

  private rebuildTiles(): void {
    const frag = document.createDocumentFragment();
    this.tiles = this.board.cells.map((_, i) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.i = String(i);
      frag.appendChild(tile);
      return tile;
    });
    this.options.grid.replaceChildren(frag);
    this.syncPitch();
  }

  /** Publishes the rendered tile pitch so the CSS can rule the empty squares. */
  private syncPitch(): void {
    const first = this.tiles[0];
    if (!first) {
      this.options.wrap.classList.remove("ruled");
      return;
    }
    const gap = parseFloat(getComputedStyle(this.options.grid).gap) || 0;
    const size = first.getBoundingClientRect().width;
    if (size <= 0) return;
    this.options.wrap.style.setProperty("--pitch", `${size + gap}px`);
    this.options.wrap.classList.add("ruled");
  }

  render(): void {
    if (this.tiles.length !== this.board.cells.length) this.rebuildTiles();
    const selected = new Set(this.selection);
    const hinted = new Set(this.hinted);
    this.board.cells.forEach((cell, i) => {
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
    this.options.grid.classList.toggle("ok", this.options.isValid(this.selection));
  }
}

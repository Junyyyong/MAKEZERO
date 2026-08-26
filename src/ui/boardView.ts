import { isAlive, valueAt } from "../core/board";
import { MAX_SELECTION, TARGET_SUM } from "../core/rules";
import type { Board } from "../core/types";

const HINT_MS = 2700;
/** Below this a tile is too small to hit reliably with a thumb. */
const MIN_TILE_PX = 22;

export interface BoardViewOptions {
  wrap: HTMLElement;
  grid: HTMLElement;
  /** Whether the current selection would clear. */
  isValid(selection: readonly number[]): boolean;
  /** Fired when a selection should actually be played. */
  onCommit(selection: readonly number[]): void;
}

/**
 * Owns the tile grid: sizing it to the screen, the tap and drag gestures that
 * build a selection, and the hint and score-pop flourishes. It holds the
 * in-progress selection but no game state — validity goes back to the caller.
 *
 * Any tiles may be selected together, however far apart, so a drag simply
 * sweeps up whatever it passes over.
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
  /** Cleared whenever the board must be measured again. */
  private laidOut = "";

  constructor(private readonly options: BoardViewOptions) {
    const { grid } = options;
    grid.addEventListener("pointerdown", this.onPointerDown);
    grid.addEventListener("pointermove", this.onPointerMove);
    grid.addEventListener("pointerup", this.onPointerUp);
    grid.addEventListener("pointercancel", this.onPointerCancel);
    grid.addEventListener("contextmenu", (event) => event.preventDefault());
    options.wrap.addEventListener("pointerdown", (event) => {
      if (this.tileIndexFrom(event.target) === null) this.clearSelection();
    });
    window.addEventListener("resize", () => {
      this.laidOut = "";
      this.layout();
    });
  }

  /** Starts on a new board: nothing selected, measured from scratch. */
  setBoard(board: Board): void {
    this.board = board;
    this.selection = [];
    this.laidOut = "";
    this.render();
  }

  /**
   * Points the view at the current board without disturbing the player.
   *
   * Called on every render, because the board is a fresh object whenever
   * anything changes it — including tiles arriving on their own timer, which
   * must not cancel a selection the player is halfway through building.
   */
  sync(board: Board): void {
    const reshaped =
      board.width !== this.board.width || board.cells.length !== this.board.cells.length;
    this.board = board;
    const kept = this.selection.filter((i) => isAlive(board, i));
    if (kept.length !== this.selection.length) this.selection = kept;
    if (reshaped) this.laidOut = "";
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

  reject(): void {
    this.options.grid.classList.remove("shake");
    void this.options.grid.offsetWidth; // restart the animation
    this.options.grid.classList.add("shake");
  }

  /** Floats the earned points off the last tile of the selection. */
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
      // Tapping a selected tile drops it and everything picked after it.
      this.selection = this.selection.slice(0, at);
      this.render();
      return;
    }
    if (!this.extend(i)) this.selection = [i];
    this.render();
    // Ten is always the end of a selection, so a tap can settle on its own.
    if (this.options.isValid(this.selection)) this.options.onCommit([...this.selection]);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    event.preventDefault();
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

  /**
   * Adds a tile to the selection, refusing anything that could not belong to
   * it. A selection can only ever total ten, so a tile that would overshoot
   * starts a fresh selection instead of piling up an unclearable heap.
   */
  private extend(i: number): boolean {
    if (this.selection.length === 0) return false;
    if (this.selection.length >= MAX_SELECTION) return false;
    if (this.selection.includes(i)) return false;
    if (this.selectionSum() + valueAt(this.board, i) > TARGET_SUM) return false;
    this.selection.push(i);
    return true;
  }

  private selectionSum(): number {
    return this.selection.reduce((total, i) => total + valueAt(this.board, i), 0);
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
    this.laidOut = "";
  }

  /**
   * Sizes the tiles so the whole board fits the space it has, in both
   * directions. The board never grows during a run, so this settles once and
   * the player never has to scroll to see the rest of the puzzle.
   */
  private layout(): void {
    const { width } = this.board;
    const rows = Math.ceil(this.board.cells.length / width);
    if (rows === 0) return;

    const box = this.options.wrap.getBoundingClientRect();
    // The screen may still be hidden when a run is set up; leave the board
    // unmeasured so the next render tries again once it has a size.
    if (box.width <= 0 || box.height <= 0) {
      this.laidOut = "";
      return;
    }

    const styles = getComputedStyle(this.options.grid);
    const gap = parseFloat(styles.gap) || 0;
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

    const byWidth = (box.width - padX - gap * (width - 1)) / width;
    const byHeight = (box.height - padY - gap * (rows - 1)) / rows;
    const tile = Math.max(MIN_TILE_PX, Math.floor(Math.min(byWidth, byHeight)));

    this.options.grid.style.setProperty("--tile", `${tile}px`);
    // repeat() will not take its count from a custom property, so the track
    // list has to be written out here rather than left to the stylesheet.
    this.options.grid.style.gridTemplateColumns = `repeat(${width}, ${tile}px)`;
    this.options.grid.dataset.cols = String(width);

    // Only a board too big even at the minimum tile size may scroll.
    const overflows = rows * (tile + gap) + padY > box.height + 1;
    this.options.wrap.classList.toggle("scrolls", overflows);
    this.laidOut = `${width}x${rows}@${Math.round(box.width)}x${Math.round(box.height)}`;
  }

  render(): void {
    if (this.tiles.length !== this.board.cells.length) this.rebuildTiles();
    if (this.laidOut === "") this.layout();

    const selected = new Set(this.selection);
    const hinted = new Set(this.hinted);
    this.board.cells.forEach((cell, i) => {
      const tile = this.tiles[i]!;
      tile.textContent = cell.value > 0 ? String(cell.value) : "";
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

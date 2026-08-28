import { isAlive, valueAt } from "../core/board";
import { MAX_SELECTION, TARGET_SUM } from "../core/rules";
import type { Board } from "../core/types";

const HINT_MS = 2700;
/** How long a refused selection stays lit before it lets go. */
const BUST_MS = 420;
/**
 * Below this a tile is too small to hit reliably with a thumb. It is a floor
 * of last resort: the chrome shrinks first (see the short-screen rules in
 * game.css), so tiles only get here on a genuinely cramped viewport.
 */
const MIN_TILE_PX = 16;

export interface BoardViewOptions {
  wrap: HTMLElement;
  grid: HTMLElement;
  /** Whether the current selection would clear. */
  isValid(selection: readonly number[]): boolean;
  /** Fired when a selection should actually be played. */
  onCommit(selection: readonly number[]): void;
  /** Fired when a block is chosen to be broken up, while splitting is armed. */
  onSplit?(index: number): void;
  /** Fired when a selection is refused — the combo it was building is over. */
  onReject?(): void;
  /** Keeps the bottom sum indicator in sync with taps and drags. */
  onSelectionChange?(values: readonly number[]): void;
  /**
   * Largest a tile may be drawn. A game board wants to fill the screen, but a
   * small teaching board would blow up to enormous tiles without a cap.
   */
  maxTilePx?: number;
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
  /** Blocks shown as refused, cleared again once the flash is over. */
  private busted: number[] = [];
  private bustTimer: number | undefined;
  private hintTimer: number | undefined;
  private dragging = false;
  /** While armed, the next tap breaks a block up instead of selecting it. */
  private splitting = false;
  /** Where the pointer was last seen, so a drag can fill in what it skipped. */
  private lastPoint: { x: number; y: number } | null = null;
  /** The tile size the board was last laid out at, in CSS pixels. */
  private tilePx = MIN_TILE_PX;
  /** Stops one gesture after it clears or overcharges; lift to start again. */
  private gestureSettled = false;
  private interactive = true;
  /** Cleared whenever the board must be measured again. */
  private laidOut = "";
  /** The picture behind the board, cut into one slice per square. */
  private backdrop: string | null = null;
  private readonly resizeObserver: ResizeObserver | undefined;

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

    /*
     * The board refits whenever the space it has changes, whatever the cause:
     * a rotation, the browser's own bars sliding in and out, a notice wrapping
     * onto a second line, the on-screen keyboard, a foldable opening. Watching
     * `window.resize` alone misses most of those, because the window stays the
     * same size while this box does not.
     *
     * Safe from feedback because the wrap's height comes from flex layout, not
     * from the board inside it — resizing the tiles never resizes the wrap.
     */
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.layout());
      this.resizeObserver.observe(options.wrap);
    } else {
      window.addEventListener("resize", () => {
        this.laidOut = "";
        this.layout();
      });
    }
  }

  /**
   * Puts a picture behind the tiles, or takes it away.
   *
   * Cleared squares go transparent in this mode, so uncovering a block
   * uncovers the part of the picture it was standing on. The background is
   * clipped to the content box so it lines up with the tile grid rather than
   * with the frame around it.
   */
  setBackdrop(image: string | null): void {
    const { grid } = this.options;
    this.backdrop = image;
    grid.classList.toggle("reveal", image !== null);
    grid.style.setProperty("--plate", image ?? "none");
    this.laidOut = ""; // the slices are cut to the tile size
  }

  /**
   * Cuts the picture into one slice per square.
   *
   * The obvious way — one background on the whole board, transparent tiles —
   * leaves the uncovered part as a single continuous shape, gaps and all. Here
   * each square carries its own slice of the same picture, so what surfaces is
   * block-shaped: rounded corners, and the gap between blocks staying dark.
   *
   * The picture is treated as square and scaled to cover the grid, so a wide
   * early board and a tall late one both get the middle of it rather than a
   * squashed copy.
   */
  private cutBackdrop(tile: number, gap: number, cols: number, rows: number): void {
    if (this.backdrop === null) return;
    const step = tile + gap;
    const across = cols * tile + (cols - 1) * gap;
    const down = rows * tile + (rows - 1) * gap;
    const side = Math.max(across, down);
    const offsetX = (side - across) / 2;
    const offsetY = (side - down) / 2;

    this.tiles.forEach((element, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      element.style.backgroundSize = `${side}px ${side}px`;
      element.style.backgroundPosition = `${-(col * step) - offsetX}px ${-(row * step) - offsetY}px`;
    });
  }

  /** Starts on a new board: nothing selected, measured from scratch. */
  setBoard(board: Board): void {
    this.board = board;
    this.selection = [];
    this.emitSelection();
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
    if (kept.length !== this.selection.length) {
      this.selection = kept;
      this.emitSelection();
    }
    if (reshaped) this.laidOut = "";
    this.render();
  }

  /** Arms or disarms the split item. Arming clears any selection in progress. */
  setSplitting(on: boolean): void {
    if (this.splitting === on) return;
    this.splitting = on;
    this.options.grid.classList.toggle("splitting", on);
    if (on) this.clearSelection();
  }

  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    if (!interactive) {
      this.setSplitting(false);
      this.dragging = false;
      this.gestureSettled = false;
      this.selection = [];
      this.emitSelection();
      this.render();
    }
  }

  clearSelection(): void {
    if (this.selection.length === 0) return;
    this.selection = [];
    this.emitSelection();
    this.render();
  }

  showHint(indices: number[]): void {
    this.selection = [];
    this.emitSelection();
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

  /**
   * Says no: the board sways and the blocks that failed flash before they let
   * go. The flash is the whole point — a selection that simply vanished left
   * the player unsure whether the tap had registered at all.
   */
  reject(blamed: readonly number[] = []): void {
    this.options.grid.classList.remove("shake");
    void this.options.grid.offsetWidth; // restart the animation
    this.options.grid.classList.add("shake");

    this.options.onReject?.();
    if (blamed.length === 0) return;
    this.busted = [...blamed];
    window.clearTimeout(this.bustTimer);
    this.bustTimer = window.setTimeout(() => {
      this.busted = [];
      this.render();
    }, BUST_MS);
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
    if (this.splitting) {
      this.options.onSplit?.(i);
      return;
    }
    this.options.grid.setPointerCapture(event.pointerId);
    this.dragging = true;
    this.gestureSettled = false;
    this.lastPoint = { x: event.clientX, y: event.clientY };
    this.clearHint();

    const at = this.selection.indexOf(i);
    if (at >= 0) {
      // A tap toggles exactly that block, matching familiar mobile selection.
      this.selection.splice(at, 1);
      this.emitSelection();
      this.render();
      return;
    }
    this.add(i);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || this.gestureSettled) return;
    event.preventDefault();
    this.sweepTo(event.clientX, event.clientY);
  };

  /**
   * Picks up every tile between the last sample and this one.
   *
   * The browser reports a moving pointer as a handful of points, not as a
   * path: a quick flick across the board can arrive as a single move event
   * from one edge to the other. Testing only the reported points skips
   * whatever lay between them, and because a selection is only punished for
   * going *over* ten, the skipped tiles vanish silently — a fast sweep looked
   * like the game was picking out the tiles that happen to add up. Walking the
   * line makes the drag select exactly what the finger crossed.
   *
   * The step is a fraction of a tile so a tile can never fall between samples,
   * and the walk stops the moment the gesture settles — on a clear or a bust
   * nothing further the finger passes over counts.
   */
  private sweepTo(x: number, y: number): void {
    const from = this.lastPoint ?? { x, y };
    this.lastPoint = { x, y };
    const dx = x - from.x;
    const dy = y - from.y;
    const step = Math.max(4, this.tilePx * 0.4);
    const samples = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
    for (let s = 1; s <= samples; s++) {
      if (this.gestureSettled) return;
      const at = this.tileIndexFrom(
        document.elementFromPoint(from.x + (dx * s) / samples, from.y + (dy * s) / samples),
      );
      if (at !== null && !this.selection.includes(at)) this.add(at);
    }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.gestureSettled = false;
    this.lastPoint = null;
    this.options.grid.releasePointerCapture?.(event.pointerId);
    // Taps and incomplete drags deliberately keep their selection. A later
    // tap can toggle any chosen block off; only ten or overcharge settles it.
  };

  private readonly onPointerCancel = (): void => {
    this.dragging = false;
    this.gestureSettled = false;
    this.lastPoint = null;
    this.selection = [];
    this.emitSelection();
    this.render();
  };

  /**
   * Adds exactly what the player touched. We intentionally do not pre-filter
   * the drag toward a valid answer: crossing ten is player input too, and the
   * documented penalty is to clear the whole selection and shake the board.
   */
  private add(i: number): void {
    if (this.selection.includes(i)) return;
    this.selection.push(i);
    const sum = this.selectionSum();
    // Over ten is dead, and so is a full selection that has not reached it:
    // five blocks with no sixth to come can never add up, so say so now
    // rather than leaving the player to work it out and undo it by hand.
    const full = this.selection.length >= MAX_SELECTION;
    if (sum > TARGET_SUM || this.selection.length > MAX_SELECTION || (full && sum !== TARGET_SUM)) {
      this.reject(this.selection);
      this.selection = [];
      this.gestureSettled = true;
      this.emitSelection();
      this.render();
      return;
    }

    this.emitSelection();
    this.render();
    if (this.options.isValid(this.selection)) {
      const completed = [...this.selection];
      this.selection = [];
      this.gestureSettled = true;
      this.emitSelection();
      this.options.onCommit(completed);
    }
  }

  private selectionSum(): number {
    return this.selection.reduce((total, i) => total + valueAt(this.board, i), 0);
  }

  private emitSelection(): void {
    this.options.onSelectionChange?.(this.selection.map((i) => valueAt(this.board, i)));
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
    const gridStyles = getComputedStyle(this.options.grid);

    /*
     * clientWidth/clientHeight, not getBoundingClientRect().
     *
     * A rect is the *painted* box, so it includes any transform on the way up
     * the tree — and a screen arriving plays `.screen-enter`, which scales it
     * to .992 for the length of the animation. Measuring then reports a board
     * about three pixels narrower than it really is, which floors the tile a
     * whole pixel small; a transform fires no resize observation, so nothing
     * ever corrects it and that mode keeps a visibly wider margin than the
     * others for the rest of the run. These two properties report the layout
     * box, which the animation never touches.
     */
    const box = { width: this.options.wrap.clientWidth, height: this.options.wrap.clientHeight };
    // The screen may still be hidden when a run is set up; leave the board
    // unmeasured so the next render tries again once it has a size.
    if (box.width <= 0 || box.height <= 0) {
      this.laidOut = "";
      return;
    }

    const px = (value: string) => parseFloat(value) || 0;
    const gap = px(gridStyles.gap);
    // The frame's own border counts too: getBoundingClientRect measures the
    // border box, so leaving it out overshoots by the border on every side.
    const padX =
      px(gridStyles.paddingLeft) +
      px(gridStyles.paddingRight) +
      px(gridStyles.borderLeftWidth) +
      px(gridStyles.borderRightWidth);
    const padY =
      px(gridStyles.paddingTop) +
      px(gridStyles.paddingBottom) +
      px(gridStyles.borderTopWidth) +
      px(gridStyles.borderBottomWidth);

    const byWidth = (box.width - padX - gap * (width - 1)) / width;

    const byHeight = (this.options.wrap.clientHeight - padY - gap * (rows - 1)) / rows;
    const cap = this.options.maxTilePx ?? Infinity;
    const tile = Math.max(MIN_TILE_PX, Math.floor(Math.min(byWidth, byHeight, cap)));

    // Re-measuring on every observer callback is cheap; re-writing the styles
    // is what must not happen when nothing has actually moved.
    const signature = `${width}x${rows}@${tile}`;
    if (signature === this.laidOut) return;

    this.tilePx = tile;
    this.options.grid.style.setProperty("--tile", `${tile}px`);
    // repeat() will not take its count from a custom property, so the track
    // list has to be written out here rather than left to the stylesheet.
    this.options.grid.style.gridTemplateColumns = `repeat(${width}, ${tile}px)`;
    this.options.grid.dataset.cols = String(width);

    this.cutBackdrop(tile, gap, width, rows);

    // Only a board too big even at the minimum tile size may scroll.
    const overflows = rows * (tile + gap) + padY > this.options.wrap.clientHeight + 1;
    this.options.wrap.classList.toggle("scrolls", overflows);
    this.laidOut = signature;
  }

  render(): void {
    if (this.tiles.length !== this.board.cells.length) this.rebuildTiles();
    if (this.laidOut === "") this.layout();

    const selected = new Set(this.selection);
    const hinted = new Set(this.hinted);
    const busted = new Set(this.busted);
    this.board.cells.forEach((cell, i) => {
      const tile = this.tiles[i]!;
      tile.textContent = cell.value > 0 ? String(cell.value) : "";
      // Each digit has its own colour, so a board can be read by shape as
      // well as by number — see the palette in game.css.
      tile.dataset.v = String(cell.value);
      tile.className = [
        "tile",
        cell.cleared ? "cleared" : "",
        selected.has(i) ? "sel" : "",
        busted.has(i) ? "bust" : "",
        hinted.has(i) ? "hint" : "",
      ]
        .filter(Boolean)
        .join(" ");
      tile.disabled = cell.cleared;
    });
    this.options.grid.classList.toggle("ok", this.options.isValid(this.selection));
  }
}

import { TOTAL_STAGES, chapterFor } from "../../content/chapters";
import { artFor, plateFor } from "../../content/gallery";
import { el, formatClock } from "../dom";
import { bestTimeFor, totalCollected } from "../storage";
import type { Progress } from "../storage";

/**
 * The collection: one picture per stage, uncovered by emptying its board.
 *
 * A stage the player has not finished shows only its number — the picture is
 * the reward, so showing it early would spend it. Tapping a collected one
 * opens it full size.
 */
export class GalleryScreen {
  private readonly plates = el<HTMLElement>("record-plates");
  private readonly timeAttack = el<HTMLElement>("record-timeattack");
  private readonly endless = el<HTMLElement>("record-endless");
  private readonly grid = el<HTMLDivElement>("plate-grid");
  private readonly view = el<HTMLDivElement>("plate-view");
  private readonly full = el<HTMLDivElement>("plate-full");
  private readonly caption = el<HTMLParagraphElement>("plate-caption");
  private readonly sub = el<HTMLParagraphElement>("plate-sub");
  private readonly prevBtn = el<HTMLButtonElement>("btn-plate-prev");
  private readonly nextBtn = el<HTMLButtonElement>("btn-plate-next");

  /** The collected stages, in order — what the arrows walk. */
  private held: number[] = [];
  private shown = 0;
  private progress: Progress | undefined;

  constructor(onBack: () => void) {
    el<HTMLButtonElement>("btn-gallery-back").addEventListener("click", () => {
      if (this.closeView()) return; // the picture first, the screen after
      onBack();
    });
    // Only the backdrop closes it. Tapping the picture or an arrow must not,
    // or the arrows would be unusable.
    this.view.addEventListener("click", (event) => {
      if (event.target === this.view) this.closeView();
    });
    this.prevBtn.addEventListener("click", () => this.step(-1));
    this.nextBtn.addEventListener("click", () => this.step(1));
  }

  render(progress: Progress): void {
    this.closeView();
    this.progress = progress;
    this.held = [...progress.collected].sort((a, b) => a - b);
    this.plates.textContent = `${totalCollected(progress)} / ${TOTAL_STAGES}`;
    this.timeAttack.textContent = progress.bestTimeAttack.toLocaleString();
    this.endless.textContent = progress.bestEndless.toLocaleString();

    const frag = document.createDocumentFragment();
    for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
      const held = progress.collected.includes(stage);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = held ? "plate" : "plate locked";
      if (held) {
        cell.style.backgroundImage = artFor(stage);
        cell.setAttribute("aria-label", `Picture ${stage}, ${plateFor(stage).title}`);
        cell.addEventListener("click", () => this.openView(stage));
      } else {
        cell.textContent = String(stage);
        cell.disabled = true;
      }
      frag.appendChild(cell);
    }
    this.grid.replaceChildren(frag);
  }

  private openView(stage: number): void {
    this.shown = stage;
    this.full.style.backgroundImage = artFor(stage);
    this.caption.textContent = `${stage}. ${plateFor(stage).title}`;

    // What the picture cost: which chapter it came out of, and the run that
    // won it. A collection is more interesting when it remembers.
    const best = this.progress ? bestTimeFor(this.progress, stage) : 0;
    const time = best === 0 ? "" : ` · ${formatClock(best)}`;
    this.sub.textContent = `${chapterFor(stage).title}${time}`;

    const at = this.held.indexOf(stage);
    this.prevBtn.disabled = at <= 0;
    this.nextBtn.disabled = at < 0 || at >= this.held.length - 1;
    this.view.classList.remove("hidden");
  }

  /** Moves to the next or previous picture the player actually holds. */
  private step(by: number): void {
    const at = this.held.indexOf(this.shown);
    const next = this.held[at + by];
    if (at < 0 || next === undefined) return;
    this.openView(next);
  }

  /** Closes the full-size view. Returns whether it had been open. */
  private closeView(): boolean {
    const open = !this.view.classList.contains("hidden");
    this.view.classList.add("hidden");
    return open;
  }
}

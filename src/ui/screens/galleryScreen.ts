import { TOTAL_STAGES } from "../../content/chapters";
import { artFor, plateFor } from "../../content/gallery";
import { el } from "../dom";
import { totalCollected } from "../storage";
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

  constructor(onBack: () => void) {
    el<HTMLButtonElement>("btn-gallery-back").addEventListener("click", () => {
      if (this.closeView()) return; // the picture first, the screen after
      onBack();
    });
    this.view.addEventListener("click", () => this.closeView());
  }

  render(progress: Progress): void {
    this.closeView();
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
        cell.setAttribute("aria-label", `${stage}번 그림 ${plateFor(stage).title}`);
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
    this.full.style.backgroundImage = artFor(stage);
    this.caption.textContent = `${stage}. ${plateFor(stage).title}`;
    this.view.classList.remove("hidden");
  }

  /** Closes the full-size view. Returns whether it had been open. */
  private closeView(): boolean {
    const open = !this.view.classList.contains("hidden");
    this.view.classList.add("hidden");
    return open;
  }
}

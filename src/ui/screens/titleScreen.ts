import { TOTAL_STAGES, chapterFor } from "../../content/chapters";
import { artFor } from "../../content/gallery";
import type { GameMode } from "../../core/types";
import { el } from "../dom";
import type { Progress } from "../storage";

/** Mode picker, with whatever progress the player has made so far. */
export class TitleScreen {
  private readonly count = el<HTMLParagraphElement>("collection-count");
  private readonly strip = el<HTMLDivElement>("collection-strip");

  constructor(onPick: (mode: GameMode) => void, onRules: () => void, onSettings: () => void) {
    for (const mode of ["story", "timeAttack", "endless"] as const) {
      el<HTMLButtonElement>(`mode-${mode}`).addEventListener("click", () => onPick(mode));
    }
    el<HTMLButtonElement>("btn-title-rules").addEventListener("click", onRules);
    el<HTMLButtonElement>("btn-title-settings").addEventListener("click", onSettings);
  }

  render(progress: Progress): void {
    const stage = progress.stage;
    el("desc-story").textContent =
      stage > TOTAL_STAGES ? "모두 클리어" : `스테이지 ${stage} · ${chapterFor(stage).title}`;
    el("desc-timeAttack").textContent = progress.bestTimeAttack
      ? `60초 · 최고 ${progress.bestTimeAttack}점`
      : "60초 도전";
    el("desc-endless").textContent = progress.bestEndless
      ? `최고 ${progress.bestEndless}점`
      : "끝까지 지우기";
    this.renderCollection(progress);
  }

  /**
   * The last few pictures collected, with the next one still covered.
   *
   * The middle of the title screen would otherwise be empty, and this is what
   * the game is for — so it shows the collection growing rather than a gap.
   */
  private renderCollection(progress: Progress): void {
    this.count.textContent = `모은 그림 ${progress.collected.length} / ${TOTAL_STAGES}`;
    const recent = progress.collected.slice(-4);
    const frag = document.createDocumentFragment();
    for (const stage of recent) {
      const held = document.createElement("div");
      held.className = "collection-plate";
      held.style.backgroundImage = artFor(stage);
      frag.appendChild(held);
    }
    if (progress.stage <= TOTAL_STAGES) {
      const next = document.createElement("div");
      next.className = "collection-plate next";
      next.textContent = String(progress.stage);
      frag.appendChild(next);
    }
    this.strip.replaceChildren(frag);
  }
}

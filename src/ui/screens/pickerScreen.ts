import {
  CHAPTERS,
  STAGES_PER_CHAPTER,
  TOTAL_STAGES,
  chapterIndexFor,
} from "../../content/chapters";
import { artFor } from "../../content/gallery";
import { el, formatClock } from "../dom";
import { bestTimeFor } from "../storage";
import type { Progress } from "../storage";

/**
 * Choosing where to play: chapters, then the stages inside one, then a card
 * for the stage about to be started.
 *
 * Ninety-nine stages is too many for one list, and a flat list also hides the
 * only thing worth knowing before starting — which picture is behind it and
 * how fast it has been done before. So the stage grid is per chapter, and a
 * stage opens a card rather than starting immediately.
 */
export class PickerScreen {
  private readonly chapterList = el<HTMLOListElement>("chapter-list");
  private readonly chaptersSub = el<HTMLDivElement>("chapters-sub");
  private readonly stageGrid = el<HTMLDivElement>("stage-grid");
  private readonly stagesTitle = el<HTMLDivElement>("stages-title");
  private readonly stagesSub = el<HTMLDivElement>("stages-sub");
  private readonly card = el<HTMLDivElement>("stage-card");
  private readonly cardTitle = el<HTMLHeadingElement>("card-title");
  private readonly cardPlate = el<HTMLDivElement>("card-plate");
  private readonly cardLock = el<HTMLSpanElement>("card-plate-lock");
  private readonly cardBest = el<HTMLElement>("card-best");

  private progress: Progress | undefined;
  /** The stage the card is currently describing. */
  private chosen = 1;

  constructor(
    private readonly onChapter: (index: number) => void,
    private readonly onStart: (stage: number) => void,
    onChaptersBack: () => void,
    onStagesBack: () => void,
  ) {
    el<HTMLButtonElement>("btn-chapters-back").addEventListener("click", onChaptersBack);
    el<HTMLButtonElement>("btn-stages-back").addEventListener("click", () => {
      if (this.closeCard()) return; // the card first, the screen after
      onStagesBack();
    });
    el<HTMLButtonElement>("btn-card-close").addEventListener("click", () => this.closeCard());
    el<HTMLButtonElement>("btn-card-start").addEventListener("click", () => {
      this.closeCard();
      this.onStart(this.chosen);
    });
    this.card.addEventListener("click", (event) => {
      if (event.target === this.card) this.closeCard();
    });
  }

  renderChapters(progress: Progress): void {
    this.progress = progress;
    this.chaptersSub.textContent = `${progress.collected.length} / ${TOTAL_STAGES}`;

    const rows = CHAPTERS.map((chapter, index) => {
      const first = index * STAGES_PER_CHAPTER + 1;
      const held = this.heldIn(progress, index);
      const open = first <= progress.stage;

      const row = document.createElement("li");
      row.className = open ? "chapter-row" : "chapter-row shut";
      if (held === STAGES_PER_CHAPTER) row.classList.add("done");

      const name = document.createElement("span");
      name.className = "chapter-name";
      name.textContent = chapter.title;

      const count = document.createElement("span");
      count.className = "chapter-count";
      count.textContent = open ? `${held} / ${STAGES_PER_CHAPTER}` : "Locked";

      row.append(name, count);
      if (open) {
        row.addEventListener("click", () => this.onChapter(index));
      }
      return row;
    });
    this.chapterList.replaceChildren(...rows);
  }

  renderStages(progress: Progress, chapterIndex: number): void {
    this.progress = progress;
    this.closeCard();
    const chapter = CHAPTERS[chapterIndex]!;
    this.stagesTitle.textContent = chapter.title;
    this.stagesSub.textContent = `${this.heldIn(progress, chapterIndex)} / ${STAGES_PER_CHAPTER}`;

    const first = chapterIndex * STAGES_PER_CHAPTER + 1;
    const cells = Array.from({ length: STAGES_PER_CHAPTER }, (_, i) => {
      const stage = first + i;
      const held = progress.collected.includes(stage);
      const open = stage <= progress.stage;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = held ? "stage-cell done" : open ? "stage-cell" : "stage-cell shut";
      cell.textContent = String(stage).padStart(2, "0");
      cell.disabled = !open;
      if (open) cell.addEventListener("click", () => this.openCard(stage));
      return cell;
    });
    this.stageGrid.replaceChildren(...cells);
  }

  /** How many of a chapter's pictures are already collected. */
  private heldIn(progress: Progress, chapterIndex: number): number {
    const first = chapterIndex * STAGES_PER_CHAPTER + 1;
    return progress.collected.filter(
      (stage) => stage >= first && stage < first + STAGES_PER_CHAPTER,
    ).length;
  }

  private openCard(stage: number): void {
    const progress = this.progress;
    if (!progress) return;
    this.chosen = stage;
    this.cardTitle.textContent = `STAGE ${stage}`;

    // The picture is the reward, so it stays covered until it has been won.
    const held = progress.collected.includes(stage);
    this.cardPlate.style.backgroundImage = held ? artFor(stage) : "none";
    this.cardPlate.classList.toggle("held", held);
    this.cardLock.textContent = held ? "" : "?";
    this.cardLock.hidden = held;

    const best = bestTimeFor(progress, stage);
    this.cardBest.textContent = best === 0 ? "--:--" : formatClock(best);
    this.card.classList.remove("hidden");
  }

  /** Closes the stage card. Returns whether it had been open. */
  private closeCard(): boolean {
    const open = !this.card.classList.contains("hidden");
    this.card.classList.add("hidden");
    return open;
  }

  /** Which chapter the player is up to, for opening the screen on it. */
  static chapterOf(stage: number): number {
    return chapterIndexFor(Math.min(stage, TOTAL_STAGES));
  }

}

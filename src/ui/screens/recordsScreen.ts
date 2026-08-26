import { TOTAL_STAGES, chapterFor } from "../../content/chapters";
import { el, starLine } from "../dom";
import { totalStars } from "../storage";
import type { Progress } from "../storage";

/** Personal bests: mode high scores, and the star earned on every stage. */
export class RecordsScreen {
  private readonly timeAttack = el<HTMLElement>("record-timeattack");
  private readonly endless = el<HTMLElement>("record-endless");
  private readonly stars = el<HTMLElement>("record-stars");
  private readonly list = el<HTMLOListElement>("stage-list");

  constructor(onBack: () => void) {
    el<HTMLButtonElement>("btn-records-back").addEventListener("click", onBack);
  }

  render(progress: Progress): void {
    this.timeAttack.textContent = progress.bestTimeAttack.toLocaleString();
    this.endless.textContent = progress.bestEndless.toLocaleString();
    this.stars.textContent = `${totalStars(progress)} / ${TOTAL_STAGES * 3}`;

    const rows = Array.from({ length: TOTAL_STAGES }, (_, i) => {
      const stage = i + 1;
      const earned = progress.stageStars[i] ?? 0;
      const reached = stage <= progress.stage;

      const row = document.createElement("li");
      row.className = reached ? "stage-row" : "stage-row locked";

      const label = document.createElement("span");
      label.className = "stage-label";
      label.textContent = `${stage}`;

      const chapter = document.createElement("span");
      chapter.className = "stage-chapter";
      chapter.textContent = chapterFor(stage).title;

      const grade = document.createElement("span");
      grade.className = earned > 0 ? "stage-stars earned" : "stage-stars";
      grade.textContent = reached ? starLine(earned) : "잠김";

      row.append(label, chapter, grade);
      return row;
    });
    this.list.replaceChildren(...rows);
  }
}

import { TOTAL_STAGES, chapterFor } from "../../content/chapters";
import type { GameMode } from "../../core/types";
import { el } from "../dom";
import type { Progress } from "../storage";

/**
 * Mode picker, with whatever progress the player has made so far.
 *
 * The wordmark and the three modes are the whole screen. A strip of collected
 * pictures used to sit between them; it competed with the wordmark for the
 * same space and said nothing the gallery does not say better, so the room it
 * took went to the wordmark instead.
 */
export class TitleScreen {
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
  }
}

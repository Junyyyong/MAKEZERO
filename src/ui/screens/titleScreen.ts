import type { GameMode } from "../../core/types";
import { el } from "../dom";
import type { Progress } from "../storage";

/**
 * Mode picker, with whatever progress the player has made so far.
 *
 * The wordmark and the two modes are the whole screen. A strip of collected
 * pictures used to sit between them; it competed with the wordmark for the
 * same space, so the room it took went to the wordmark instead.
 */
export class TitleScreen {
  constructor(onPick: (mode: GameMode) => void, onRules: () => void, onSettings: () => void) {
    for (const mode of ["timeAttack", "endless"] as const) {
      el<HTMLButtonElement>(`mode-${mode}`).addEventListener("click", () => onPick(mode));
    }
    el<HTMLButtonElement>("btn-title-rules").addEventListener("click", onRules);
    el<HTMLButtonElement>("btn-title-settings").addEventListener("click", onSettings);
  }

  render(progress: Progress): void {
    el("desc-timeAttack").textContent = progress.bestTimeAttack
      ? `60 seconds · best ${progress.bestTimeAttack}`
      : "60 seconds";
    el("desc-endless").textContent = progress.bestEndless
      ? `Best ${progress.bestEndless}`
      : "Play until the board fills";
  }
}

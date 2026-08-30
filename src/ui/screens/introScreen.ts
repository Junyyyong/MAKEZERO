import { el, formatClock } from "../dom";
import type { Progress } from "../storage";
import type { GameMode } from "../../core/types";

/**
 * What a mode is, before it starts.
 *
 * Time attack and endless used to begin the instant they were tapped, which
 * gave the player no moment to see what they were about to be measured on.
 * One screen each: the name, the number that defines it, and the records to
 * beat.
 */
export class IntroScreen {
  private readonly title = el<HTMLHeadingElement>("intro-title");
  private readonly mark = el<HTMLDivElement>("intro-mark");
  private readonly note = el<HTMLParagraphElement>("intro-note");
  private readonly stats = el<HTMLElement>("intro-stats");
  private mode: GameMode = "timeAttack";

  constructor(onStart: (mode: GameMode) => void, onBack: () => void) {
    el<HTMLButtonElement>("btn-intro-back").addEventListener("click", onBack);
    el<HTMLButtonElement>("btn-intro-start").addEventListener("click", () => onStart(this.mode));
  }

  render(mode: GameMode, progress: Progress, bestEndlessTime: number): void {
    this.mode = mode;
    const timed = mode === "timeAttack";
    this.title.textContent = timed ? "TIME ATTACK" : "ENDLESS";
    this.mark.textContent = timed ? "60" : "∞";
    this.mark.classList.toggle("endless", !timed);
    this.note.textContent = timed
      ? "Clear as much as you can in 60 seconds"
      : "Blocks keep coming. It ends when the board fills";

    const rows: [string, string][] = timed
      ? [["BEST SCORE", progress.bestTimeAttack.toLocaleString()]]
      : [
          ["BEST SCORE", progress.bestEndless.toLocaleString()],
          ["BEST TIME", bestEndlessTime === 0 ? "--:--" : formatClock(bestEndlessTime)],
        ];

    this.stats.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const name = document.createElement("dt");
        name.textContent = label;
        const number = document.createElement("dd");
        number.textContent = value;
        return [name, number];
      }),
    );
  }
}

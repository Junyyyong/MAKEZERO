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
const TITLES: Partial<Record<GameMode, string>> = {
  timeAttack: "TIME ATTACK",
  endless: "ENDLESS",
  timeless: "TIMELESS",
};

const NOTES: Partial<Record<GameMode, string>> = {
  timeAttack: "Clear as much as you can in 60 seconds",
  endless: "Blocks keep coming. It ends when the board fills",
  timeless: "Take 2 to 5 blocks that make 10, 20 or 30. Clear them all",
};

export class IntroScreen {
  private readonly title = el<HTMLHeadingElement>("intro-title");
  private readonly mark = el<HTMLDivElement>("intro-mark");
  private readonly markLabel = el<HTMLSpanElement>("intro-mark-label");
  private readonly note = el<HTMLParagraphElement>("intro-note");
  private readonly stats = el<HTMLElement>("intro-stats");
  private mode: GameMode = "timeAttack";

  constructor(onStart: (mode: GameMode) => void, onBack: () => void) {
    el<HTMLButtonElement>("btn-intro-back").addEventListener("click", onBack);
    el<HTMLButtonElement>("btn-intro-start").addEventListener("click", () => onStart(this.mode));
  }

  render(mode: GameMode, progress: Progress, bestEndlessTime: number): void {
    this.mode = mode;
    this.title.textContent = TITLES[mode] ?? "ENDLESS";
    /*
     * The one thing that says what the mode is.
     *
     * Both of the timed ones show it on a stopwatch face: sixty for the run
     * that is over in a minute, and the sign for forever on the one with no
     * clock at all. Endless is the sign on its own — its clock counts up
     * rather than down, and nothing is being measured against it.
     */
    this.markLabel.textContent = mode === "timeAttack" ? "60" : "∞";
    this.markLabel.classList.toggle("forever", mode === "timeless");
    this.mark.classList.toggle("endless", mode === "endless");
    this.note.textContent = NOTES[mode] ?? "";

    const rows: [string, string][] =
      mode === "timeAttack"
        ? [["BEST SCORE", progress.bestTimeAttack.toLocaleString()]]
        : mode === "timeless"
          ? [
              ["BEST SCORE", progress.bestTimeless.toLocaleString()],
              ["FEWEST LEFT", progress.fewestLeft < 0 ? "--" : String(progress.fewestLeft)],
            ]
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

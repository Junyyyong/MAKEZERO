import { el } from "../dom";

/**
 * The beat between the last move and the results panel.
 *
 * A run used to end straight into a panel of numbers, which reads as being
 * marked rather than as having finished something. One word, held for a
 * moment, and the panel arrives after it.
 *
 * The artwork is optional on purpose. Set `CHEER_ART` to a file in `public/`
 * and it plays behind the word; with nothing there the word carries the
 * moment on its own, so the game is never waiting on an asset to look right.
 */
const CHEER_ART: string | null = null;

/** How long the word holds before the panel. Long enough to read, no longer. */
export const CHEER_MS = 1400;

export class Cheer {
  private readonly root = el<HTMLDivElement>("cheer");
  private readonly word = el<HTMLDivElement>("cheer-word");
  private readonly art = el<HTMLImageElement>("cheer-art");
  private timer: number | undefined;

  constructor() {
    if (CHEER_ART) {
      this.art.src = CHEER_ART;
      this.art.classList.remove("hidden");
    }
  }

  /** Plays the flourish, then calls `then`. */
  play(text: string, then: () => void): void {
    this.word.textContent = text;
    this.root.classList.remove("hidden");
    // Restarting the animation needs the class off for a frame, or a second
    // run in the same session shows the end state and never moves.
    this.root.classList.remove("cheer-run");
    void this.root.offsetWidth;
    this.root.classList.add("cheer-run");
    // An animated image restarts by being re-pointed at its own source.
    if (CHEER_ART) this.art.src = CHEER_ART;

    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.root.classList.add("hidden");
      then();
    }, CHEER_MS);
  }

  /** Takes it off screen at once — for a run left before it finished. */
  stop(): void {
    window.clearTimeout(this.timer);
    this.root.classList.add("hidden");
  }
}

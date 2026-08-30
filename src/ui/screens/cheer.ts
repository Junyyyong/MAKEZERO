import { el } from "../dom";

/**
 * The beat between the last move and the results panel.
 *
 * A run used to end straight into a panel of numbers, which reads as being
 * marked rather than as having finished something. The board dims, one word
 * lands over it, a character dances, and the panel arrives after.
 *
 * The clips are optional. With `CHEER_CLIPS` empty the word carries the moment
 * on its own and holds for `WORD_ONLY_MS`, so the game never waits on an asset
 * to look right. See docs/CONTENT.md for what to hand over.
 */
const CHEER_CLIPS: readonly string[] = [];

/** How long the word holds when there is no clip. Long enough to read. */
const WORD_ONLY_MS = 1400;

/**
 * The longest a clip is ever allowed to hold the game.
 *
 * A video that fails to decode, or one the browser silently refuses to start,
 * would otherwise leave the player looking at a dimmed board with no way
 * forward. The clip normally ends the moment itself; this only ever fires
 * when something has gone wrong.
 */
const CLIP_CAP_MS = 8000;

export class Cheer {
  private readonly root = el<HTMLDivElement>("cheer");
  private readonly word = el<HTMLDivElement>("cheer-word");
  private readonly clip = el<HTMLVideoElement>("cheer-clip");
  private timer: number | undefined;
  /** Guards against the clip ending and the cap firing for the same play. */
  private done: (() => void) | undefined;

  constructor() {
    this.clip.addEventListener("ended", () => this.finish());
    this.clip.addEventListener("error", () => this.finish());
  }

  /** Plays the flourish, then calls `then` — once, whichever way it ends. */
  play(text: string, then: () => void): void {
    this.word.textContent = text;
    this.done = then;

    this.root.classList.remove("hidden");
    // Restarting the animation needs the class off for a frame, or a second
    // run in the same session shows the end state and never moves.
    this.root.classList.remove("cheer-run");
    void this.root.offsetWidth;
    this.root.classList.add("cheer-run");

    const src = CHEER_CLIPS.length
      ? CHEER_CLIPS[Math.floor(Math.random() * CHEER_CLIPS.length)]!
      : null;

    window.clearTimeout(this.timer);
    if (!src) {
      this.clip.classList.add("hidden");
      this.timer = window.setTimeout(() => this.finish(), WORD_ONLY_MS);
      return;
    }

    this.clip.classList.remove("hidden");
    this.clip.src = src;
    this.clip.currentTime = 0;
    // Muted and inline, so this is allowed without a gesture; a refusal still
    // lands on `finish` rather than stalling the run.
    void this.clip.play().catch(() => this.finish());
    this.timer = window.setTimeout(() => this.finish(), CLIP_CAP_MS);
  }

  /** Takes it off screen at once — for a run left before it finished. */
  stop(): void {
    window.clearTimeout(this.timer);
    this.done = undefined;
    this.clip.pause();
    this.root.classList.add("hidden");
  }

  private finish(): void {
    const then = this.done;
    if (!then) return;
    this.done = undefined;
    window.clearTimeout(this.timer);
    this.clip.pause();
    this.root.classList.add("hidden");
    then();
  }
}

import { el } from "../dom";

/**
 * The beat between the last move and the results panel.
 *
 * A run used to end straight into a panel of numbers, which reads as being
 * marked rather than as having finished something. It ends in two beats now.
 * First the board dims and says what happened and what it was worth, in one
 * big number, for a few seconds. Then a word lands and a character dances,
 * holding on the last frame until the player taps — so the moment ends when
 * they are done with it rather than on a timer.
 *
 * The clips are optional. With `CHEER_CLIPS` empty the word carries the moment
 * on its own and holds for `WORD_ONLY_MS`, so the game never waits on an asset
 * to look right. See docs/CONTENT.md for what to hand over.
 */
interface Clip {
  /** The picture, muted. VP9-with-alpha in a WebM. */
  video: string;
  /** The same picture as HEVC-with-alpha, for Apple's engine. Optional. */
  hevc?: string;
  /** Its soundtrack, the same length. Optional. */
  sound?: string;
}

const CHEER_CLIPS: readonly Clip[] = [
  { video: "./movie/3.webm", hevc: "./movie/3-hevc.mp4", sound: "./movie/3.mp3" },
];

/**
 * Whether to hand this browser the HEVC copy instead of the WebM.
 *
 * There is no one video format that is transparent everywhere. Chromium and
 * Firefox read the alpha channel out of VP9-in-WebM and nothing else; Apple's
 * engine reads it out of HEVC-in-MP4 and nothing else. Safari will happily
 * *play* the WebM — iOS 17.4 added it — it just throws the transparency away
 * and paints the picture on white, which is what put a white card behind the
 * dancer on the iPhone.
 *
 * So this cannot be a feature test: both engines say yes to the file that
 * looks wrong on them. It asks which engine it is instead. Chromium on some
 * Android hardware plays HEVC too, and it is the one that wants the WebM, so
 * it is named and excluded — iOS Chrome, which is Apple's engine wearing a
 * different badge, says `CriOS` and is not caught by that.
 */
const WANTS_HEVC = ((): boolean => {
  if (typeof document === "undefined") return false;
  if (!document.createElement("video").canPlayType('video/mp4; codecs="hvc1"')) return false;
  return !/Chrom(e|ium)|Android/i.test(navigator.userAgent);
})();

/**
 * Four milliseconds of nothing, as a file.
 *
 * iOS will not let a page start an `<audio>` element from a timer — and the
 * clip's soundtrack starts from one, four seconds after the run ended, long
 * past any touch. What it will allow is an element that has already been
 * played once inside a real touch: after that the element stays permitted for
 * the rest of the session, swapping `src` included. So the first touch
 * anywhere plays this, which is silence at 8kHz and inaudible by
 * construction, and the soundtrack is allowed when its turn comes.
 */
const SILENCE =
  "data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

/** How long the score card holds before the dance. */
const CARD_MS = 4000;

/** How long the word holds when there is no clip. Long enough to read. */
const WORD_ONLY_MS = 1400;

/**
 * The longest a clip is allowed to run before the tap prompt appears anyway.
 *
 * A video that fails to decode, or one the browser silently refuses to start,
 * would otherwise leave the player looking at a dimmed board with nothing to
 * tap. The clip normally reaches its own end well before this.
 */
const CLIP_CAP_MS = 15000;

/**
 * Plays a file from its first frame, whether or not it is the one already
 * loaded.
 *
 * Rewinding is one of two different things depending on that: a new `src`
 * starts at zero on its own, while the same file over again has to be told.
 * The old code did both at once — assign, then set `currentTime` — and Safari
 * throws on a seek into a file it has not read the header of yet, which took
 * the whole flourish down with it.
 */
function start(media: HTMLMediaElement, src: string): Promise<void> {
  const url = new URL(src, location.href).href;
  if (media.src === url) media.currentTime = 0;
  else media.src = url;
  return media.play();
}

export class Cheer {
  private readonly root = el<HTMLDivElement>("cheer");
  private readonly word = el<HTMLDivElement>("cheer-word");
  private readonly clip = el<HTMLVideoElement>("cheer-clip");
  private readonly card = el<HTMLDivElement>("cheer-card");
  private readonly headline = el<HTMLParagraphElement>("cheer-headline");
  private readonly scoreEl = el<HTMLParagraphElement>("cheer-score");
  private readonly sound = el<HTMLAudioElement>("cheer-sound");
  private timer: number | undefined;
  private soundOn = true;
  /** Whether the sound element has been played inside a touch yet. */
  private primed = false;
  /** Guards against the clip ending and the cap firing for the same play. */
  private done: (() => void) | undefined;

  constructor() {
    // The clip stops on its own last frame; the player decides when to leave it.
    this.clip.addEventListener("ended", () => this.hold());
    this.clip.addEventListener("error", () => this.finish());
    this.root.addEventListener("pointerdown", () => this.finish());
  }

  /**
   * Lets the soundtrack play later, by playing silence now.
   *
   * Called from the first touch anywhere and a no-op after it works. A
   * refusal leaves it unprimed so the next touch tries again; the picture
   * plays either way, muted, which every browser allows unprompted.
   *
   * Note this cannot beat the iPhone's hardware silent switch: that mutes
   * `<audio>` and `<video>` whatever the page does. Only a native audio
   * session set to playback overrides it, which is the Capacitor shell's job,
   * not the web layer's.
   */
  unlock(): void {
    if (this.primed) return;
    this.primed = true;
    this.sound.src = SILENCE;
    const started = this.sound.play() as Promise<void> | undefined;
    void started
      ?.then(() => this.sound.pause())
      .catch(() => {
        this.primed = false;
      });
  }

  /**
   * Plays the flourish, then calls `then` — once, whichever way it ends.
   *
   * `headline` is what ended the run and `score` what it was worth; they hold
   * the screen on their own before the dance begins.
   */
  play(headline: string, score: number, text: string, then: () => void): void {
    this.word.textContent = text;
    this.headline.textContent = headline;
    this.scoreEl.textContent = score.toLocaleString();
    this.done = then;

    this.root.classList.remove("hidden", "cheer-hold", "cheer-run");
    this.card.classList.remove("hidden");

    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.dance(), CARD_MS);
  }

  /** Second beat: the word and the dance. */
  private dance(): void {
    if (!this.done) return;
    this.card.classList.add("hidden");
    // Restarting the animation needs the class off for a frame, or a second
    // run in the same session shows the end state and never moves.
    this.root.classList.remove("cheer-run");
    void this.root.offsetWidth;
    this.root.classList.add("cheer-run");

    const pick = CHEER_CLIPS.length
      ? CHEER_CLIPS[Math.floor(Math.random() * CHEER_CLIPS.length)]!
      : null;

    window.clearTimeout(this.timer);
    if (!pick) {
      this.clip.classList.add("hidden");
      this.timer = window.setTimeout(() => this.finish(), WORD_ONLY_MS);
      return;
    }

    this.clip.classList.remove("hidden");
    // Muted and inline, so this is allowed without a gesture; a refusal still
    // lands on `finish` rather than stalling the run.
    void start(this.clip, WANTS_HEVC && pick.hevc ? pick.hevc : pick.video).catch(() =>
      this.finish(),
    );

    // The two tracks are the same length and both start here, which is as
    // close to in step as two elements get. Sound is a courtesy: if it will
    // not play, the picture carries on regardless.
    if (pick.sound && this.soundOn) {
      void start(this.sound, pick.sound).catch(() => undefined);
    }

    this.timer = window.setTimeout(() => this.hold(), CLIP_CAP_MS);
  }

  /**
   * The clip has played out. It stays on its last frame — a paused video keeps
   * showing it — and the screen starts taking taps.
   */
  private hold(): void {
    if (!this.done) return;
    window.clearTimeout(this.timer);
    this.sound.pause();
    this.root.classList.add("cheer-hold");
  }

  /** Takes it off screen at once — for a run left before it finished. */
  stop(): void {
    window.clearTimeout(this.timer);
    this.done = undefined;
    this.hush();
    this.root.classList.add("hidden");
    this.root.classList.remove("cheer-hold");
    this.card.classList.remove("hidden");
  }

  /** Follows the sound switch in settings; the picture always plays. */
  setSound(on: boolean): void {
    this.soundOn = on;
    if (!on) this.sound.pause();
  }

  private hush(): void {
    this.clip.pause();
    this.sound.pause();
  }

  private finish(): void {
    const then = this.done;
    if (!then) return;
    this.done = undefined;
    window.clearTimeout(this.timer);
    this.hush();
    this.root.classList.add("hidden");
    this.root.classList.remove("cheer-hold");
    then();
  }
}

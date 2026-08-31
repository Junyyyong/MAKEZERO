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
export interface Clip {
  /** The picture, muted. VP9-with-alpha in a WebM. */
  video: string;
  /** The same picture as HEVC-with-alpha, for Apple's engine. Optional. */
  hevc?: string;
  /** Its soundtrack, the same length. Optional. */
  sound?: string;
}

/** One numbered set of files: WebM, HEVC and soundtrack, all the same length. */
function clip(n: number): Clip {
  return {
    video: `./movie/${n}.webm`,
    hevc: `./movie/${n}-hevc.mp4`,
    sound: `./movie/${n}.mp3`,
  };
}

/**
 * Which dance a run has earned.
 *
 * A dance that plays every time stops meaning anything, so the clips are
 * rationed by score: a first attempt and a best-ever run do not get the same
 * one, and the later ones only exist for people who get there. Highest band
 * first — the first one the score clears is the one that plays. A band may
 * hold several and then it draws one at random.
 */
const CLIP_TIERS: readonly { readonly at: number; readonly clips: readonly Clip[] }[] = [
  { at: 1000, clips: [clip(2)] },
  { at: 500, clips: [clip(4)] },
  { at: 200, clips: [clip(3)] },
  { at: 0, clips: [clip(1)] },
];

/**
 * What the flourish says.
 *
 * A run that went well should not be congratulated in the same words as one
 * that ended on the first minute. These bands are not quite the clips' bands —
 * the words also change at 50, where the clip does not — and there is no reason
 * a new dance and a new word have to arrive together.
 *
 * They can be any length. The word is fitted to the screen when it is set, so
 * a long one is simply drawn smaller rather than running off the edges.
 */
const WORD_TIERS: readonly { readonly at: number; readonly word: string }[] = [
  { at: 1000, word: "UNBELIEVABLE!!" },
  { at: 500, word: "AMAZING!" },
  { at: 200, word: "GREAT!" },
  { at: 50, word: "NICE!" },
  { at: 0, word: "GOOD TRY!" },
];

/** The lowest score of the highest band, whichever ladder is asked. */
function bandFor<T extends { at: number }>(tiers: readonly T[], score: number): T {
  return tiers.find((tier) => score >= tier.at) ?? tiers[tiers.length - 1]!;
}

/** Which clips a run worth this much may draw from. */
export function poolFor(score: number): readonly Clip[] {
  return bandFor(CLIP_TIERS, score).clips;
}

/** What to shout for a run worth this much. */
export function cheerFor(score: number): string {
  return bandFor(WORD_TIERS, score).word;
}

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

/** The word's own side padding, in px — it may not be drawn into that. */
const WORD_MARGIN = 14;

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
  load(media, src);
  return media.play();
}

/** Points an element at a file, rewinding it if it is already the one loaded. */
function load(media: HTMLMediaElement, src: string): void {
  const url = new URL(src, location.href).href;
  if (media.src === url) media.currentTime = 0;
  else media.src = url;
}

/** Which of a clip's two copies this browser should be given. */
function sourceFor(clip: Clip): string {
  return WANTS_HEVC && clip.hevc ? clip.hevc : clip.video;
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
  /** The clip chosen for this run, picked early so it can start loading. */
  private pick: Clip | null = null;
  /** Which run this is, so a late event from the last one is ignored. */
  private run = 0;

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
   * the screen on their own before the dance begins. The score also decides
   * both what the word says and which clips it can draw from.
   */
  play(headline: string, score: number, then: () => void): void {
    this.word.textContent = cheerFor(score);
    this.headline.textContent = headline;
    this.scoreEl.textContent = score.toLocaleString();
    this.done = then;
    this.run += 1;

    this.root.classList.remove("hidden", "cheer-hold", "cheer-run");
    this.card.classList.remove("hidden");
    // Once it is on screen and can be measured, and before it is ever shown:
    // the card holds for four seconds with the word hidden behind it.
    this.fitWord();

    /*
     * Choose the clip now, four seconds before it plays, and put its file on
     * the wire while the card holds the screen.
     *
     * The HEVC copy is 3.9MB against the WebM's 1.2MB, and asking for it at
     * the moment it is meant to start meant the picture came up late while
     * the soundtrack — a tenth the size — was already running. Four seconds
     * of card is four seconds of head start, which is more than enough.
     */
    const pool = poolFor(score);
    this.pick = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : null;
    if (this.pick) {
      load(this.clip, sourceFor(this.pick));
      // The song gets the same head start, so it can be seeked into position
      // the instant the picture starts rather than read from scratch then.
      if (this.pick.sound) load(this.sound, this.pick.sound);
    }

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

    const pick = this.pick;

    window.clearTimeout(this.timer);
    if (!pick) {
      this.clip.classList.add("hidden");
      this.timer = window.setTimeout(() => this.finish(), WORD_ONLY_MS);
      return;
    }

    this.clip.classList.remove("hidden");

    /*
     * The soundtrack starts when the picture does, not when the picture is
     * asked to.
     *
     * Starting both in the same breath only looks synchronised if both begin
     * at once, and a 3.9MB video does not begin as promptly as an 84KB song.
     * `playing` fires on the video's first painted frame, whether that is
     * immediately or after a wait, so hanging the sound off it keeps the two
     * in step however slow the file is. Sound is a courtesy either way: if it
     * will not play, the picture carries on regardless.
     */
    const run = this.run;
    const song = pick.sound;
    if (song && this.soundOn) {
      this.clip.addEventListener(
        "playing",
        () => {
          if (this.run !== run || !this.soundOn) return;
          load(this.sound, song);
          // Dropped in where the picture already is, not started from the top.
          // Handling the event costs a tenth of a second, which is enough to
          // hear as the song trailing the dance.
          this.sound.currentTime = this.clip.currentTime;
          void this.sound.play().catch(() => undefined);
        },
        { once: true },
      );
    }

    // Muted and inline, so this is allowed without a gesture; a refusal still
    // lands on `finish` rather than stalling the run.
    void start(this.clip, sourceFor(pick)).catch(() => this.finish());

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

  /**
   * Shrinks the word until it fits across the screen.
   *
   * The size is set for a short word and a long one would run off both edges —
   * `UNBELIEVABLE!!` is half again as wide as `GOOD TRY!`. Rather than pick a
   * size that suits the longest word and leaves the short ones looking timid,
   * this measures what was actually drawn and scales only what needs it. It
   * works for whatever the words become, in whatever font, without anyone
   * having to know how wide a letter is.
   */
  private fitWord(): void {
    this.word.style.fontSize = "";
    const room = this.root.clientWidth - WORD_MARGIN * 2;
    if (room <= 0) return;
    const range = document.createRange();
    range.selectNodeContents(this.word);
    const drawn = range.getBoundingClientRect().width;
    if (drawn <= room) return;
    const size = parseFloat(getComputedStyle(this.word).fontSize);
    this.word.style.fontSize = `${Math.floor((size * room) / drawn)}px`;
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

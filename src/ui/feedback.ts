/**
 * Sound and vibration.
 *
 * Every sound is synthesised on the spot rather than loaded from a file. A
 * puzzle game makes a handful of short, tonal noises — a click, a chime, a
 * buzz — and those are cheaper to describe than to download: the whole set
 * below weighs nothing, needs no decode, and never arrives late on a phone
 * with a bad connection.
 *
 * Both channels are off until the player touches the screen, because a
 * browser will not let a page make noise before that, and both are opt-out
 * through settings.
 */

/** The pentatonic run a combo climbs. Any two of these sound right together. */
const LADDER = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

type Shape = "sine" | "triangle" | "square";

interface Blip {
  /** Hz at the start, and at the end if it slides. */
  from: number;
  to?: number;
  ms: number;
  gain: number;
  shape: Shape;
  /** Seconds to wait before this one sounds, for chords and arpeggios. */
  delay?: number;
}

export class Feedback {
  private ctx: AudioContext | undefined;
  private bus: GainNode | undefined;
  private soundOn = true;
  private hapticsOn = true;
  /** How far up the ladder the current run of clears has climbed. */
  private step = 0;

  /**
   * Wakes the audio hardware on the first touch.
   *
   * A page cannot open an AudioContext before the player has interacted with
   * it — one created earlier starts suspended and stays silent — so this is
   * called from the first pointer down and does nothing after that.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0.5;
      this.bus.connect(this.ctx.destination);
    } catch {
      // No audio on this device. Everything else still works.
    }
  }

  setSound(on: boolean): void {
    this.soundOn = on;
  }

  setHaptics(on: boolean): void {
    this.hapticsOn = on;
  }

  private play(blips: readonly Blip[]): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!this.soundOn || !ctx || !bus || ctx.state !== "running") return;

    for (const blip of blips) {
      const at = ctx.currentTime + (blip.delay ?? 0);
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = blip.shape;
      osc.frequency.setValueAtTime(blip.from, at);
      if (blip.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(blip.to, at + blip.ms / 1000);
      }
      // A short attack keeps the click out of the note; the tail is a curve
      // rather than a step, or every sound ends in a pop.
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(blip.gain, at + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, at + blip.ms / 1000);
      osc.connect(env);
      env.connect(bus);
      osc.start(at);
      osc.stop(at + blip.ms / 1000 + 0.02);
    }
  }

  private buzz(pattern: number | readonly number[]): void {
    if (!this.hapticsOn) return;
    // Not every device has a motor, and a browser may refuse outright.
    try {
      navigator.vibrate?.(pattern as number | number[]);
    } catch {
      // Nothing to do — the sound already carried the message.
    }
  }

  // ---- the sounds --------------------------------------------------------

  /**
   * A block joining the selection.
   *
   * The pitch rises with how many are held, so a sweep across the board
   * sounds like it is building toward something — which it is.
   */
  pick(held: number): void {
    const note = LADDER[Math.min(held, LADDER.length) - 1] ?? LADDER[0]!;
    this.play([{ from: note, ms: 90, gain: 0.16, shape: "triangle" }]);
    this.buzz(8);
  }

  /** A selection that made ten. Climbs a step for each clear in a row. */
  clear(size: number): void {
    this.step = Math.min(this.step + 1, LADDER.length - 3);
    const root = LADDER[this.step]!;
    this.play([
      { from: root, ms: 160, gain: 0.2, shape: "triangle" },
      { from: root * 1.26, ms: 170, gain: 0.16, shape: "triangle", delay: 0.055 },
      { from: root * 1.5, ms: 220, gain: 0.14, shape: "sine", delay: 0.11 },
      // Bigger groups are worth more, and get one more note to say so.
      ...(size >= 4 ? [{ from: root * 2, ms: 260, gain: 0.12, shape: "sine" as Shape, delay: 0.165 }] : []),
    ]);
    this.buzz(size >= 4 ? [12, 40, 18] : 14);
  }

  /** A selection that did not make ten. Down, not up. */
  reject(): void {
    this.step = 0;
    this.play([
      { from: 196, to: 130.81, ms: 240, gain: 0.2, shape: "square" },
      { from: 98, ms: 260, gain: 0.1, shape: "triangle", delay: 0.02 },
    ]);
    // Two short knocks: unmistakably "no", without the long angry hum a
    // single long pulse gives.
    this.buzz([30, 60, 30]);
  }

  /** The run of clears is over — a move was thrown away, or the stage ended. */
  resetCombo(): void {
    this.step = 0;
  }

  /** Anything the player deliberately pressed. */
  tap(): void {
    this.play([{ from: 660, to: 880, ms: 70, gain: 0.12, shape: "sine" }]);
    this.buzz(6);
  }

  /** An item used: hint, undo, split. */
  item(): void {
    this.play([
      { from: 880, ms: 90, gain: 0.14, shape: "sine" },
      { from: 1174.66, ms: 130, gain: 0.12, shape: "sine", delay: 0.06 },
    ]);
    this.buzz(10);
  }

  /** The board is empty and the picture is whole. */
  complete(): void {
    this.step = 0;
    const root = 523.25;
    this.play([
      { from: root, ms: 200, gain: 0.2, shape: "triangle" },
      { from: root * 1.25, ms: 200, gain: 0.19, shape: "triangle", delay: 0.12 },
      { from: root * 1.5, ms: 240, gain: 0.18, shape: "triangle", delay: 0.24 },
      { from: root * 2, ms: 620, gain: 0.2, shape: "sine", delay: 0.36 },
      { from: root * 3, ms: 620, gain: 0.09, shape: "sine", delay: 0.36 },
    ]);
    this.buzz([16, 70, 16, 70, 30]);
  }

  /** The run ended without the board being cleared. */
  fail(): void {
    this.step = 0;
    this.play([
      { from: 392, ms: 240, gain: 0.18, shape: "triangle" },
      { from: 311.13, ms: 300, gain: 0.17, shape: "triangle", delay: 0.16 },
      { from: 233.08, ms: 520, gain: 0.16, shape: "sine", delay: 0.32 },
    ]);
    this.buzz([40, 80, 40]);
  }
}

/**
 * The one sound bus.
 *
 * There is only ever one audio output and one motor, and the tutorial board
 * has to sound exactly like the real one, so this is shared rather than
 * threaded through every constructor between here and there.
 */
export const feedback = new Feedback();

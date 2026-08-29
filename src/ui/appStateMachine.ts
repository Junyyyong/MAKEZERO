/** Every distinct app flow, including modal states that sit over the game. */
export type AppState =
  | "splash"
  | "mainMenu"
  | "tutorial"
  | "inGame"
  | "paused"
  | "result"
  | "story"
  | "gallery"
  | "settings"
  | "chapters"
  | "stages"
  | "intro";

const ALLOWED: Readonly<Record<AppState, readonly AppState[]>> = {
  splash: ["mainMenu"],
  mainMenu: ["tutorial", "inGame", "gallery", "settings", "chapters", "intro"],
  // Picking where to play. Story goes through the chapter list and the stage
  // grid; the timed modes get one start screen each. Nothing here starts a
  // run except the last step, so backing out is always the way it came.
  chapters: ["mainMenu", "stages"],
  stages: ["chapters", "mainMenu", "inGame"],
  intro: ["mainMenu", "inGame"],
  tutorial: ["mainMenu"],
  inGame: ["paused", "result", "mainMenu", "stages"],
  paused: ["inGame", "mainMenu"],
  // The results panel offers the gallery, because the picture it just
  // handed over is in there.
  result: ["inGame", "mainMenu", "story", "gallery", "stages"],
  story: ["inGame", "mainMenu", "result"],
  gallery: ["mainMenu"],
  // Settings is a screen now, and the tutorial is reachable from it.
  settings: ["mainMenu", "tutorial"],
};

/**
 * Guards the app flow. UI code may request a transition, but cannot silently
 * jump between unrelated states and leave clocks or input running behind it.
 */
export class AppStateMachine {
  constructor(private active: AppState = "splash") {}

  get current(): AppState {
    return this.active;
  }

  canEnter(next: AppState): boolean {
    return next === this.active || ALLOWED[this.active].includes(next);
  }

  enter(next: AppState): { from: AppState; to: AppState } {
    const from = this.active;
    if (!this.canEnter(next)) throw new Error(`Invalid app transition: ${from} -> ${next}`);
    this.active = next;
    return { from, to: next };
  }
}

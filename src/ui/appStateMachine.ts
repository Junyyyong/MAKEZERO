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
  | "settings";

const ALLOWED: Readonly<Record<AppState, readonly AppState[]>> = {
  splash: ["mainMenu"],
  mainMenu: ["tutorial", "inGame", "gallery", "settings"],
  tutorial: ["mainMenu"],
  inGame: ["paused", "result", "mainMenu"],
  paused: ["inGame", "mainMenu"],
  result: ["inGame", "mainMenu", "story"],
  story: ["inGame", "mainMenu", "result"],
  gallery: ["mainMenu"],
  settings: ["mainMenu"],
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

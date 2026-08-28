import { describe, expect, it } from "vitest";
import { AppStateMachine } from "./appStateMachine";

describe("AppStateMachine", () => {
  it("follows the normal launch, play, pause and result flow", () => {
    const machine = new AppStateMachine();
    machine.enter("mainMenu");
    machine.enter("inGame");
    machine.enter("paused");
    machine.enter("inGame");
    machine.enter("result");
    machine.enter("mainMenu");
    expect(machine.current).toBe("mainMenu");
  });

  it("lets the results panel open the gallery, and the gallery go home", () => {
    // The panel hands over a picture and offers to show it; refusing that
    // transition left the player looking at the finished board instead.
    const machine = new AppStateMachine();
    machine.enter("mainMenu");
    machine.enter("inGame");
    machine.enter("result");
    machine.enter("gallery");
    machine.enter("mainMenu");
    expect(machine.current).toBe("mainMenu");
  });

  it("walks story through the chapter list and the stage grid", () => {
    // Story no longer starts from the title screen: the picture behind a
    // stage is worth choosing, so a run begins at the end of a pick.
    const machine = new AppStateMachine();
    machine.enter("mainMenu");
    machine.enter("chapters");
    machine.enter("stages");
    machine.enter("inGame");
    machine.enter("result");
    machine.enter("stages");
    expect(machine.current).toBe("stages");
  });

  it("backs out of a picker the way it came in", () => {
    const machine = new AppStateMachine();
    machine.enter("mainMenu");
    machine.enter("chapters");
    machine.enter("stages");
    machine.enter("chapters");
    machine.enter("mainMenu");
    expect(machine.current).toBe("mainMenu");
  });

  it("gives the timed modes a start screen before the run", () => {
    const machine = new AppStateMachine();
    machine.enter("mainMenu");
    machine.enter("intro");
    machine.enter("inGame");
    expect(machine.current).toBe("inGame");
    // And the run replays from its own result panel, never back through here.
    machine.enter("result");
    expect(machine.canEnter("intro")).toBe(false);
  });

  it("rejects transitions that would skip required cleanup", () => {
    const machine = new AppStateMachine();
    expect(() => machine.enter("inGame")).toThrow(/splash -> inGame/);
  });
});

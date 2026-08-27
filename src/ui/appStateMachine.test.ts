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

  it("rejects transitions that would skip required cleanup", () => {
    const machine = new AppStateMachine();
    expect(() => machine.enter("inGame")).toThrow(/splash -> inGame/);
  });
});

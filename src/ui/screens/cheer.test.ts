import { describe, expect, it } from "vitest";
import { TOP_SCORE, cheerFor, poolFor } from "./cheer";

/*
 * The word and the clip are two halves of the same judgement: a run that is
 * told it was AMAZING is the run that earns the clip held back for it. These
 * check they cannot drift apart, and that the special clip stays special.
 */
describe("the end-of-run flourish", () => {
  it("says something different for each band", () => {
    expect(cheerFor(0)).toBe("GOOD TRY!");
    expect(cheerFor(49)).toBe("GOOD TRY!");
    expect(cheerFor(50)).toBe("NICE!");
    expect(cheerFor(199)).toBe("NICE!");
    expect(cheerFor(200)).toBe("GREAT!");
    expect(cheerFor(499)).toBe("GREAT!");
    expect(cheerFor(500)).toBe("AMAZING!");
    expect(cheerFor(12_000)).toBe("AMAZING!");
  });

  it("opens the kept-back clips at exactly the score that says AMAZING", () => {
    expect(cheerFor(TOP_SCORE)).toBe("AMAZING!");
    expect(cheerFor(TOP_SCORE - 1)).not.toBe("AMAZING!");
    expect(poolFor(TOP_SCORE)).not.toBe(poolFor(TOP_SCORE - 1));
  });

  it("keeps the top clip out of every ordinary run", () => {
    const top = poolFor(TOP_SCORE).map((clip) => clip.video);
    for (const score of [0, 49, 50, 199, 200, 499]) {
      for (const clip of poolFor(score)) expect(top).not.toContain(clip.video);
    }
  });

  it("gives every clip a soundtrack and a copy for Apple's engine", () => {
    for (const score of [0, TOP_SCORE]) {
      for (const clip of poolFor(score)) {
        expect(clip.video).toMatch(/\.webm$/);
        expect(clip.hevc).toMatch(/-hevc\.mp4$/);
        expect(clip.sound).toMatch(/\.mp3$/);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { cheerFor, poolFor } from "./cheer";

/** The clip a run of this score gets, by its number in `public/movie`. */
function clipNumber(score: number): string {
  const pool = poolFor(score);
  expect(pool).toHaveLength(1);
  return pool[0]!.video.replace("./movie/", "").replace(".webm", "");
}

describe("the end-of-run flourish", () => {
  it("hands out a different dance the further a run gets", () => {
    for (const score of [0, 1, 199]) expect(clipNumber(score)).toBe("1");
    for (const score of [200, 300, 499]) expect(clipNumber(score)).toBe("3");
    for (const score of [500, 800, 999]) expect(clipNumber(score)).toBe("4");
    for (const score of [1000, 5_000, 99_999]) expect(clipNumber(score)).toBe("2");
  });

  it("says something different for each band", () => {
    expect(cheerFor(0)).toBe("GOOD TRY!");
    expect(cheerFor(49)).toBe("GOOD TRY!");
    expect(cheerFor(50)).toBe("NICE!");
    expect(cheerFor(199)).toBe("NICE!");
    expect(cheerFor(200)).toBe("GREAT!");
    expect(cheerFor(499)).toBe("GREAT!");
    expect(cheerFor(500)).toBe("AMAZING!");
    expect(cheerFor(999)).toBe("AMAZING!");
    expect(cheerFor(1000)).toBe("UNBELIEVABLE!!");
    expect(cheerFor(12_000)).toBe("UNBELIEVABLE!!");
  });

  it("never leaves a run without a dance, however odd the score", () => {
    for (const score of [-1, 0, 0.5, Number.MAX_SAFE_INTEGER]) {
      expect(poolFor(score).length).toBeGreaterThan(0);
    }
  });

  it("gives every clip a soundtrack and a copy for Apple's engine", () => {
    for (const score of [0, 200, 500, 1000]) {
      for (const clip of poolFor(score)) {
        expect(clip.video).toMatch(/^\.\/movie\/\d+\.webm$/);
        expect(clip.hevc).toMatch(/^\.\/movie\/\d+-hevc\.mp4$/);
        expect(clip.sound).toMatch(/^\.\/movie\/\d+\.mp3$/);
      }
    }
  });
});

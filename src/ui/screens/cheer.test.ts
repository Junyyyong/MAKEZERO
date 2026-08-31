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
    for (const score of [0, 1, 299]) expect(clipNumber(score)).toBe("1");
    for (const score of [300, 400, 599]) expect(clipNumber(score)).toBe("3");
    for (const score of [600, 800, 999]) expect(clipNumber(score)).toBe("4");
    for (const score of [1000, 1200, 1399]) expect(clipNumber(score)).toBe("2");
    for (const score of [1400, 5_000, 99_999]) expect(clipNumber(score)).toBe("5");
  });

  it("says something different for each band", () => {
    expect(cheerFor(0)).toBe("GOOD TRY!");
    expect(cheerFor(299)).toBe("GOOD TRY!");
    expect(cheerFor(300)).toBe("GREAT!");
    expect(cheerFor(599)).toBe("GREAT!");
    expect(cheerFor(600)).toBe("AMAZING!");
    expect(cheerFor(999)).toBe("AMAZING!");
    expect(cheerFor(1000)).toBe("UNBELIEVABLE!!");
    expect(cheerFor(1399)).toBe("UNBELIEVABLE!!");
    expect(cheerFor(1400)).toBe("OH MY GOD~!");
    expect(cheerFor(12_000)).toBe("OH MY GOD~!");
  });

  it("changes the word and the dance at the very same score", () => {
    for (const edge of [300, 600, 1000, 1400]) {
      expect(cheerFor(edge)).not.toBe(cheerFor(edge - 1));
      expect(clipNumber(edge)).not.toBe(clipNumber(edge - 1));
    }
  });

  it("never leaves a run without a dance, however odd the score", () => {
    for (const score of [-1, 0, 0.5, Number.MAX_SAFE_INTEGER]) {
      expect(poolFor(score).length).toBeGreaterThan(0);
    }
  });

  it("gives every clip a soundtrack and a copy for Apple's engine", () => {
    for (const score of [0, 300, 600, 1000, 1400]) {
      for (const clip of poolFor(score)) {
        expect(clip.video).toMatch(/^\.\/movie\/\d+\.webm$/);
        expect(clip.hevc).toMatch(/^\.\/movie\/\d+-hevc\.mp4$/);
        expect(clip.sound).toMatch(/^\.\/movie\/\d+\.mp3$/);
      }
    }
  });
});

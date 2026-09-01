import { describe, expect, it } from "vitest";
import { CHEER_BANDS, TIMELESS_PACE_MS, bandAt, cheerFor, poolFor, timelessBand } from "./cheer";

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

  /*
   * TIMELESS does not grade on points. A careful line made of tens finishes
   * near 520 and a greedy one made of twenties and thirties near 2,800, so on
   * the scored ladder the tidy clear came out below a run that stranded six
   * blocks. It is graded on the clock, and an unfinished board is the bottom
   * whatever else happened.
   */
  describe("grading TIMELESS on the clock", () => {
    const m = (minutes: number) => minutes * 60_000;

    it("puts a faster clear above a slower one", () => {
      const bands = [0.5, 2.9, 3.1, 4.9, 5.1, 7.9, 8.1, 30].map((t) => timelessBand(true, m(t)));
      // Never improves as the clock runs on.
      for (let i = 1; i < bands.length; i++) expect(bands[i]).toBeGreaterThanOrEqual(bands[i - 1]!);
      expect(timelessBand(true, m(2.9))).toBeLessThan(timelessBand(true, m(3.1)));
      expect(timelessBand(true, m(4.9))).toBeLessThan(timelessBand(true, m(5.1)));
      expect(timelessBand(true, m(7.9))).toBeLessThan(timelessBand(true, m(8.1)));
    });

    it("hands the very best word to a fast clear", () => {
      expect(bandAt(timelessBand(true, m(1))).word).toBe("OH MY GOD~!");
      expect(bandAt(timelessBand(true, m(4))).word).toBe("UNBELIEVABLE!!");
      expect(bandAt(timelessBand(true, m(6))).word).toBe("AMAZING!");
      expect(bandAt(timelessBand(true, m(20))).word).toBe("GREAT!");
    });

    it("puts every unfinished board at the bottom, however long or short", () => {
      for (const minutes of [0.1, 3, 10, 60]) {
        expect(timelessBand(false, m(minutes))).toBe(CHEER_BANDS - 1);
        expect(bandAt(timelessBand(false, m(minutes))).word).toBe("GOOD TRY!");
      }
      // Even the slowest clear beats it, which is the whole point.
      expect(timelessBand(true, m(60))).toBeLessThan(timelessBand(false, m(0.1)));
    });

    it("leaves a rung spare for the unfinished board", () => {
      expect(TIMELESS_PACE_MS.length).toBe(CHEER_BANDS - 2);
      expect([...TIMELESS_PACE_MS]).toEqual([...TIMELESS_PACE_MS].sort((a, b) => a - b));
    });
  });
});

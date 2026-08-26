import { describe, expect, it } from "vitest";
import { newGame, useHint } from "./game";
import {
  CHAPTERS,
  starsFor,
  STAGES_PER_CHAPTER,
  TOTAL_STAGES,
  chapterFor,
  isChapterFinale,
  stageConfig,
} from "./story";

const everyStage = Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1);

describe("chapters", () => {
  it("covers every stage", () => {
    expect(TOTAL_STAGES).toBe(CHAPTERS.length * STAGES_PER_CHAPTER);
    for (const stage of everyStage) expect(chapterFor(stage)).toBeDefined();
  });

  it("groups stages five at a time", () => {
    expect(chapterFor(1).id).toBe(CHAPTERS[0]!.id);
    expect(chapterFor(5).id).toBe(CHAPTERS[0]!.id);
    expect(chapterFor(6).id).toBe(CHAPTERS[1]!.id);
  });

  it("plays a story beat on the last stage of each chapter", () => {
    expect(isChapterFinale(4)).toBe(false);
    expect(isChapterFinale(5)).toBe(true);
    expect(isChapterFinale(10)).toBe(true);
    expect(everyStage.filter(isChapterFinale)).toHaveLength(CHAPTERS.length);
  });

  it("clamps past the final stage rather than falling off the end", () => {
    expect(chapterFor(TOTAL_STAGES + 50).id).toBe(CHAPTERS.at(-1)!.id);
  });

  it("gives every chapter art, a name and at least one line", () => {
    for (const chapter of CHAPTERS) {
      expect(chapter.character).toMatch(/\.svg$|\.png$|\.webp$|\.jpg$/);
      expect(chapter.characterName.length).toBeGreaterThan(0);
      expect(chapter.lines.length).toBeGreaterThan(0);
    }
  });
});

describe("difficulty curve", () => {
  it("never gets easier as stages climb", () => {
    for (let stage = 2; stage <= TOTAL_STAGES; stage++) {
      const prev = stageConfig(stage - 1);
      const next = stageConfig(stage);
      expect(next.width).toBeGreaterThanOrEqual(prev.width);
      expect(next.rows).toBeGreaterThanOrEqual(prev.rows);
      expect(next.shuffles).toBeLessThanOrEqual(prev.shuffles);
      // Later stages deal more plain pairs, which spreads the values out and
      // leaves rigid 8s and 9s stranded — that is what makes a board hard.
      expect(next.groupWeights[0]!).toBeGreaterThanOrEqual(prev.groupWeights[0]!);
    }
  });

  it("keeps every board a sane shape for a phone screen", () => {
    for (const stage of everyStage) {
      const config = stageConfig(stage);
      expect(config.width).toBeGreaterThanOrEqual(5);
      expect(config.width).toBeLessThanOrEqual(10);
      expect(config.rows).toBeGreaterThanOrEqual(config.width);
      // Tiles are square and the board fills the screen, so the shape has to
      // stay near the phone's own ratio or it ends up a thin ribbon.
      expect(config.rows / config.width).toBeLessThan(2);
      expect(config.shuffles).toBeGreaterThanOrEqual(1);
      expect(config.stage).toBe(stage);
      expect(config.mode).toBe("story");
    }
  });

  it("actually tightens between the first and last stage", () => {
    const first = stageConfig(1);
    const last = stageConfig(TOTAL_STAGES);
    expect(last.width * last.rows).toBeGreaterThan(first.width * first.rows * 2);
    expect(last.shuffles).toBeLessThan(first.shuffles);
  });

  it("deals a playable opening board on every stage", () => {
    for (const stage of everyStage) {
      const game = newGame(stageConfig(stage), stage * 977);
      expect(game.status).toBe("playing");
      expect(useHint({ ...game, hintsLeft: 1 }).indices).not.toBeNull();
    }
  });
});

describe("star grading", () => {
  const targets = [16, 10, 5] as [number, number, number];

  it("grades on the boundaries of each target", () => {
    expect(starsFor(targets, 0)).toBe(3);
    expect(starsFor(targets, 5)).toBe(3);
    expect(starsFor(targets, 6)).toBe(2);
    expect(starsFor(targets, 10)).toBe(2);
    expect(starsFor(targets, 11)).toBe(1);
    expect(starsFor(targets, 16)).toBe(1);
    expect(starsFor(targets, 17)).toBe(0);
  });

  it("keeps every stage's targets ordered and reachable", () => {
    for (const stage of everyStage) {
      const [one, two, three] = stageConfig(stage).starTargets;
      expect(one).toBeGreaterThan(two);
      expect(two).toBeGreaterThan(three);
      expect(three).toBeGreaterThan(0); // a perfect clear is deal-dependent
    }
  });

  it("tightens the share of the board allowed to survive, stage by stage", () => {
    const share = (stage: number, tier: number) => {
      const c = stageConfig(stage);
      return c.starTargets[tier]! / (c.width * c.rows);
    };
    for (let tier = 0; tier < 3; tier++) {
      expect(share(TOTAL_STAGES, tier)).toBeLessThan(share(1, tier));
    }
  });
});

import { describe, expect, it } from "vitest";
import { newGame, useHint } from "./game";
import {
  CHAPTERS,
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
      expect(next.adds).toBeLessThanOrEqual(prev.adds);
      expect(next.rows).toBeGreaterThanOrEqual(prev.rows);
      expect(next.weights[8]!).toBeGreaterThanOrEqual(prev.weights[8]!);
    }
  });

  it("always leaves enough adds and a sane board", () => {
    for (const stage of everyStage) {
      const config = stageConfig(stage);
      expect(config.adds).toBeGreaterThanOrEqual(2);
      expect(config.rows).toBeGreaterThanOrEqual(3);
      expect(config.rows).toBeLessThanOrEqual(7);
      expect(config.weights).toHaveLength(9);
      expect(config.stage).toBe(stage);
      expect(config.mode).toBe("story");
    }
  });

  it("actually tightens between the first and last stage", () => {
    expect(stageConfig(TOTAL_STAGES).adds).toBeLessThan(stageConfig(1).adds);
    expect(stageConfig(TOTAL_STAGES).rows).toBeGreaterThan(stageConfig(1).rows);
  });

  it("deals a playable opening board on every stage", () => {
    for (const stage of everyStage) {
      const game = newGame(stageConfig(stage), stage * 977);
      expect(game.status).toBe("playing");
      expect(useHint({ ...game, hintsLeft: 1 }).indices).not.toBeNull();
    }
  });
});

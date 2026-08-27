import { describe, expect, it } from "vitest";
import { newGame, useHint } from "../core/game";
import {
  CHAPTERS,
  STAGES_PER_CHAPTER,
  TOTAL_STAGES,
  chapterFor,
  isChapterFinale,
} from "./chapters";
import { ENDLESS_CONFIG, TIME_ATTACK_CONFIG, stageConfig } from "./stages";

const everyStage = Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1);

describe("chapters", () => {
  it("covers every stage and groups them five at a time", () => {
    expect(TOTAL_STAGES).toBe(CHAPTERS.length * STAGES_PER_CHAPTER);
    expect(chapterFor(1).id).toBe(CHAPTERS[0]!.id);
    expect(chapterFor(5).id).toBe(CHAPTERS[0]!.id);
    expect(chapterFor(6).id).toBe(CHAPTERS[1]!.id);
  });

  it("plays a story beat on the last stage of each chapter", () => {
    expect(isChapterFinale(4)).toBe(false);
    expect(isChapterFinale(5)).toBe(true);
    expect(everyStage.filter(isChapterFinale)).toHaveLength(CHAPTERS.length);
  });

  it("clamps past the final stage rather than falling off the end", () => {
    expect(chapterFor(TOTAL_STAGES + 50).id).toBe(CHAPTERS.at(-1)!.id);
  });

  it("gives every chapter art, a name and at least one line", () => {
    for (const chapter of CHAPTERS) {
      expect(chapter.character).toMatch(/\.(svg|png|webp|jpg)$/);
      expect(chapter.characterName.length).toBeGreaterThan(0);
      expect(chapter.lines.length).toBeGreaterThan(0);
    }
  });
});

describe("stage curve", () => {
  it("never gets easier as stages climb", () => {
    for (let stage = 2; stage <= TOTAL_STAGES; stage++) {
      const prev = stageConfig(stage - 1);
      const next = stageConfig(stage);
      expect(next.hints).toBeLessThanOrEqual(prev.hints);
      for (let tier = 0; tier < 3; tier++) {
        expect(next.starTargets[tier]!).toBeLessThanOrEqual(prev.starTargets[tier]!);
      }
    }
  });

  it("grows the board a row at a time, never shrinking it", () => {
    let rows = 0;
    for (const stage of everyStage) {
      const config = stageConfig(stage);
      expect(config.width).toBe(9);
      expect(config.rows).toBeGreaterThanOrEqual(rows);
      rows = config.rows;
      expect(config.stage).toBe(stage);
      expect(config.mode).toBe("story");
    }
    expect(stageConfig(1).rows).toBe(6);
    expect(stageConfig(TOTAL_STAGES).rows).toBe(11);
  });

  it("deals a full even deck on every stage, one digit per cell", () => {
    for (const stage of everyStage) {
      const config = stageConfig(stage);
      // Nine columns, so a row is one more of every digit. The deck exactly
      // fills the board, which is what keeps a stage clearable.
      expect(config.deck?.slice(1)).toEqual(Array(9).fill(config.rows));
      expect(config.deck?.reduce((a, b) => a + b, 0)).toBe(config.width * config.rows);
    }
  });

  it("keeps moving all the way to the final stage, never plateauing early", () => {
    const checkpoints = [1, 5, 10, 15, TOTAL_STAGES].map(stageConfig);
    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1]!;
      const next = checkpoints[i]!;
      const changed =
        next.hints !== prev.hints ||
        next.starTargets.some((t, tier) => t !== prev.starTargets[tier]);
      expect(changed, `stages plateau between checkpoint ${i - 1} and ${i}`).toBe(true);
    }
  });

  it("reaches its hardest settings exactly at the final stage", () => {
    const last = stageConfig(TOTAL_STAGES);
    expect(last.hints).toBe(1);
    expect(last.rows).toBe(11);
    expect(last.starTargets[2]).toBe(3);
  });

  it("deals a playable opening board on every stage", () => {
    for (const stage of everyStage) {
      const game = newGame(stageConfig(stage), stage * 977);
      expect(game.status).toBe("playing");
      expect(useHint({ ...game, hintsLeft: 1 }).indices).not.toBeNull();
    }
  });
});

describe("star targets", () => {
  it("keeps every stage's targets ordered and reachable", () => {
    for (const stage of everyStage) {
      const [one, two, three] = stageConfig(stage).starTargets;
      expect(one).toBeGreaterThan(two);
      expect(two).toBeGreaterThan(three);
      expect(three).toBeGreaterThan(0); // a perfect clear depends on the deal
    }
  });

  it("tightens every target from the first stage to the last", () => {
    for (let tier = 0; tier < 3; tier++) {
      expect(stageConfig(TOTAL_STAGES).starTargets[tier]!).toBeLessThan(
        stageConfig(1).starTargets[tier]!,
      );
    }
  });
});

describe("mode presets", () => {
  it("gives time attack a clock and no hints to lean on", () => {
    expect(TIME_ATTACK_CONFIG.timeLimitMs).toBe(60_000);
    expect(TIME_ATTACK_CONFIG.autoRefill).toBe(true);
    expect(TIME_ATTACK_CONFIG.hints).toBe(0);
  });

  it("leaves endless untimed", () => {
    expect(ENDLESS_CONFIG.timeLimitMs).toBeUndefined();
    expect(ENDLESS_CONFIG.hints).toBeGreaterThan(0);
  });
});

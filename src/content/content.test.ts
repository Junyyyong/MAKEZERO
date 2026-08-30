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
  it("covers all ninety-nine stages, nine to a chapter", () => {
    expect(TOTAL_STAGES).toBe(99);
    expect(STAGES_PER_CHAPTER).toBe(9);
    expect(TOTAL_STAGES).toBe(CHAPTERS.length * STAGES_PER_CHAPTER);
    expect(chapterFor(1).id).toBe(CHAPTERS[0]!.id);
    expect(chapterFor(9).id).toBe(CHAPTERS[0]!.id);
    expect(chapterFor(10).id).toBe(CHAPTERS[1]!.id);
  });

  it("plays a story beat on the last stage of each chapter", () => {
    expect(isChapterFinale(8)).toBe(false);
    expect(isChapterFinale(9)).toBe(true);
    expect(everyStage.filter(isChapterFinale)).toHaveLength(CHAPTERS.length);
  });

  it("gives every chapter its own id, so no beat plays twice", () => {
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length);
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
      expect(next.width * next.rows).toBeGreaterThanOrEqual(prev.width * prev.rows);
      expect(next.hints).toBeLessThanOrEqual(prev.hints);
      // 1s get rarer and 9s commoner, every stage without exception.
      expect(next.digitWeights![1]!).toBeLessThanOrEqual(prev.digitWeights![1]!);
      expect(next.digitWeights![9]!).toBeGreaterThanOrEqual(prev.digitWeights![9]!);
    }
  });

  it("deals nine by nine on every stage", () => {
    expect(stageConfig(1)).toMatchObject({ width: 9, rows: 9 });
    expect(stageConfig(TOTAL_STAGES)).toMatchObject({ width: 9, rows: 9 });
    for (const stage of everyStage) {
      const config = stageConfig(stage);
      expect(config.deck).toBeUndefined();
      expect(config.stage).toBe(stage);
      expect(config.mode).toBe("story");
    }
  });

  it("keeps moving all the way to the final stage, never plateauing early", () => {
    const checkpoints = [1, 20, 40, 60, 80, TOTAL_STAGES].map(stageConfig);
    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1]!;
      const next = checkpoints[i]!;
      const changed =
        next.width !== prev.width ||
        next.rows !== prev.rows ||
        next.hints !== prev.hints ||
        next.undos !== prev.undos ||
        next.starTargets.some((t, tier) => t !== prev.starTargets[tier]) ||
        next.digitWeights!.some((weight, i) => weight !== prev.digitWeights![i]);
      expect(changed, `stages plateau between checkpoint ${i - 1} and ${i}`).toBe(true);
    }
  });

  it("reaches its hardest settings exactly at the final stage", () => {
    const last = stageConfig(TOTAL_STAGES);
    expect(last.width).toBe(9);
    expect(last.rows).toBe(9);
    expect(last.hints).toBe(0);
    expect(last.undos).toBe(1);
    // The digit histogram is nearly level by the end: as many 9s as 1s, so
    // long combinations stop being a free ride.
    const digits = last.digitWeights!.slice(1);
    expect(Math.max(...digits) - Math.min(...digits)).toBeLessThan(3);
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
  it("keeps the consolation mark within reach on every stage", () => {
    // Story grades on emptying the board; the first target is only the mark
    // for a board that came close, so a run never hard-locks on one bad deal.
    for (const stage of everyStage) {
      const config = stageConfig(stage);
      const [nearly] = config.starTargets;
      expect(nearly).toBeGreaterThan(1);
      expect(nearly).toBeLessThan(config.width * config.rows * 0.25);
    }
  });

  it("asks for a smaller share of a bigger board", () => {
    const first = stageConfig(1);
    const last = stageConfig(TOTAL_STAGES);
    expect(last.starTargets[0]! / (last.width * last.rows)).toBeLessThan(
      first.starTargets[0]! / (first.width * first.rows),
    );
  });
});

describe("mode presets", () => {
  it("gives time attack a clock and no hints to lean on", () => {
    expect(TIME_ATTACK_CONFIG.timeLimitMs).toBe(60_000);
    // The board is a fixed frame — cleared squares stay as holes rather than
    // collapsing the row and shrinking the board mid-run.
    expect(TIME_ATTACK_CONFIG.keepBoard).toBe(true);
    expect(TIME_ATTACK_CONFIG.hints).toBe(0);
  });

  it("leaves endless untimed", () => {
    expect(ENDLESS_CONFIG.timeLimitMs).toBeUndefined();
    expect(ENDLESS_CONFIG.hints).toBeGreaterThan(0);
  });
});

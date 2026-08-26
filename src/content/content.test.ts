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
      expect(next.width).toBeGreaterThanOrEqual(prev.width);
      expect(next.rows).toBeGreaterThanOrEqual(prev.rows);
      expect(next.hints).toBeLessThanOrEqual(prev.hints);
      // Later stages deal more plain pairs, which spreads the values out and
      // strands the rigid 8s and 9s — that is what makes a board hard.
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
      expect(config.stage).toBe(stage);
      expect(config.mode).toBe("story");
    }
  });

  it("keeps moving all the way to the final stage, never plateauing early", () => {
    const checkpoints = [1, 5, 10, 15, TOTAL_STAGES].map(stageConfig);
    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1]!;
      const next = checkpoints[i]!;
      const changed =
        next.width !== prev.width ||
        next.rows !== prev.rows ||
        next.hints !== prev.hints ||
        next.groupWeights[0] !== prev.groupWeights[0];
      expect(changed, `stages plateau between checkpoint ${i - 1} and ${i}`).toBe(true);
    }
  });

  it("reaches its hardest settings exactly at the final stage", () => {
    const last = stageConfig(TOTAL_STAGES);
    expect(last.width).toBe(10);
    expect(last.rows).toBe(15);
    expect(last.hints).toBe(1);
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

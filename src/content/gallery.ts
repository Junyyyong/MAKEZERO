import { TOTAL_STAGES, chapterFor } from "./chapters";

/**
 * The picture behind each stage's board.
 *
 * Clearing a block uncovers the square of the picture it was sitting on, so a
 * finished stage *is* the picture — and finishing it is how it is collected.
 * There are as many pictures as there are stages.
 *
 * `art` is a path under `public/`. It is optional on purpose: until the real
 * illustrations arrive, a stage with no path is drawn from `placeholderArt`
 * below, so the reveal works today and dropping the artwork in later is a
 * one-line change per stage. See docs/CONTENT.md.
 */
export interface Plate {
  /** 1-based stage this picture belongs to. */
  stage: number;
  title: string;
  art?: string;
}

export const PLATES: readonly Plate[] = Array.from({ length: TOTAL_STAGES }, (_, i) => {
  const stage = i + 1;
  return { stage, title: `${chapterFor(stage).characterName} ${((stage - 1) % 9) + 1}` };
});

export function plateFor(stage: number): Plate {
  return PLATES[Math.min(Math.max(stage, 1), TOTAL_STAGES) - 1]!;
}

/**
 * A stand-in picture, built from the stage number alone.
 *
 * Two soft colour fields and a disc — enough that uncovering it reads as
 * uncovering *something*, and different enough stage to stage that a gallery
 * of them does not look like one picture repeated. It is deliberately not
 * detailed: it is scaffolding, and it should be obvious that it is.
 */
export function placeholderArt(stage: number): string {
  const hue = (stage * 47) % 360;
  const other = (hue + 140) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
    `<rect width='100' height='100' fill='hsl(${hue} 46% 32%)'/>` +
    `<circle cx='${30 + ((stage * 13) % 40)}' cy='${28 + ((stage * 7) % 30)}' r='${18 + (stage % 9)}' fill='hsl(${other} 62% 62%)'/>` +
    `<path d='M0 ${70 + (stage % 15)} Q 50 ${40 + (stage % 30)} 100 ${72 + (stage % 12)} L100 100 L0 100 Z' fill='hsl(${other} 40% 24%)'/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** What to paint behind a stage's board: the real art if there is any. */
export function artFor(stage: number): string {
  const plate = plateFor(stage);
  return plate.art ? `url("${plate.art}")` : placeholderArt(stage);
}

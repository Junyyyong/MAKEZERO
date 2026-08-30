import type { Chapter } from "../../content/chapters";
import { el } from "../dom";

/** Plays a chapter's lines one at a time, then hands control back. */
export class StoryScreen {
  private chapter: Chapter | null = null;
  private line = 0;
  private onDone: (() => void) | null = null;

  private readonly portrait = el<HTMLImageElement>("story-portrait");
  private readonly titleEl = el<HTMLHeadingElement>("story-title");
  private readonly nameEl = el<HTMLParagraphElement>("story-name");
  private readonly lineEl = el<HTMLParagraphElement>("story-line");
  private readonly nextBtn = el<HTMLButtonElement>("btn-story-next");

  constructor() {
    this.nextBtn.addEventListener("click", () => this.advance());
  }

  play(chapter: Chapter, onDone: () => void): void {
    this.chapter = chapter;
    this.line = 0;
    this.onDone = onDone;
    this.render();
  }

  private render(): void {
    const chapter = this.chapter;
    if (!chapter) return;
    this.portrait.src = chapter.character;
    this.portrait.alt = chapter.characterName;
    this.titleEl.textContent = chapter.title;
    this.nameEl.textContent = chapter.characterName;
    this.lineEl.textContent = chapter.lines[this.line] ?? "";
    this.nextBtn.textContent = this.line >= chapter.lines.length - 1 ? "Continue" : "Next";
  }

  private advance(): void {
    const chapter = this.chapter;
    if (!chapter) return;
    if (this.line < chapter.lines.length - 1) {
      this.line += 1;
      this.render();
      return;
    }
    this.chapter = null;
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }
}

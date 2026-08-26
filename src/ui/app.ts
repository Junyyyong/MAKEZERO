import { aliveCount } from "../core/board";
import { commitSelection, newGame, stars, tick, useHint } from "../core/game";
import type { GameState } from "../core/game";
import { isSelectionValid } from "../core/rules";
import type { GameMode, RunConfig } from "../core/types";
import { TOTAL_STAGES, chapterFor, isChapterFinale } from "../content/chapters";
import type { Chapter } from "../content/chapters";
import { ENDLESS_CONFIG, TIME_ATTACK_CONFIG, stageConfig } from "../content/stages";
import { BoardView } from "./boardView";
import { el, starLine } from "./dom";
import { Hud } from "./screens/hud";
import { Overlay } from "./screens/overlay";
import { StoryScreen } from "./screens/storyScreen";
import { TitleScreen } from "./screens/titleScreen";
import { loadDaily, loadProgress, saveDaily, saveProgress } from "./storage";
import type { DailyStats, Progress } from "./storage";

const RULES_TEXT = `숫자를 골라 합이 <b>정확히 10</b>이 되면 지워집니다.
2개부터 5개까지 고를 수 있고, 많이 고를수록 점수가 큽니다.
<span class="rule-num">2개 10점 · 3개 30점<br />4개 70점 · 5개 150점</span>
<b>어느 칸이든 상관없습니다.</b> 멀리 떨어져 있어도, 사이에 무엇이 있어도 함께 고를 수 있습니다.
같은 숫자끼리 지우는 규칙은 없습니다. 3+3은 6이라 지워지지 않아요.`;

type Screen = "title" | "game" | "story";

/** Owns the run in progress and moves between screens. */
export class App {
  private state: GameState;
  private daily: DailyStats;
  private progress: Progress;

  private readonly view: BoardView;
  private readonly hud = new Hud();
  private readonly overlay = new Overlay(() => this.showTitle());
  private readonly story = new StoryScreen();
  private readonly title: TitleScreen;

  private frame: number | undefined;
  private lastFrameMs = 0;

  private readonly screens: Record<Screen, HTMLElement> = {
    title: el("screen-title"),
    game: el("screen-game"),
    story: el("screen-story"),
  };

  constructor() {
    this.daily = loadDaily();
    this.progress = loadProgress();
    this.state = newGame(ENDLESS_CONFIG, 1);

    this.view = new BoardView({
      wrap: el("board-wrap"),
      grid: el("board"),
      isValid: (selection) => isSelectionValid(this.state.board, selection),
      onCommit: (selection) => this.commit(selection),
    });
    this.title = new TitleScreen(
      (mode) => this.startMode(mode),
      () => this.showRules(),
    );

    el<HTMLButtonElement>("btn-help").addEventListener("click", () => this.showRules());
    el<HTMLButtonElement>("btn-back").addEventListener("click", () => this.showTitle());
    this.hud.hintBtn.addEventListener("click", () => this.onHint());

    this.showTitle();
  }

  // ---- screens -----------------------------------------------------------

  private show(screen: Screen): void {
    for (const [name, node] of Object.entries(this.screens)) {
      node.classList.toggle("hidden", name !== screen);
    }
    this.overlay.close();
  }

  private showTitle(): void {
    this.stopClock();
    this.view.setInteractive(false);
    this.daily = loadDaily();
    this.progress = loadProgress();
    this.title.render(this.progress);
    this.show("title");
  }

  private startMode(mode: GameMode): void {
    if (mode === "story") {
      this.startStage(Math.min(this.progress.stage, TOTAL_STAGES));
      return;
    }
    if (mode === "endless") {
      this.daily = { ...this.daily, games: this.daily.games + 1 };
      saveDaily(this.daily);
    }
    this.beginRun(mode === "timeAttack" ? TIME_ATTACK_CONFIG : ENDLESS_CONFIG);
  }

  private startStage(stage: number): void {
    this.beginRun(stageConfig(stage));
  }

  private beginRun(config: RunConfig): void {
    this.state = newGame(config);
    this.show("game");
    this.view.setBoard(this.state.board);
    this.view.setInteractive(true);
    this.render();
    if (config.timeLimitMs !== undefined || config.spawn) this.startClock();
  }

  // ---- clock -------------------------------------------------------------

  private startClock(): void {
    this.stopClock();
    this.lastFrameMs = performance.now();
    const step = (now: number) => {
      const delta = now - this.lastFrameMs;
      this.lastFrameMs = now;
      const next = tick(this.state, delta);
      if (next !== this.state) {
        this.state = next;
        this.render();
      }
      if (this.state.status === "playing") this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private stopClock(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  // ---- moves -------------------------------------------------------------

  private commit(selection: readonly number[]): void {
    const anchor = selection[selection.length - 1]!;
    const { state, result } = commitSelection(this.state, selection);
    if (!result.ok) return;
    this.view.popScore(anchor, result.score);
    this.state = state;
    this.recordScore();
    this.render();
  }

  private onHint(): void {
    if (this.state.hintsLeft === 0 || this.state.status !== "playing") return;
    const { state, indices } = useHint(this.state);
    this.state = state;
    if (indices) this.view.showHint(indices);
    this.render();
  }

  private recordScore(): void {
    const { mode } = this.state.config;
    if (mode === "endless") {
      if (this.state.score > this.daily.best) {
        this.daily = { ...this.daily, best: this.state.score };
        saveDaily(this.daily);
      }
      if (this.state.score > this.progress.bestEndless) {
        this.progress = { ...this.progress, bestEndless: this.state.score };
        saveProgress(this.progress);
      }
    } else if (mode === "timeAttack" && this.state.score > this.progress.bestTimeAttack) {
      this.progress = { ...this.progress, bestTimeAttack: this.state.score };
      saveProgress(this.progress);
    }
  }

  // ---- results -----------------------------------------------------------

  private render(): void {
    // The board is a new object whenever anything changes it, tiles arriving
    // on their own timer included, so the view is re-pointed every render.
    this.view.sync(this.state.board);
    this.hud.gamesToday = this.daily.games;
    this.hud.bestToday = this.daily.best;
    this.hud.render(this.state);
    if (this.state.status !== "playing") this.finishRun();
  }

  private finishRun(): void {
    this.stopClock();
    this.view.setInteractive(false);
    const { config, score } = this.state;

    if (config.mode === "story") {
      this.finishStage(config.stage ?? 1, stars(this.state));
      return;
    }
    if (config.mode === "timeAttack") {
      this.overlay.open({
        title: "시간 종료",
        body: `점수 ${score}점\n최고 ${this.progress.bestTimeAttack}점`,
        primary: { label: "다시 하기", action: () => this.startMode("timeAttack") },
      });
      return;
    }
    this.overlay.open({
      title: "보드가 가득 찼어요",
      body: `점수 ${score}점\n오늘 최고 ${this.daily.best}점\n최고 기록 ${this.progress.bestEndless}점`,
      primary: { label: "다시 하기", action: () => this.startMode("endless") },
    });
  }

  /** Grades the stage, unlocks the next one, then plays any chapter beat. */
  private finishStage(stage: number, earned: number): void {
    const left = aliveCount(this.state.board);
    const targets = this.state.config.starTargets;

    if (earned === 0) {
      this.overlay.open({
        title: "아쉬워요",
        body: `${starLine(0)}\n${left}개가 남았어요.\n별 하나까지 ${targets[0]}개 이하로 줄여야 해요.`,
        primary: { label: "다시 도전", action: () => this.startStage(stage) },
      });
      return;
    }

    if (stage >= this.progress.stage) {
      this.progress = { ...this.progress, stage: Math.min(stage + 1, TOTAL_STAGES + 1) };
      saveProgress(this.progress);
    }

    const chapter = chapterFor(stage);
    if (isChapterFinale(stage) && !this.progress.seenChapters.includes(chapter.id)) {
      this.progress = {
        ...this.progress,
        seenChapters: [...this.progress.seenChapters, chapter.id],
      };
      saveProgress(this.progress);
      this.playChapter(chapter, stage);
      return;
    }
    this.showStageResult(stage, earned, left);
  }

  private showStageResult(stage: number, earned: number, left: number): void {
    const summary = `${starLine(earned)}\n${left}개 남음 · 점수 ${this.state.score}점`;
    if (stage >= TOTAL_STAGES) {
      this.overlay.open({
        title: "완주!",
        body: `${summary}\n모든 스테이지를 끝냈습니다.`,
        primary: { label: "모드 선택", action: () => this.showTitle() },
      });
      return;
    }
    this.overlay.open({
      title: earned === 3 ? "완벽해요!" : "스테이지 클리어",
      body: summary,
      primary: { label: "다음 스테이지", action: () => this.startStage(stage + 1) },
      secondary:
        earned < 3 ? { label: "다시 도전", action: () => this.startStage(stage) } : undefined,
    });
  }

  private playChapter(chapter: Chapter, stage: number): void {
    this.show("story");
    this.story.play(chapter, () => {
      if (stage >= TOTAL_STAGES) {
        this.showTitle();
        return;
      }
      this.startStage(stage + 1);
    });
  }

  private showRules(): void {
    const onTitle = !this.screens.title.classList.contains("hidden");
    this.overlay.open({
      title: "규칙",
      body: RULES_TEXT,
      html: true,
      primary: {
        label: "닫기",
        // A finished run keeps its result panel; the rules just sat on top.
        action: () => {
          if (!onTitle && this.state.status !== "playing") this.finishRun();
        },
      },
      secondary: { label: "모드 선택", action: () => this.showTitle() },
    });
  }
}

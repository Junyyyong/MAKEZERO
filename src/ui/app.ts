import { aliveCount } from "../core/board";
import { canSplit, commitSelection, newGame, splitTile, tick, undo, useHint } from "../core/game";
import type { GameState } from "../core/game";
import { isSelectionValid } from "../core/rules";
import type { GameMode, RunConfig } from "../core/types";
import { TOTAL_STAGES, chapterFor, isChapterFinale } from "../content/chapters";
import { artFor, plateFor } from "../content/gallery";
import type { Chapter } from "../content/chapters";
import { ENDLESS_CONFIG, TIME_ATTACK_CONFIG, stageConfig } from "../content/stages";
import { BoardView } from "./boardView";
import { AppStateMachine } from "./appStateMachine";
import { el } from "./dom";
import { Hud } from "./screens/hud";
import { Overlay } from "./screens/overlay";
import { StoryScreen } from "./screens/storyScreen";
import { GalleryScreen } from "./screens/galleryScreen";
import { TitleScreen } from "./screens/titleScreen";
import { TutorialScreen } from "./screens/tutorialScreen";
import {
  loadDaily,
  loadProgress,
  loadSettings,
  collectPlate,
  totalCollected,
  saveDaily,
  saveProgress,
  saveSettings,
} from "./storage";
import type { DailyStats, Progress, Settings } from "./storage";

const RULES_TEXT = `숫자를 골라 합이 <b>정확히 10</b>이 되면 지워집니다.
2개부터 5개까지 고를 수 있고, 많이 고를수록 점수가 큽니다.
<span class="rule-num">2개 10점 · 3개 20점<br />4개 40점 · 5개 80점</span>
<b>어느 칸이든 상관없습니다.</b> 멀리 떨어져 있어도, 사이에 무엇이 있어도 함께 고를 수 있습니다.
같은 숫자끼리 지우는 규칙은 없습니다. 3+3은 6이라 지워지지 않아요.`;

type Screen = "splash" | "title" | "game" | "story" | "tutorial" | "gallery";

/** How long the finished picture is held before the results panel. */
const PLATE_HOLD_MS = 2000;

/** Owns the run in progress and moves between screens. */
export class App {
  private state: GameState;
  private daily: DailyStats;
  private progress: Progress;
  /** Whether the split item is waiting for a block to be picked. */
  private splitArmed = false;
  private settings: Settings;
  private readonly flow = new AppStateMachine();

  private readonly view: BoardView;
  private readonly hud = new Hud();
  private readonly overlay = new Overlay(() => this.showTitle());
  private readonly story = new StoryScreen();
  private readonly title: TitleScreen;
  private readonly tutorial = new TutorialScreen();
  private readonly gallery: GalleryScreen;

  private frame: number | undefined;
  private lastFrameMs = 0;
  private activeScreen: Screen = "splash";

  private readonly screens: Record<Screen, HTMLElement> = {
    splash: el("screen-splash"),
    title: el("screen-title"),
    game: el("screen-game"),
    story: el("screen-story"),
    tutorial: el("screen-tutorial"),
    gallery: el("screen-gallery"),
  };

  constructor() {
    this.daily = loadDaily();
    this.progress = loadProgress();
    this.settings = loadSettings();
    this.state = newGame(ENDLESS_CONFIG, 1);

    this.view = new BoardView({
      wrap: el("board-wrap"),
      grid: el("board"),
      isValid: (selection) => isSelectionValid(this.state.board, selection),
      onCommit: (selection) => this.commit(selection),
      onSplit: (index) => this.onSplit(index),
      onSelectionChange: (sum) => this.hud.setSelectionSum(sum),
    });
    this.title = new TitleScreen(
      (mode) => this.startMode(mode),
      () => this.showRules(),
      () => this.showSettings(),
    );

    this.gallery = new GalleryScreen(() => this.showTitle());
    el<HTMLButtonElement>("btn-back").addEventListener("click", () => this.showTitle());
    el<HTMLButtonElement>("btn-pause").addEventListener("click", () => this.pause());
    el<HTMLButtonElement>("btn-title-tutorial").addEventListener("click", () => this.showTutorial());
    el<HTMLButtonElement>("btn-title-gallery").addEventListener("click", () => this.showGallery());
    this.hud.hintBtn.addEventListener("click", () => this.onHint());
    this.hud.undoBtn.addEventListener("click", () => this.onUndo());
    this.hud.splitBtn.addEventListener("click", () => this.armSplit());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.flow.current === "inGame") this.pause();
    });

    this.applySettings();
    window.setTimeout(() => this.showTitle(), 2_000);
  }

  // ---- screens -----------------------------------------------------------

  private show(screen: Screen): void {
    const next = this.screens[screen];
    const previous = this.screens[this.activeScreen];
    if (previous === next) return;

    this.activeScreen = screen;
    next.classList.remove("hidden");
    next.classList.remove("screen-leave", "screen-enter", "screen-enter-active");
    next.classList.add("screen-enter");
    previous?.classList.add("screen-leave");
    requestAnimationFrame(() => next.classList.add("screen-enter-active"));
    window.setTimeout(() => {
      previous?.classList.add("hidden");
      previous?.classList.remove("screen-leave");
      next.classList.remove("screen-enter", "screen-enter-active");
    }, 240);
    this.overlay.close();
  }

  private showTitle(): void {
    this.stopClock();
    this.view.setInteractive(false);
    this.daily = loadDaily();
    this.progress = loadProgress();
    this.title.render(this.progress);
    this.flow.enter("mainMenu");
    this.show("title");
  }

  private showTutorial(): void {
    this.stopClock();
    this.view.setInteractive(false);
    this.flow.enter("tutorial");
    this.show("tutorial");
    this.tutorial.start(() => {
      if (!this.progress.tutorialDone) {
        this.progress = { ...this.progress, tutorialDone: true };
        saveProgress(this.progress);
      }
      this.showTitle();
    });
  }

  private showGallery(): void {
    this.progress = loadProgress();
    this.gallery.render(this.progress);
    this.flow.enter("gallery");
    this.show("gallery");
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
    this.flow.enter("inGame");
    this.show("game");
    el<HTMLDivElement>("plate-done").classList.add("hidden");
    this.view.setBackdrop(config.mode === "story" ? artFor(config.stage ?? 1) : null);
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

  private pause(): void {
    if (this.flow.current !== "inGame" || this.state.status !== "playing") return;
    this.stopClock();
    this.view.setInteractive(false);
    this.flow.enter("paused");
    this.overlay.open({
      title: "일시정지",
      body: "잠시 쉬어가도 괜찮아요.",
      primary: { label: "계속하기", action: () => this.resume() },
      secondary: { label: "메인 메뉴", action: () => this.showTitle() },
    });
  }

  private resume(): void {
    if (this.flow.current !== "paused") return;
    this.flow.enter("inGame");
    this.view.setInteractive(true);
    if (this.state.config.timeLimitMs !== undefined || this.state.config.spawn) this.startClock();
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

  /**
   * Takes the last move back, including the one that killed the board.
   *
   * A story board can always be emptied, so being stuck is a mistake rather
   * than bad luck — and a mistake the player should be able to see and fix.
   * The result overlay is closed first, because it is what the dead board put
   * up a moment ago.
   */
  private onUndo(): void {
    const back = undo(this.state);
    if (back === this.state) return;
    this.overlay.close();
    if (this.flow.current !== "inGame") this.flow.enter("inGame");
    this.state = back;
    this.view.setInteractive(true);
    this.view.clearHint();
    this.view.setBoard(this.state.board);
    this.render();
  }

  /**
   * Arms the split item: the next block tapped is broken up.
   *
   * Tapping the button again puts it away, and so does using it — one tap of
   * the item buys one break, never a mode the player can forget they are in.
   */
  private armSplit(): void {
    if (!canSplit(this.state)) return;
    this.splitArmed = !this.splitArmed;
    this.view.setSplitting(this.splitArmed);
    this.hud.splitBtn.classList.toggle("armed", this.splitArmed);
    this.hud.setNotice(this.splitArmed ? "나눌 블록을 하나 고르세요" : null);
  }

  private onSplit(index: number): void {
    const next = splitTile(this.state, index);
    this.splitArmed = false;
    this.view.setSplitting(false);
    this.hud.splitBtn.classList.remove("armed");
    this.hud.setNotice(null);
    if (next === this.state) {
      this.view.reject([index]);
      this.hud.setNotice("이 블록은 나눌 수 없어요");
      window.setTimeout(() => {
        this.hud.setNotice(null);
        this.render();
      }, 1400);
      return;
    }
    this.state = next;
    this.view.setBoard(this.state.board);
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
    if (mode === "story" && this.state.score > this.progress.bestStory) {
      this.progress = { ...this.progress, bestStory: this.state.score };
      saveProgress(this.progress);
    } else if (mode === "endless") {
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
    // The HUD goes first: it decides whether the timer bar shows and how many
    // lines the notice takes, which is how much room the board is left with.
    // Measuring the board before that sizes its tiles against a stale box.
    this.hud.gamesToday = this.daily.games;
    this.hud.bestToday = this.daily.best;
    this.hud.bestForMode =
      this.state.config.mode === "story"
        ? this.progress.bestStory
        : this.state.config.mode === "timeAttack"
          ? this.progress.bestTimeAttack
          : this.progress.bestEndless;
    this.hud.render(this.state);
    // The board is a new object whenever anything changes it, tiles arriving
    // on their own timer included, so the view is re-pointed every render.
    this.view.sync(this.state.board);
    if (this.state.status !== "playing" && this.flow.current === "inGame") this.finishRun();
  }

  private finishRun(): void {
    this.stopClock();
    this.view.setInteractive(false);
    this.flow.enter("result");
    const { config, score } = this.state;

    if (config.mode === "story") {
      // A dead board with a take-back left is not the end of the stage: the
      // board could still be emptied, so offer the way back before grading it.
      if (this.state.status === "lost" && this.state.undosLeft > 0 && this.state.previous) {
        this.overlay.open({
          title: "막혔어요",
          body: `10을 만들 수 있는 숫자가 없어요.\n이 판은 전부 지울 수 있어요 — 한 수 물려서 다시 해보세요.\n남은 물리기 ${this.state.undosLeft}회`,
          primary: { label: "한 수 물리기", action: () => this.onUndo() },
          secondary: { label: "여기서 끝내기", action: () => this.giveUp() },
        });
        return;
      }
      this.finishStage(config.stage ?? 1);
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

  /** Settles a stuck board the player has decided not to take back. */
  private giveUp(): void {
    this.overlay.close();
    this.finishStage(this.state.config.stage ?? 1);
  }

  /**
   * Settles the stage.
   *
   * There is nothing to grade any more: the board is either empty, and the
   * picture behind it is the player's, or it is not and the stage is unfinished.
   * Every board can be emptied, so an unfinished one is always worth another go.
   */
  /**
   * Holds the finished picture on screen for a beat before anything else.
   *
   * Without it the last clear and the results panel land in the same instant,
   * and the thing the whole stage was for — the picture — is never actually
   * looked at. The panel waits.
   */
  private showFinishedPlate(stage: number, then: () => void): void {
    const board = el<HTMLDivElement>("board").getBoundingClientRect();
    const wrap = el<HTMLDivElement>("board-wrap").getBoundingClientRect();
    const done = el<HTMLDivElement>("plate-done");
    done.style.left = `${board.left - wrap.left}px`;
    done.style.top = `${board.top - wrap.top}px`;
    done.style.width = `${board.width}px`;
    done.style.height = `${board.height}px`;
    done.style.backgroundImage = artFor(stage);
    el<HTMLSpanElement>("plate-done-label").textContent = `${plateFor(stage).title} 완성!`;
    // The score pops from the last clear are still drifting over the board;
    // let them go, or they float across the finished picture.
    for (const pop of el<HTMLDivElement>("board-wrap").querySelectorAll(".pop")) pop.remove();
    done.classList.remove("hidden");

    window.setTimeout(() => {
      done.classList.add("hidden");
      then();
    }, PLATE_HOLD_MS);
  }

  private finishStage(stage: number): void {
    const left = aliveCount(this.state.board);
    if (left > 0) {
      this.overlay.open({
        title: "아쉬워요",
        body: `${left}칸이 남았어요.\n이 판은 전부 지울 수 있어요 — 한 번 더 해볼까요?`,
        primary: { label: "다시 도전", action: () => this.startStage(stage) },
        secondary: { label: "모드 선택", action: () => this.showTitle() },
      });
      return;
    }

    this.progress = collectPlate(this.progress, stage);
    if (stage >= this.progress.stage) {
      this.progress = { ...this.progress, stage: Math.min(stage + 1, TOTAL_STAGES + 1) };
    }
    saveProgress(this.progress);

    const chapter = chapterFor(stage);
    const next = () => {
      if (isChapterFinale(stage) && !this.progress.seenChapters.includes(chapter.id)) {
        this.progress = {
          ...this.progress,
          seenChapters: [...this.progress.seenChapters, chapter.id],
        };
        saveProgress(this.progress);
        this.playChapter(chapter, stage);
        return;
      }
      this.showStageResult(stage);
    };
    this.showFinishedPlate(stage, next);
  }

  private showStageResult(stage: number): void {
    const plate = plateFor(stage);
    const held = totalCollected(this.progress);
    const body = `${plate.title}\n모은 그림 ${held} / ${TOTAL_STAGES}\n점수 ${this.state.score}점`;
    if (stage >= TOTAL_STAGES) {
      this.overlay.open({
        title: "그림을 모두 모았어요",
        body: `${body}\n99장이 전부 갤러리에 있습니다.`,
        primary: { label: "갤러리 보기", action: () => this.showGallery() },
        secondary: { label: "모드 선택", action: () => this.showTitle() },
      });
      return;
    }
    this.overlay.open({
      title: "그림을 얻었어요",
      body,
      primary: { label: "다음 스테이지", action: () => this.startStage(stage + 1) },
      secondary: { label: "갤러리 보기", action: () => this.showGallery() },
    });
  }

  private playChapter(chapter: Chapter, stage: number): void {
    this.flow.enter("story");
    this.show("story");
    this.story.play(chapter, () => {
      if (stage >= TOTAL_STAGES) {
        this.showTitle();
        return;
      }
      this.startStage(stage + 1);
    });
  }

  private showSettings(): void {
    if (this.flow.current !== "settings") this.flow.enter("settings");
    this.overlay.open({
      title: "설정",
      body: `사운드 ${this.settings.soundOn ? "켜짐" : "꺼짐"}`,
      primary: {
        label: this.settings.soundOn ? "사운드 끄기" : "사운드 켜기",
        action: () => {
          this.settings = { ...this.settings, soundOn: !this.settings.soundOn };
          saveSettings(this.settings);
          this.applySettings();
          this.showSettings();
        },
      },
      secondary: { label: "닫기", action: () => this.showTitle() },
    });
  }

  private applySettings(): void {
    document.documentElement.dataset.sound = this.settings.soundOn ? "on" : "off";
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

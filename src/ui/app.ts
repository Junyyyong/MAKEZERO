import { aliveCount, areConnected } from "../game/board";
import { commitSelection, isStuck, newGame, stars, tick, useHint, useShuffle } from "../game/game";
import type { GameState } from "../game/game";
import {
  ENDLESS_CONFIG,
  TIME_ATTACK_CONFIG,
  TOTAL_STAGES,
  chapterFor,
  isChapterFinale,
  stageConfig,
} from "../game/story";
import type { Chapter } from "../game/story";
import { isSelectionValid } from "../game/rules";
import type { GameMode, RunConfig } from "../game/types";
import { BoardView } from "./boardView";
import { loadDaily, loadProgress, saveDaily, saveProgress } from "./storage";
import type { DailyStats, Progress } from "./storage";

const RULES_TEXT = `숫자를 이어서 합이 <b>정확히 10</b>이 되면 지워집니다.
2개부터 5개까지 이을 수 있고, 길수록 점수가 큽니다.
<span class="rule-num">2개 10점 · 3개 30점<br />4개 70점 · 5개 150점</span>
가로·세로·대각선으로 <b>직선</b>을 그어 사이에 남은 숫자가 없으면 이어집니다. 지워진 칸은 몇 칸이든 통과합니다.
막히면 섞기로 남은 숫자의 자리를 바꾸세요.`;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

type Screen = "title" | "game" | "story";

export class App {
  private state: GameState;
  private daily: DailyStats;
  private progress: Progress;
  private readonly view: BoardView;

  /** Story beat playback: the chapter being read and how far through it we are. */
  private pendingChapter: Chapter | null = null;
  private storyLine = 0;
  private storyReturn: "title" | "nextStage" = "title";

  private frame: number | undefined;
  private lastFrameMs = 0;

  private readonly screens: Record<Screen, HTMLElement> = {
    title: el("screen-title"),
    game: el("screen-game"),
    story: el("screen-story"),
  };

  private readonly scoreEl = el<HTMLDivElement>("score");
  private readonly chipLeft = el<HTMLDivElement>("chip-left");
  private readonly chipRight = el<HTMLDivElement>("chip-right");
  private readonly timerBar = el<HTMLDivElement>("timer-bar");
  private readonly timerFill = el<HTMLSpanElement>("timer-fill");
  private readonly noticeEl = el<HTMLParagraphElement>("notice");
  private readonly shuffleBtn = el<HTMLButtonElement>("btn-shuffle");
  private readonly hintBtn = el<HTMLButtonElement>("btn-hint");
  private readonly shuffleBadge = el<HTMLSpanElement>("badge-shuffle");
  private readonly hintBadge = el<HTMLSpanElement>("badge-hint");
  private readonly overlay = el<HTMLDivElement>("overlay");
  private readonly overlayTitle = el<HTMLHeadingElement>("overlay-title");
  private readonly overlayBody = el<HTMLParagraphElement>("overlay-body");
  private readonly primaryBtn = el<HTMLButtonElement>("btn-primary");
  private readonly secondaryBtn = el<HTMLButtonElement>("btn-secondary");

  constructor() {
    this.daily = loadDaily();
    this.progress = loadProgress();
    this.state = newGame(ENDLESS_CONFIG, 1);

    this.view = new BoardView({
      wrap: el("board-wrap"),
      grid: el("board"),
      isConnected: (a, b) => areConnected(this.state.board, a, b),
      isValid: (selection) => isSelectionValid(this.state.board, selection),
      onCommit: (selection) => this.commit(selection),
    });

    this.bindEvents();
    this.showTitle();
  }

  private bindEvents(): void {
    for (const mode of ["story", "timeAttack", "endless"] as const) {
      el<HTMLButtonElement>(`mode-${mode}`).addEventListener("click", () => this.startMode(mode));
    }
    el<HTMLButtonElement>("btn-title-rules").addEventListener("click", () => this.showRules());
    el<HTMLButtonElement>("btn-help").addEventListener("click", () => this.showRules());
    el<HTMLButtonElement>("btn-back").addEventListener("click", () => this.showTitle());
    el<HTMLButtonElement>("btn-story-next").addEventListener("click", () => this.advanceStory());
    this.shuffleBtn.addEventListener("click", () => this.onShuffle());
    this.hintBtn.addEventListener("click", () => this.onHint());
  }

  // ---- screens -----------------------------------------------------------

  private show(screen: Screen): void {
    for (const [name, node] of Object.entries(this.screens)) {
      node.classList.toggle("hidden", name !== screen);
    }
    this.overlay.classList.add("hidden");
  }

  private showTitle(): void {
    this.stopClock();
    this.view.setInteractive(false);
    this.daily = loadDaily();
    this.progress = loadProgress();

    const stage = this.progress.stage;
    el("desc-story").textContent =
      stage > TOTAL_STAGES
        ? "모두 클리어"
        : `스테이지 ${stage} · ${chapterFor(stage).title}`;
    el("desc-timeAttack").textContent = this.progress.bestTimeAttack
      ? `60초 · 최고 ${this.progress.bestTimeAttack}점`
      : "60초 도전";
    el("desc-endless").textContent = this.progress.bestEndless
      ? `최고 ${this.progress.bestEndless}점`
      : "끝까지 지우기";

    this.show("title");
  }

  private startMode(mode: GameMode): void {
    if (mode === "story") {
      this.startStage(Math.min(this.progress.stage, TOTAL_STAGES));
      return;
    }
    if (mode === "endless") {
      this.daily = { ...loadDaily(), games: loadDaily().games + 1 };
      saveDaily(this.daily);
    }
    this.beginRun(mode === "timeAttack" ? TIME_ATTACK_CONFIG : ENDLESS_CONFIG);
  }

  private startStage(stage: number): void {
    this.beginRun(stageConfig(stage));
  }

  private beginRun(config: RunConfig): void {
    this.state = newGame(config);
    this.view.setBoard(this.state.board);
    this.view.setInteractive(true);
    this.show("game");
    this.render();
    if (config.timeLimitMs !== undefined) this.startClock();
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
    this.view.setBoard(state.board);
    this.recordScore();
    this.render();
  }

  private onShuffle(): void {
    if (this.state.shufflesLeft === 0 || this.state.status !== "playing") return;
    this.view.clearHint();
    this.state = useShuffle(this.state);
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

  // ---- rendering ---------------------------------------------------------

  private render(): void {
    const { config, score, shufflesLeft, hintsLeft, status, remainingMs } = this.state;
    this.view.render();
    this.scoreEl.textContent = String(score);
    this.shuffleBadge.textContent = String(shufflesLeft);
    this.hintBadge.textContent = String(hintsLeft);
    this.shuffleBtn.disabled = shufflesLeft === 0 || status !== "playing";
    this.hintBtn.disabled = hintsLeft === 0 || status !== "playing";
    this.shuffleBtn.classList.toggle("hidden", config.shuffles === 0);
    this.hintBtn.classList.toggle("hidden", config.hints === 0);

    const timed = config.timeLimitMs !== undefined;
    this.timerBar.classList.toggle("hidden", !timed);
    if (timed) {
      const ratio = Math.max(0, remainingMs / config.timeLimitMs!);
      this.timerFill.style.transform = `scaleX(${ratio})`;
      this.timerBar.classList.toggle("urgent", remainingMs <= 10_000);
    }

    if (config.mode === "story") {
      const stage = config.stage ?? 1;
      this.chipLeft.textContent = `스테이지 ${stage}`;
      this.chipRight.textContent = chapterFor(stage).title;
    } else if (config.mode === "timeAttack") {
      this.chipLeft.textContent = "타임어택";
      this.chipRight.textContent = formatClock(remainingMs);
    } else {
      this.chipLeft.textContent = `게임 ${this.daily.games}`;
      this.chipRight.textContent = `오늘 ${Math.max(this.daily.best, score)} ♛`;
    }

    const left = aliveCount(this.state.board);
    const stuck = isStuck(this.state);
    this.shuffleBtn.classList.toggle("urge", stuck && shufflesLeft > 0);
    if (stuck) {
      this.noticeEl.textContent =
        shufflesLeft > 0 ? "이을 수 있는 게 없어요. 섞어보세요." : "더 이상 이을 수 없어요.";
    } else if (config.mode === "story") {
      const [one, two, three] = config.starTargets;
      const earned = stars(this.state);
      this.noticeEl.textContent =
        `${left}개 남음 · ${App.starLine(earned)} ` +
        `(★ ${one} · ★★ ${two} · ★★★ ${three} 이하)`;
    } else {
      this.noticeEl.textContent = `${left}개 남음`;
    }

    if (status !== "playing") this.finishRun();
  }

  private finishRun(): void {
    this.stopClock();
    this.view.setInteractive(false);
    const { config, status, score } = this.state;

    if (config.mode === "story") {
      this.finishStage(config.stage ?? 1, stars(this.state));
      return;
    }
    if (config.mode === "timeAttack") {
      this.openOverlay({
        title: "시간 종료",
        body: `점수 ${score}점\n최고 ${this.progress.bestTimeAttack}점`,
        primary: { label: "다시 하기", action: () => this.startMode("timeAttack") },
      });
      return;
    }
    this.openOverlay({
      title: status === "won" ? "클리어!" : "게임 종료",
      body:
        status === "won"
          ? `보드를 모두 지웠습니다.\n점수 ${score}점`
          : `점수 ${score}점\n오늘 최고 ${this.daily.best}점`,
      primary: { label: "다시 하기", action: () => this.startMode("endless") },
    });
  }

  private static starLine(earned: number): string {
    return "★★★".slice(0, earned) + "☆☆☆".slice(0, 3 - earned);
  }

  /** Grades the stage, unlocks the next one, then plays any chapter beat. */
  private finishStage(stage: number, earned: number): void {
    const left = aliveCount(this.state.board);
    const targets = this.state.config.starTargets;

    if (earned === 0) {
      this.openOverlay({
        title: "아쉬워요",
        body: `${App.starLine(0)}\n${left}개가 남았어요.\n별 하나까지 ${targets[0]}개 이하로 줄여야 해요.`,
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
      this.storyReturn = stage >= TOTAL_STAGES ? "title" : "nextStage";
      this.playChapter(chapter);
      return;
    }

    const summary = `${App.starLine(earned)}\n${left}개 남음 · 점수 ${this.state.score}점`;
    if (stage >= TOTAL_STAGES) {
      this.openOverlay({
        title: "완주!",
        body: `${summary}\n모든 스테이지를 끝냈습니다.`,
        primary: { label: "모드 선택", action: () => this.showTitle() },
      });
      return;
    }
    this.openOverlay({
      title: earned === 3 ? "완벽해요!" : "스테이지 클리어",
      body: summary,
      primary: { label: "다음 스테이지", action: () => this.startStage(stage + 1) },
      secondary:
        earned < 3
          ? { label: "다시 도전", action: () => this.startStage(stage) }
          : undefined,
    });
  }

  // ---- story beats -------------------------------------------------------

  private playChapter(chapter: Chapter): void {
    this.pendingChapter = chapter;
    this.storyLine = 0;
    this.show("story");
    this.renderStory();
  }

  private renderStory(): void {
    const chapter = this.pendingChapter;
    if (!chapter) return;
    const portrait = el<HTMLImageElement>("story-portrait");
    portrait.src = chapter.character;
    portrait.alt = chapter.characterName;
    el("story-title").textContent = chapter.title;
    el("story-name").textContent = chapter.characterName;
    el("story-line").textContent = chapter.lines[this.storyLine] ?? "";
    const last = this.storyLine >= chapter.lines.length - 1;
    el<HTMLButtonElement>("btn-story-next").textContent = last ? "계속하기" : "다음";
  }

  private advanceStory(): void {
    const chapter = this.pendingChapter;
    if (!chapter) return;
    if (this.storyLine < chapter.lines.length - 1) {
      this.storyLine += 1;
      this.renderStory();
      return;
    }
    this.pendingChapter = null;
    const stage = this.state.config.stage ?? 1;
    if (this.storyReturn === "nextStage" && stage < TOTAL_STAGES) {
      this.startStage(stage + 1);
      return;
    }
    this.showTitle();
  }

  // ---- overlay -----------------------------------------------------------

  private openOverlay(spec: {
    title: string;
    body: string;
    html?: boolean;
    primary: { label: string; action: () => void };
    secondary?: { label: string; action: () => void };
  }): void {
    this.overlayTitle.textContent = spec.title;
    if (spec.html) this.overlayBody.innerHTML = spec.body;
    else this.overlayBody.textContent = spec.body;

    this.primaryBtn.textContent = spec.primary.label;
    this.primaryBtn.onclick = () => {
      this.overlay.classList.add("hidden");
      spec.primary.action();
    };

    const secondary = spec.secondary ?? { label: "모드 선택", action: () => this.showTitle() };
    this.secondaryBtn.textContent = secondary.label;
    this.secondaryBtn.onclick = () => {
      this.overlay.classList.add("hidden");
      secondary.action();
    };
    this.overlay.classList.remove("hidden");
  }

  private showRules(): void {
    const onTitle = !this.screens.title.classList.contains("hidden");
    this.openOverlay({
      title: "규칙",
      body: RULES_TEXT,
      html: true,
      primary: {
        label: "닫기",
        action: () => {
          // A finished run keeps its result panel; the rules just sat on top.
          if (!onTitle && this.state.status !== "playing") this.finishRun();
        },
      },
      secondary: { label: "모드 선택", action: () => this.showTitle() },
    });
  }
}

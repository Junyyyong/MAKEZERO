import { aliveCount, collapseRows, createBoard, hasArithmeticMove, shuffleSurvivors } from "./board";
import { findHint, hasAnyMove } from "./hint";
import { mulberry32, randomSeed } from "./rng";
import { evaluateSelection } from "./rules";
import { ENDLESS_CONFIG, starsFor } from "./story";
import type { Board, MatchResult, RunConfig } from "./types";

export type GameStatus = "playing" | "won" | "lost" | "timeUp";

export interface GameState {
  config: RunConfig;
  board: Board;
  score: number;
  shufflesLeft: number;
  hintsLeft: number;
  status: GameStatus;
  /** Tiles the board started with, so grades stay comparable across sizes. */
  startingCells: number;
  /** Time attack only; milliseconds still on the clock. */
  remainingMs: number;
  /** Consumed and advanced whenever fresh tiles are needed. */
  nextSeed: number;
}

export interface CommitOutcome {
  state: GameState;
  result: MatchResult;
  rowsRemoved: number;
}

const MAX_DEAL_ATTEMPTS = 20;

function dealBoard(config: RunConfig, seed: number): { board: Board; nextSeed: number } {
  for (let attempt = 0; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    const board = createBoard(mulberry32(seed + attempt), config.width, config.rows, config.groupWeights);
    if (hasAnyMove(board)) return { board, nextSeed: seed + attempt + 1 };
  }
  return {
    board: createBoard(mulberry32(seed), config.width, config.rows, config.groupWeights),
    nextSeed: seed + MAX_DEAL_ATTEMPTS,
  };
}

function settleStatus(state: GameState): GameState {
  if (state.config.mode === "timeAttack") {
    if (state.remainingMs <= 0) return { ...state, status: "timeUp" };
    if (aliveCount(state.board) === 0 || !hasAnyMove(state.board)) {
      const dealt = dealBoard(state.config, state.nextSeed);
      return { ...state, board: dealt.board, nextSeed: dealt.nextSeed, status: "playing" };
    }
    return { ...state, status: "playing" };
  }
  if (aliveCount(state.board) === 0) return { ...state, status: "won" };
  if (hasAnyMove(state.board)) return { ...state, status: "playing" };
  // A shuffle only moves tiles, so it cannot rescue a board whose remaining
  // numbers have no way to make ten at all.
  if (state.shufflesLeft > 0 && hasArithmeticMove(state.board)) {
    return { ...state, status: "playing" };
  }
  return { ...state, status: "lost" };
}

export function newGame(config: RunConfig = ENDLESS_CONFIG, seed: number = randomSeed()): GameState {
  const { board, nextSeed } = dealBoard(config, seed);
  return {
    config,
    board,
    score: 0,
    shufflesLeft: config.shuffles,
    hintsLeft: config.hints,
    status: "playing",
    startingCells: board.cells.length,
    remainingMs: config.timeLimitMs ?? 0,
    nextSeed,
  };
}

/** Advances the time-attack clock. A no-op in the untimed modes. */
export function tick(state: GameState, deltaMs: number): GameState {
  if (state.status !== "playing" || state.config.timeLimitMs === undefined) return state;
  const remainingMs = Math.max(0, state.remainingMs - deltaMs);
  if (remainingMs === state.remainingMs) return state;
  if (remainingMs === 0) return { ...state, remainingMs, status: "timeUp" };
  return { ...state, remainingMs };
}

export function commitSelection(state: GameState, indices: readonly number[]): CommitOutcome {
  const result = evaluateSelection(state.board, indices);
  if (!result.ok || state.status !== "playing") {
    return { state, result, rowsRemoved: 0 };
  }
  const cells = state.board.cells.map((cell) => ({ ...cell }));
  for (const i of indices) cells[i]!.cleared = true;
  const { board, removed } = collapseRows({ width: state.board.width, cells });
  const next = settleStatus({ ...state, board, score: state.score + result.score });
  return { state: next, result, rowsRemoved: removed };
}

/** Rearranges the surviving tiles without changing which numbers are on them. */
export function useShuffle(state: GameState): GameState {
  if (state.status !== "playing" || state.shufflesLeft === 0) return state;
  return settleStatus({
    ...state,
    board: shuffleSurvivors(state.board, mulberry32(state.nextSeed)),
    shufflesLeft: state.shufflesLeft - 1,
    nextSeed: state.nextSeed + 1,
  });
}

export interface HintOutcome {
  state: GameState;
  indices: number[] | null;
}

export function useHint(state: GameState): HintOutcome {
  if (state.status !== "playing" || state.hintsLeft === 0) return { state, indices: null };
  const indices = findHint(state.board);
  if (!indices) return { state, indices: null };
  return { state: { ...state, hintsLeft: state.hintsLeft - 1 }, indices };
}

/** True when the player can only make progress by spending a shuffle. */
export function isStuck(state: GameState): boolean {
  return state.status === "playing" && !hasAnyMove(state.board);
}

/** 0 to 3, from how few tiles the player left standing. */
export function stars(state: GameState): number {
  return starsFor(state.config.starTargets, aliveCount(state.board));
}

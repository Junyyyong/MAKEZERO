import { aliveCount, collapseRows, createBoard } from "./board";
import { findHint, hasAnyMove } from "./solver";
import { mulberry32, randomSeed } from "./rng";
import { evaluateSelection } from "./rules";
import type { Board, MatchResult, RunConfig } from "./types";

export type GameStatus = "playing" | "won" | "lost" | "timeUp";

export interface GameState {
  config: RunConfig;
  board: Board;
  score: number;
  hintsLeft: number;
  status: GameStatus;
  /** Tiles the board was dealt with, before anything was cleared. */
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
  // Position does not matter, so a run ends exactly when no values left on the
  // board can make ten. There is nothing a rearrangement could rescue.
  return { ...state, status: hasAnyMove(state.board) ? "playing" : "lost" };
}

export function newGame(config: RunConfig, seed: number = randomSeed()): GameState {
  const { board, nextSeed } = dealBoard(config, seed);
  return {
    config,
    board,
    score: 0,
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

/** 0 to 3, from how few tiles the player left standing. */
export function stars(state: GameState): number {
  const left = aliveCount(state.board);
  const [one, two, three] = state.config.starTargets;
  if (left <= three) return 3;
  if (left <= two) return 2;
  if (left <= one) return 1;
  return 0;
}

import { aliveCount, appendRemaining, collapseRows, createBoard } from "./board";
import { findHint, hasAnyMove } from "./hint";
import { mulberry32, randomSeed } from "./rng";
import { evaluateSelection } from "./rules";
import { ENDLESS_CONFIG } from "./story";
import type { Board, MatchResult, RunConfig } from "./types";

export type GameStatus = "playing" | "won" | "lost" | "timeUp";

export interface GameState {
  config: RunConfig;
  board: Board;
  score: number;
  addsLeft: number;
  hintsLeft: number;
  status: GameStatus;
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
const MAX_REFILL_ATTEMPTS = 3;

/** Deals a playable board, rerolling the rare opening with no legal move. */
function dealBoard(config: RunConfig, seed: number): { board: Board; nextSeed: number } {
  for (let attempt = 0; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    const board = createBoard(mulberry32(seed + attempt), config.rows, config.weights);
    if (hasAnyMove(board)) return { board, nextSeed: seed + attempt + 1 };
  }
  return {
    board: createBoard(mulberry32(seed), config.rows, config.weights),
    nextSeed: seed + MAX_DEAL_ATTEMPTS,
  };
}

/**
 * Time attack never ends early: a deadlock is topped up with the survivors, and
 * a board cleared outright is replaced with a fresh deal. Copying can leave the
 * board just as stuck, so give up after a few tries and deal instead.
 */
function refill(state: GameState): GameState {
  if (aliveCount(state.board) === 0) {
    const { board, nextSeed } = dealBoard(state.config, state.nextSeed);
    return { ...state, board, nextSeed };
  }
  let board = state.board;
  for (let attempt = 0; attempt < MAX_REFILL_ATTEMPTS; attempt++) {
    board = appendRemaining(board);
    if (hasAnyMove(board)) return { ...state, board };
  }
  const dealt = dealBoard(state.config, state.nextSeed);
  return { ...state, board: dealt.board, nextSeed: dealt.nextSeed };
}

function settleStatus(state: GameState): GameState {
  if (state.config.mode === "timeAttack") {
    if (state.remainingMs <= 0) return { ...state, status: "timeUp" };
    if (aliveCount(state.board) === 0 || !hasAnyMove(state.board)) {
      return { ...refill(state), status: "playing" };
    }
    return { ...state, status: "playing" };
  }
  if (aliveCount(state.board) === 0) return { ...state, status: "won" };
  if (state.addsLeft === 0 && !hasAnyMove(state.board)) return { ...state, status: "lost" };
  return { ...state, status: "playing" };
}

export function newGame(config: RunConfig = ENDLESS_CONFIG, seed: number = randomSeed()): GameState {
  const { board, nextSeed } = dealBoard(config, seed);
  return {
    config,
    board,
    score: 0,
    addsLeft: config.adds,
    hintsLeft: config.hints,
    status: "playing",
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

export function useAdd(state: GameState): GameState {
  if (state.status !== "playing" || state.addsLeft === 0) return state;
  return settleStatus({
    ...state,
    board: appendRemaining(state.board),
    addsLeft: state.addsLeft - 1,
  });
}

export interface HintOutcome {
  state: GameState;
  indices: number[] | null;
}

export function useHint(state: GameState): HintOutcome {
  if (state.status !== "playing" || state.hintsLeft === 0) {
    return { state, indices: null };
  }
  const indices = findHint(state.board);
  if (!indices) return { state, indices: null };
  return { state: { ...state, hintsLeft: state.hintsLeft - 1 }, indices };
}

/** True when the player can only make progress by spending an add. */
export function isStuck(state: GameState): boolean {
  return state.status === "playing" && !hasAnyMove(state.board);
}

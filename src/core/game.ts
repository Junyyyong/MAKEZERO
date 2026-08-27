import {
  aliveCount,
  collapseRows,
  createBoard,
  createDeck,
  createSparseBoard,
  emptyIndices,
  placeGroup,
} from "./board";
import { findHint, hasAnyMove } from "./solver";
import { mulberry32, randomSeed } from "./rng";
import { evaluateSelection } from "./rules";
import { MIN_SELECTION } from "./rules";
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
  /** Spawn modes only; milliseconds until the next batch of tiles arrives. */
  untilSpawnMs: number;
  /** Batches delivered so far, which is what shortens the gap between them. */
  spawnCount: number;
  /** Consumed and advanced whenever fresh tiles are needed. */
  nextSeed: number;
}

export interface CommitOutcome {
  state: GameState;
  result: MatchResult;
  rowsRemoved: number;
}

const MAX_DEAL_ATTEMPTS = 20;

function deal(config: RunConfig, rngSeed: number): Board {
  const rng = mulberry32(rngSeed);
  if (config.deck) return createDeck(rng, config.width, config.deck);
  return config.spawn
    ? createSparseBoard(rng, config.width, config.rows, config.spawn.initialFill, config.groupWeights)
    : createBoard(rng, config.width, config.rows, config.groupWeights);
}

function dealBoard(config: RunConfig, seed: number): { board: Board; nextSeed: number } {
  for (let attempt = 0; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    const board = deal(config, seed + attempt);
    if (hasAnyMove(board)) return { board, nextSeed: seed + attempt + 1 };
  }
  return { board: deal(config, seed), nextSeed: seed + MAX_DEAL_ATTEMPTS };
}

/** How long until the next batch, given how many have already landed. */
export function spawnIntervalMs(config: RunConfig, spawnCount: number): number {
  const spawn = config.spawn;
  if (!spawn) return Infinity;
  return Math.max(spawn.minIntervalMs, spawn.startIntervalMs - spawn.rampMs * spawnCount);
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
  if (state.config.spawn) {
    // More tiles are always on the way, so an empty board is a good moment
    // rather than a win, and having no move right now may be temporary.
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
    untilSpawnMs: spawnIntervalMs(config, 0),
    spawnCount: 0,
    nextSeed,
  };
}

/**
 * Advances whatever is running on a clock: the time-attack countdown, and the
 * timer that drops fresh tiles onto the board. A no-op in the untimed modes.
 */
export function tick(state: GameState, deltaMs: number): GameState {
  if (state.status !== "playing") return state;
  let next = state;

  if (next.config.timeLimitMs !== undefined) {
    const remainingMs = Math.max(0, next.remainingMs - deltaMs);
    if (remainingMs !== next.remainingMs) {
      next = remainingMs === 0 ? { ...next, remainingMs, status: "timeUp" } : { ...next, remainingMs };
    }
    if (next.status !== "playing") return next;
  }

  if (next.config.spawn) {
    const untilSpawnMs = next.untilSpawnMs - deltaMs;
    next = untilSpawnMs > 0 ? { ...next, untilSpawnMs } : spawnBatch(next);
  }
  return next;
}

/**
 * Drops the next batch of tiles. The run ends here, and only here: once the
 * board is packed tightly enough that a batch has nowhere to land.
 */
function spawnBatch(state: GameState): GameState {
  const config = state.config;
  const cells = state.board.cells.map((cell) => ({ ...cell }));
  const board: Board = { width: state.board.width, cells };

  if (emptyIndices(board).length < MIN_SELECTION) {
    return { ...state, untilSpawnMs: 0, status: "lost" };
  }
  placeGroup(board, mulberry32(state.nextSeed), config.groupWeights);

  const spawnCount = state.spawnCount + 1;
  return {
    ...state,
    board,
    spawnCount,
    untilSpawnMs: spawnIntervalMs(config, spawnCount),
    nextSeed: state.nextSeed + 1,
  };
}

export function commitSelection(state: GameState, indices: readonly number[]): CommitOutcome {
  const result = evaluateSelection(state.board, indices);
  if (!result.ok || state.status !== "playing") {
    return { state, result, rowsRemoved: 0 };
  }
  const cells = state.board.cells.map((cell) => ({ ...cell }));
  for (const i of indices) cells[i]!.cleared = true;
  // A board that tiles keep landing on is a fixed frame: cleared squares stay
  // put as landing room instead of closing up.
  const { board, removed } = state.config.spawn
    ? { board: { width: state.board.width, cells }, removed: 0 }
    : collapseRows({ width: state.board.width, cells });
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

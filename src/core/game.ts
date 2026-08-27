import {
  aliveCount,
  collapseRows,
  createBoard,
  createDeck,
  createWeightedBoard,
  createSparseBoard,
  MAX_VALUE,
  emptyIndices,
  isAlive,
  placeGroup,
  valueAt,
  valueCounts,
} from "./board";
import { canEmpty, findHint, hasAnyMove } from "./solver";
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
  /** Moves still available to take back. */
  undosLeft: number;
  /** Blocks still available to break into smaller ones. */
  splitsLeft: number;
  /**
   * The state one move ago, or undefined at the start of a run.
   *
   * Kept as a chain rather than a list so that taking a move back is just
   * stepping to it. Only built when the run allows undos at all, so the modes
   * that do not carry no history.
   */
  previous?: GameState;
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
/** Most pieces one block may be broken into. Four keeps the board readable. */
const MAX_SPLIT_PARTS = 4;
/** How many random breaks to try before giving up on a block. */
const SPLIT_ATTEMPTS = 24;

function deal(config: RunConfig, rngSeed: number): Board {
  const rng = mulberry32(rngSeed);
  if (config.deck) return createDeck(rng, config.width, config.deck);
  if (config.digitWeights && !config.spawn) {
    return createWeightedBoard(rng, config.width, config.rows, config.digitWeights);
  }
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
    undosLeft: config.undos,
    splitsLeft: config.splits,
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
  const { board, removed } =
    state.config.spawn || state.config.keepBoard
      ? { board: { width: state.board.width, cells }, removed: 0 }
      : collapseRows({ width: state.board.width, cells });
  const next = settleStatus({
    ...state,
    board,
    score: state.score + result.score,
    previous: state.config.undos > 0 ? state : undefined,
  });
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

/**
 * Takes back the last move.
 *
 * Allowed after the board has gone dead, which is the whole reason it exists:
 * a story board can always be emptied, but one careless move can strand tiles
 * that nothing will ever clear, and the player deserves to see which move it
 * was. Everything goes back with it — the score, the tiles, the row that
 * closed up — except the count of how many take-backs are left.
 */
export function undo(state: GameState): GameState {
  if (state.undosLeft <= 0 || !state.previous) return state;
  return { ...state.previous, undosLeft: state.undosLeft - 1, status: "playing" };
}

/**
 * Breaks one block into smaller ones that add up to the same thing.
 *
 * How it breaks is random, and deliberately so — the item is "break this",
 * not "turn this into what I want". The pieces that do not stay in the
 * original square land in squares that have already been cleared, which is
 * the honest cost: a split covers part of the picture back up.
 *
 * The one thing that is *not* left to chance is whether the board survives it.
 * A split keeps the total, so it cannot break the arithmetic — but a clear may
 * hold at most five blocks, and breaking a block inside a group of four can
 * leave a group of six that no single clear can take. So every candidate split
 * is checked against `canEmpty` before it is allowed, and rolled again if it
 * would strand the board. The promise that a story board can always be emptied
 * survives the item.
 */
export function canSplit(state: GameState): boolean {
  return (
    state.status === "playing" &&
    state.splitsLeft > 0 &&
    // The pieces have to land somewhere, and the only room on the board is
    // squares that have already been cleared. A full board cannot be split.
    emptyIndices(state.board).length > 0
  );
}

export function splitTile(state: GameState, index: number, rngSeed?: number): GameState {
  if (state.status !== "playing" || state.splitsLeft <= 0) return state;
  if (!isAlive(state.board, index)) return state;

  const value = valueAt(state.board, index);
  if (value < 2) return state;

  const holes = emptyIndices(state.board);
  const rng = mulberry32(rngSeed ?? state.nextSeed);
  const most = Math.min(value, MAX_SPLIT_PARTS, holes.length + 1);
  if (most < 2) return state;

  for (let attempt = 0; attempt < SPLIT_ATTEMPTS; attempt++) {
    const parts = splitValue(rng, value, 2 + Math.floor(rng() * (most - 1)));
    const counts = valueCounts(state.board) as number[];
    counts[value] = (counts[value] ?? 0) - 1;
    for (const part of parts) counts[part] = (counts[part] ?? 0) + 1;
    if (!canEmpty(counts)) continue;

    const cells = state.board.cells.map((cell) => ({ ...cell }));
    cells[index] = { value: parts[0]!, cleared: false };
    const free = [...holes];
    for (const part of parts.slice(1)) {
      const at = free.splice(Math.floor(rng() * free.length), 1)[0]!;
      cells[at] = { value: part, cleared: false };
    }
    return settleStatus({
      ...state,
      board: { width: state.board.width, cells },
      splitsLeft: state.splitsLeft - 1,
      previous: state.config.undos > 0 ? state : undefined,
      nextSeed: state.nextSeed + 1,
    });
  }
  return state;
}

/** Breaks `value` into `parts` pieces of at least one each, at random. */
function splitValue(rng: () => number, value: number, parts: number): number[] {
  const out = new Array(parts).fill(1);
  let left = value - parts;
  while (left > 0) {
    const at = Math.floor(rng() * parts);
    if (out[at]! >= MAX_VALUE) continue;
    out[at]! += 1;
    left--;
  }
  return out;
}

/** Hints, take-backs and splits spent so far. Three stars asks for none of either. */
export function assistsUsed(state: GameState): number {
  return (
    state.config.hints -
    state.hintsLeft +
    (state.config.undos - state.undosLeft) +
    (state.config.splits - state.splitsLeft)
  );
}

/**
 * 0 to 3.
 *
 * Story is scored on emptying the board, because a story board is always dealt
 * so that it can be: three stars for doing it unaided, two for doing it with a
 * hint or a take-back, and one as consolation for a board that came close. The
 * other modes have no stars, and grade on how few tiles were left.
 */
export function stars(state: GameState): number {
  const left = aliveCount(state.board);
  const [one, two, three] = state.config.starTargets;
  if (state.config.mode === "story") {
    if (left > 0) return left <= one ? 1 : 0;
    return assistsUsed(state) === 0 ? 3 : 2;
  }
  if (left <= three) return 3;
  if (left <= two) return 2;
  if (left <= one) return 1;
  return 0;
}

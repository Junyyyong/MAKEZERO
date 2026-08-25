import {
  INITIAL_ROWS,
  aliveCount,
  appendRemaining,
  collapseRows,
  createBoard,
} from "./board";
import { findHint, hasAnyMove } from "./hint";
import { mulberry32, randomSeed } from "./rng";
import { evaluateSelection } from "./rules";
import type { Board, MatchResult } from "./types";

export const INITIAL_ADDS = 6;
export const INITIAL_HINTS = 3;

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  board: Board;
  score: number;
  addsLeft: number;
  hintsLeft: number;
  status: GameStatus;
  seed: number;
}

export interface CommitOutcome {
  state: GameState;
  result: MatchResult;
  rowsRemoved: number;
}

function settleStatus(state: GameState): GameState {
  if (aliveCount(state.board) === 0) return { ...state, status: "won" };
  if (state.addsLeft === 0 && !hasAnyMove(state.board)) {
    return { ...state, status: "lost" };
  }
  return { ...state, status: "playing" };
}

export function newGame(seed: number = randomSeed()): GameState {
  // A dead opening board is possible in principle; reroll rather than ship it.
  let board = createBoard(mulberry32(seed), INITIAL_ROWS);
  for (let attempt = 1; attempt < 20 && !hasAnyMove(board); attempt++) {
    board = createBoard(mulberry32(seed + attempt), INITIAL_ROWS);
  }
  return {
    board,
    score: 0,
    addsLeft: INITIAL_ADDS,
    hintsLeft: INITIAL_HINTS,
    status: "playing",
    seed,
  };
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

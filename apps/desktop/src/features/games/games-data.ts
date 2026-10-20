import useSWR from "swr";
import { api } from "../../shared/lib/ipc";

/** The quiz: a round under way, or the topics to start one. */
export function useQuiz() {
  return useSWR("quiz", () => api.quizGet());
}

/** Today's word puzzle, shared by the hub card and the game. */
export function useShabda() {
  return useSWR("shabda", () => api.shabdaToday());
}

/** Mini Sudoku: the puzzle under way, if any, and the record. */
export function useSudoku() {
  return useSWR("sudoku", () => api.sudokuGet());
}

/** Bagh-Chal: the game under way, if any, and the record. */
export function useBagh() {
  return useSWR("bagh", () => api.baghGet());
}

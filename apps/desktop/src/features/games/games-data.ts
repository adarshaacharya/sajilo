import useSWR from "swr";
import { api } from "../../shared/lib/ipc";

/** The quiz: a round under way, or the topics to start one. */
export function useQuiz() {
  return useSWR("quiz", () => api.quizGet());
}

/** The word game, shared by the hub card and the game. */
export function useShabda() {
  return useSWR("shabda", () => api.shabdaGet());
}

/** Mini Sudoku: the puzzle under way, if any, and the record. */
export function useSudoku() {
  return useSWR("sudoku", () => api.sudokuGet());
}

/** Bagh-Chal: the game under way, if any, and the record. */
export function useBagh() {
  return useSWR("bagh", () => api.baghGet());
}

/** काटाकुटी: the game under way, if any, and the record. */
export function useKata() {
  return useSWR("kata", () => api.kataGet());
}

/** साँप-सिँढी: the game under way, if any, and the record. */
export function useSaap() {
  return useSWR("saap", () => api.saapGet());
}

/** चुङ्गी: the record, today's daily best, and today's seed. */
export function useChungi() {
  return useSWR("chungi", () => api.chungiGet());
}

/** झन्डी बुर्जा: the purse, the last roll, and the record. */
export function useJhandi() {
  return useSWR("jhandi", () => api.jhandiGet());
}

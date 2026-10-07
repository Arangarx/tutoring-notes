/** Same cap on the board-tab input and on the synced page title. */
export const BOARD_TITLE_MAX_LENGTH = 60;

export function capBoardTitle(title: string): string {
  return title.trim().slice(0, BOARD_TITLE_MAX_LENGTH);
}

/** Google Calendar connection flags for schedule sync badges and copy. */
export type GoogleCalendarUiState = {
  connected: boolean;
  reconnectRequired: boolean;
};

export const GOOGLE_CALENDAR_DISCONNECTED: GoogleCalendarUiState = {
  connected: false,
  reconnectRequired: false,
};

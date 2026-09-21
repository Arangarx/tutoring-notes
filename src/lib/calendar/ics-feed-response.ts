/** Byte-identical denial body for missing and revoked tokens (B4c). */
export const ICS_FEED_NOT_FOUND_BODY = "Not Found";

const PRIVATE_NO_STORE = "private, no-store" as const;

export function icsFeedDeniedResponse(): Response {
  return new Response(ICS_FEED_NOT_FOUND_BODY, {
    status: 404,
    headers: {
      "Cache-Control": PRIVATE_NO_STORE,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function icsFeedSuccessResponse(calendarBody: string): Response {
  return new Response(calendarBody, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": PRIVATE_NO_STORE,
    },
  });
}

export function icsFeedErrorResponse(): Response {
  return icsFeedDeniedResponse();
}

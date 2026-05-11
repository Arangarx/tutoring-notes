/**
 * @jest-environment jsdom
 */

/**
 * UI resilience tests for `<WhiteboardReplay />`.
 *
 * Sarah-pilot regression context (Apr 24 2026):
 *
 *   The review surface displayed
 *
 *     Could not load whiteboard recording: Unexpected token '<',
 *     "<!DOCTYPE "... is not valid JSON
 *
 *   to the tutor when the proxy returned an HTML body. Even after
 *   the proxy was hardened, the player itself MUST never surface raw
 *   JS parse errors — both because the proxy isn't the only fetch
 *   surface (share pages have a separate proxy), and because future
 *   storage backends could surprise us in the same way.
 *
 *   Likewise, a session ended via the new Resume-or-End gate has a
 *   valid empty events.json on disk. Without special-casing,
 *   Excalidraw would mount with zero elements and the tutor would
 *   stare at a blank canvas with no explanation. The player now
 *   shows a clear "no whiteboard activity was recorded" card for
 *   that case.
 *
 * What this suite pins:
 *   - Non-JSON 200 body → friendly message, no raw JS error.
 *   - 4xx/5xx response → uses the server's `{ error }` copy when
 *     present, generic fallback otherwise.
 *   - Valid empty events.json + no audio → "nothing recorded" card
 *     instead of mounting Excalidraw.
 *   - Loading spinner appears before the fetch resolves.
 *
 * We mock the @excalidraw/excalidraw dynamic import out so the test
 * doesn't bring in the (huge, JSDOM-incompatible) real module.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WhiteboardReplay from "@/components/whiteboard/WhiteboardReplay";

jest.mock("@excalidraw/excalidraw", () => ({
  __esModule: true,
  Excalidraw: () => null,
}));
jest.mock("@excalidraw/excalidraw/index.css", () => ({}), { virtual: true });

const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

/**
 * jsdom doesn't ship the WHATWG `Response` class. Build a minimal
 * shim that exposes the surface the player + helpers use:
 *   - `ok` (derived from status)
 *   - `status`
 *   - `headers.get(name)`
 *   - `text()` returns the body string
 *   - `json()` parses the body string (kept for parity with real
 *     Response — the player itself uses `text()` only, but the
 *     readJsonError helper falls back to JSON parsing too)
 */
function fakeResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const status = init.status ?? 200;
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

describe("<WhiteboardReplay />", () => {
  it("shows friendly message when proxy returns 200 with HTML body (Sarah repro)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse("<!DOCTYPE html><html><body>nope</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_42/events"
        title="Recording of Andrew Student1 — Apr 24"
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load whiteboard recording/i);
    // Critical: must NOT surface the raw JS parse error to the user.
    expect(alert).not.toHaveTextContent(/unexpected token/i);
    expect(alert).not.toHaveTextContent(/<!doctype/i);
    // Should explain what happened in human terms.
    expect(alert).toHaveTextContent(
      /isn't a valid whiteboard event log|deleted|misconfigured/i
    );
  });

  it("uses the server's friendly { error } copy on 502 responses", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          error:
            "The recording for this session is in an unexpected format and cannot be replayed.",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<WhiteboardReplay eventsBlobUrl="/api/whiteboard/wb_42/events" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/unexpected format/i);
    expect(alert).toHaveTextContent(/cannot be replayed/i);
  });

  it("falls back to generic message on 502 with non-JSON body", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse("not JSON either", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      })
    );

    render(<WhiteboardReplay eventsBlobUrl="/api/whiteboard/wb_42/events" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/status 502/);
  });

  it("uses the server's { error } copy on 404 responses", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({ error: "No event log recorded for this session." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<WhiteboardReplay eventsBlobUrl="/api/whiteboard/wb_42/events" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no event log recorded/i);
  });

  it("shows 'no whiteboard activity recorded' card for empty events + no audio", async () => {
    // This is the steady-state for a session ended via the Resume-
    // or-End gate. Valid JSON, valid schemaVersion, but events: [].
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-04-24T10:00:00Z",
          durationMs: 0,
          events: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_42/events"
        title="Whiteboard session"
      />
    );

    const card = await screen.findByTestId("wb-replay-empty");
    expect(card).toHaveTextContent(/no whiteboard activity was recorded/i);
    // Excalidraw should NOT have been mounted for this case — we
    // assert by absence of the replay-canvas container's testid.
    expect(screen.queryByTestId("wb-replay")).not.toBeInTheDocument();
  });

  it("includes elapsed time in the empty-card copy when durationMs > 0", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-04-24T10:00:00Z",
          durationMs: 5 * 60_000, // 5 minutes
          events: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<WhiteboardReplay eventsBlobUrl="/api/whiteboard/wb_42/events" />);

    const card = await screen.findByTestId("wb-replay-empty");
    expect(card).toHaveTextContent(/5:00 elapsed/);
  });

  it("does NOT show the empty card when audio exists (audio-only sessions are valid)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(
        JSON.stringify({
          schemaVersion: 1,
          startedAt: "2026-04-24T10:00:00Z",
          durationMs: 0,
          events: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(
      <WhiteboardReplay
        eventsBlobUrl="/api/whiteboard/wb_42/events"
        audioBlobUrl="/api/audio/admin/aud_1"
      />
    );

    // Should mount the player UI (which renders the audio element +
    // canvas), not the empty-card. The audio is the recording.
    await waitFor(() => {
      expect(screen.queryByTestId("wb-replay-empty")).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId("wb-replay")).toBeInTheDocument();
  });

  it(
    "wires the WebM duration-fix hack into the replay <audio> element (Sarah scrubber regression)",
    async () => {
      // Sarah-pilot scrubber bug, Phase 1b smoke testing.
      //
      // Symptom: the native `<audio controls>` scrubber on the
      // replay page was non-draggable on first load. Hard refresh
      // temporarily fixed it; the issue came back on subsequent
      // visits. Root cause was the long-known Chrome MediaRecorder
      // WebM duration bug (`<audio>.duration === Infinity`) — the
      // same bug `<AudioPreview>` worked around for months, but the
      // replay player never had the fix applied.
      //
      // This test pins that the helper is actually wired into the
      // replay surface. If a future refactor moves the audio
      // element or removes the helper call, this test fails fast
      // instead of silently regressing in Sarah's browser.
      fetchMock.mockResolvedValueOnce(
        fakeResponse(
          JSON.stringify({
            schemaVersion: 1,
            startedAt: "2026-05-11T00:00:00Z",
            durationMs: 60_000,
            events: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      render(
        <WhiteboardReplay
          eventsBlobUrl="/api/whiteboard/wb_42/events"
          audioBlobUrl="/api/audio/admin/aud_1"
          audioMimeType="audio/webm;codecs=opus"
        />
      );

      const audio = (await screen.findByTestId(
        "wb-replay-audio"
      )) as HTMLAudioElement;

      // jsdom defaults `duration` to NaN; override to mimic the
      // MediaRecorder WebM blob (Infinity) that triggers the hack.
      Object.defineProperty(audio, "duration", {
        configurable: true,
        get: () => Infinity,
      });

      fireEvent.loadedMetadata(audio);

      // The helper's seek-to-end hack ran iff currentTime was bumped.
      // jsdom may clamp 1e101 to a smaller value; >0 is enough to
      // prove the WebM branch fired (MP4 path leaves it at 0).
      await waitFor(() => {
        expect(audio.currentTime).toBeGreaterThan(0);
      });
    }
  );

  it(
    "scrubber catch-up runs when audio metadata loaded BEFORE listener attached (cached-load race)",
    async () => {
      // The actual root cause of the intermittent regression: on
      // soft navigations (link click, back-button), the audio
      // response comes from HTTP cache and `loadedmetadata` fires
      // synchronously when `src=` is assigned. Our React useEffect
      // attaches the listener one render-tick later — too late.
      //
      // The helper's catch-up branch reads `audio.readyState` at
      // attach time and fires the handlers manually when metadata
      // is already available. Without this, the WebM hack misses
      // and the scrubber stays inert until hard refresh slows the
      // load enough for the listener to win the race.
      fetchMock.mockResolvedValueOnce(
        fakeResponse(
          JSON.stringify({
            schemaVersion: 1,
            startedAt: "2026-05-11T00:00:00Z",
            durationMs: 60_000,
            events: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      // Pre-populate the audio element's readyState + duration
      // BEFORE the helper attaches. We accomplish this by
      // intercepting `addEventListener` — by the time the helper
      // calls it, the element already looks "loaded".
      const originalAddEventListener =
        HTMLAudioElement.prototype.addEventListener;
      const audios: HTMLAudioElement[] = [];
      HTMLAudioElement.prototype.addEventListener = function (
        this: HTMLAudioElement,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ): void {
        if (!audios.includes(this)) {
          audios.push(this);
          Object.defineProperty(this, "readyState", {
            configurable: true,
            get: () => 1 /* HAVE_METADATA */,
          });
          Object.defineProperty(this, "duration", {
            configurable: true,
            get: () => Infinity,
          });
        }
        return originalAddEventListener.call(this, type, listener, options);
      };

      try {
        render(
          <WhiteboardReplay
            eventsBlobUrl="/api/whiteboard/wb_42/events"
            audioBlobUrl="/api/audio/admin/aud_1"
            audioMimeType="audio/webm;codecs=opus"
          />
        );

        const audio = (await screen.findByTestId(
          "wb-replay-audio"
        )) as HTMLAudioElement;

        // Catch-up must have fired without us dispatching the event.
        await waitFor(() => {
          expect(audio.currentTime).toBeGreaterThan(0);
        });
      } finally {
        HTMLAudioElement.prototype.addEventListener = originalAddEventListener;
      }
    }
  );

  it("missing schemaVersion in JSON surfaces a clean schema error", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<WhiteboardReplay eventsBlobUrl="/api/whiteboard/wb_42/events" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/missing schemaVersion/i);
  });
});

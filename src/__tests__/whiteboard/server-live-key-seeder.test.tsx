/**
 * @jest-environment jsdom
 *
 * Spec: a page rendered with the server-held key hands that key to the
 * whiteboard's key readers before they run, on every device, and overrides
 * whatever the link carried. Learner devices keep no per-session key shelf
 * (only the tutor End path clears it, so a learner shelf would outlive the
 * session). Legacy sessions (no server key) pass through untouched.
 */

import { useEffect } from "react";
import { render as rtlRender } from "@testing-library/react";
import { ServerLiveKeySeeder } from "@/components/whiteboard/ServerLiveKeySeeder";

const SESSION = "11111111-2222-3333-4444-555555555555";
const SHELF = `wb-key:${SESSION}`;
const SERVER_KEY = "S".repeat(43);
const LINK_KEY = "L".repeat(43);

/** Stands in for the readers: they read the hash in a passive effect. */
function HashReader({ onRead }: { onRead: (k: string | null) => void }) {
  useEffect(() => {
    onRead(new URLSearchParams(window.location.hash.slice(1)).get("k"));
  }, [onRead]);
  return null;
}

function render(liveKey: string | null, role: "tutor" | "learner") {
  const seen: Array<string | null> = [];
  const onRead = (k: string | null) => seen.push(k);
  rtlRender(
    <ServerLiveKeySeeder sessionId={SESSION} liveKey={liveKey} role={role}>
      <HashReader onRead={onRead} />
    </ServerLiveKeySeeder>
  ).unmount();
  return seen;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/join/x");
  window.localStorage.clear();
});

describe("ServerLiveKeySeeder", () => {
  it.each(["tutor", "learner"] as const)(
    "%s: the reader's first look already sees the server key, even with no link",
    (role) => {
      expect(render(SERVER_KEY, role)).toEqual([SERVER_KEY]);
    }
  );

  it("the server key wins over a different key in the link", () => {
    window.history.replaceState(null, "", `/join/x#k=${LINK_KEY}`);
    expect(render(SERVER_KEY, "learner")).toEqual([SERVER_KEY]);
  });

  it("learner devices keep no key shelf", () => {
    render(SERVER_KEY, "learner");
    expect(window.localStorage.getItem(SHELF)).toBeNull();
  });

  it("the tutor device shelves the key for reload recovery", () => {
    render(SERVER_KEY, "tutor");
    expect(window.localStorage.getItem(SHELF)).toBe(SERVER_KEY);
  });

  it("legacy sessions leave the link key and storage untouched", () => {
    window.history.replaceState(null, "", `/join/x#k=${LINK_KEY}`);
    expect(render(null, "learner")).toEqual([LINK_KEY]);
    expect(window.localStorage.getItem(SHELF)).toBeNull();
  });
});

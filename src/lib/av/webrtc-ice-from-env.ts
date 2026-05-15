/**
 * Browser ICE server list for `RTCPeerConnection`.
 *
 * Phase 4c field note: STUN-only (`DEFAULT_ICE_SERVERS` in peer-mesh)
 * often fails for **phone ↔ home Wi‑Fi** or symmetric NAT. When that
 * happens, configure a hosted TURN provider and set:
 *
 *   `NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON`
 *
 * to a JSON array of `RTCIceServer` objects. Parsed entries are
 * **appended** after the default public STUN servers so basic discovery
 * still works if the JSON is TURN-only.
 *
 * Example (credentials from your TURN host’s API):
 * `[{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]`
 */

import { DEFAULT_ICE_SERVERS } from "@/lib/av/peer-mesh";

function parseExtraIceServers(raw: string): RTCIceServer[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const extra: RTCIceServer[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.urls === "string") {
      const username =
        typeof rec.username === "string" ? rec.username : undefined;
      const credential =
        typeof rec.credential === "string" ? rec.credential : undefined;
      if (username !== undefined && credential !== undefined) {
        extra.push({ urls: rec.urls, username, credential });
      } else {
        extra.push({ urls: rec.urls });
      }
      continue;
    }
    if (
      Array.isArray(rec.urls) &&
      rec.urls.length > 0 &&
      rec.urls.every((u) => typeof u === "string")
    ) {
      const urls = rec.urls as string[];
      const username =
        typeof rec.username === "string" ? rec.username : undefined;
      const credential =
        typeof rec.credential === "string" ? rec.credential : undefined;
      if (username !== undefined && credential !== undefined) {
        extra.push({ urls, username, credential });
      } else {
        extra.push({ urls });
      }
    }
  }
  return extra.length > 0 ? extra : null;
}

export function getIceServersForBrowser(): ReadonlyArray<RTCIceServer> {
  const raw =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON
      : undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    return DEFAULT_ICE_SERVERS;
  }
  const extra = parseExtraIceServers(raw);
  if (!extra) return DEFAULT_ICE_SERVERS;
  return [...DEFAULT_ICE_SERVERS, ...extra];
}

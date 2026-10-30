/**
 * Self-test for the relay probe's scene-payload detector (W24 red evidence).
 *
 * No socket.io server package is installed here, so the "a relay that replays a
 * scene" red case is a synthetic event list built from the relay's documented
 * wire shape (`client-broadcast(encryptedData, iv)`), not from the relay code.
 * The live probe against the real relay is exercised in the C0 self-test spec.
 */
import { findScenePayloadEvents, type RelayEvent } from "../../tests/helpers/relay-probe";

const cleanHandshake: RelayEvent[] = [
  { name: "init-room", args: [] },
  { name: "first-in-room", args: [] },
  { name: "room-user-change", args: [["abcDEF123_-socketid0001"]] },
];

describe("relay probe: findScenePayloadEvents", () => {
  test("a clean join handshake has no scene payload", () => {
    expect(findScenePayloadEvents(cleanHandshake)).toEqual([]);
  });

  test("a relay that replays a scene to the joiner is flagged (client-broadcast)", () => {
    const replay: RelayEvent = {
      name: "client-broadcast",
      args: [new ArrayBuffer(4096), new Uint8Array(12)],
    };
    expect(findScenePayloadEvents([...cleanHandshake, replay])).toEqual([replay]);
  });

  test("a handshake event smuggling a large payload is flagged", () => {
    const big: RelayEvent = { name: "room-user-change", args: ["x".repeat(5000)] };
    expect(findScenePayloadEvents([big])).toEqual([big]);
    const obj: RelayEvent = { name: "init-room", args: [{ elements: [{ id: "a" }] }] };
    expect(findScenePayloadEvents([obj])).toEqual([obj]);
  });

  test("an unknown event name is flagged even with no arguments", () => {
    const e: RelayEvent = { name: "scene-update", args: [] };
    expect(findScenePayloadEvents([e])).toEqual([e]);
  });
});

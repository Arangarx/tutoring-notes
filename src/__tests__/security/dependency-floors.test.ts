/**
 * Installed production packages must sit outside the high and critical
 * ranges reported by `npm audit` on 2026-11-17. The floors are the first
 * versions the advisories mark as fixed. An older tree fails this test.
 */

import { execSync } from "node:child_process";

/** Minimum version that is outside the advisory range. */
const FLOORS: Record<string, string> = {
  next: "15.5.28",
  "next-auth": "4.24.15",
  nodemailer: "10.1.4",
  "pdfjs-dist": "6.2.108",
  zod: "4.6.6",
  "lodash-es": "4.17.24",
  "@xmldom/xmldom": "0.9.12",
  postcss: "8.5.23",
  "deepmerge-ts": "8.0.0",
  effect: "3.20.0",
  defu: "6.1.5",
  dompurify: "3.4.17",
  immutable: "4.3.9",
  sharp: "0.35.5",
  "socket.io-parser": "4.2.7",
  "source-map-js": "1.2.2",
  undici: "6.29.1",
  ws: "8.21.0",
  // sass 1.32.9–1.78.0 pulls chokidar 3, which pulls picomatch. Every
  // published picomatch through 4.0.7 is GHSA-fc5q-39xc-vjpf. 1.79.0 is the
  // first sass that depends on chokidar 4 (no picomatch).
  sass: "1.79.0",
};

type NpmNode = {
  name?: string;
  version?: string;
  dependencies?: Record<string, NpmNode>;
};

function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function gte(version: string, floor: string): boolean {
  const left = parseVersion(version);
  const right = parseVersion(floor);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return true;
    if (left[i] < right[i]) return false;
  }
  return true;
}

function versionsOf(name: string, omitDev = false): string[] {
  let stdout = "";
  const omit = omitDev ? " --omit=dev" : "";
  try {
    stdout = execSync(`npm ls ${name} --all --json${omit}`, {
      encoding: "utf8",
      // shell is a string so this matches ExecSyncOptions on @types/node 24.
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const thrown = err as { stdout?: string | Buffer };
    stdout = thrown.stdout ? String(thrown.stdout) : "";
  }
  const start = stdout.indexOf("{");
  if (start < 0) return [];
  const tree = JSON.parse(stdout.slice(start)) as NpmNode;
  const found: string[] = [];
  const walk = (node: NpmNode | undefined, nodeName: string | undefined) => {
    if (!node || typeof node !== "object") return;
    if (node.version && nodeName === name) found.push(node.version);
    for (const [child, body] of Object.entries(node.dependencies ?? {})) {
      walk(body, child);
    }
  };
  walk(tree, tree.name);
  return found;
}

/**
 * nanoid 3.x is fixed at 3.3.18+. nanoid 4.x and 5.x below 5.1.16 stay
 * inside the high advisory, so those copies have to be 5.1.16 or newer.
 */
function nanoidOk(version: string): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  if (parsed[0] < 4) return gte(version, "3.3.18");
  return gte(version, "5.1.16");
}

/** brace-expansion highs: <=1.1.20, 2.0.0–2.1.6, and 3.0.0–5.0.11. */
function braceOk(version: string): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  if (parsed[0] === 1) return gte(version, "1.1.21");
  if (parsed[0] === 2) return gte(version, "2.1.7");
  if (parsed[0] >= 3 && parsed[0] <= 5) return gte(version, "5.0.12");
  return true;
}

describe("production dependency floors", () => {
  it.each(Object.entries(FLOORS))(
    "%s is at or above the advisory floor %s",
    (name, floor) => {
      const versions = versionsOf(name);
      expect(versions.length).toBeGreaterThan(0);
      const tooOld = versions.filter((version) => !gte(version, floor));
      expect(tooOld).toEqual([]);
    }
  );

  it("every nanoid copy is outside the high advisory", () => {
    const versions = versionsOf("nanoid");
    expect(versions.length).toBeGreaterThan(0);
    const tooOld = versions.filter((version) => !nanoidOk(version));
    expect(tooOld).toEqual([]);
  });

  it("production tree contains no picomatch while GHSA-fc5q-39xc-vjpf is unpatched", () => {
    // Latest published picomatch is 4.0.7, and the advisory range is <=4.0.7.
    // A version floor cannot clear it. The production tree must not install it.
    expect(versionsOf("picomatch", true)).toEqual([]);
  });

  it("every brace-expansion copy is outside the high advisory", () => {
    const versions = versionsOf("brace-expansion");
    expect(versions.length).toBeGreaterThan(0);
    const tooOld = versions.filter((version) => !braceOk(version));
    expect(tooOld).toEqual([]);
  });
});

# Security

Security checks for Mynk live here.

## Standing CI checks

[`.github/workflows/security.yml`](../../.github/workflows/security.yml) runs on pull requests and on pushes to `feat/org-qol` and `master`. It is static analysis, dependency audit, secret scanning, and the Jest security tests. It does not call any deployed site.

`npm run security:check` runs the same four checks locally. It is part of the master gate ([`.cursor/rules/test-selection.mdc`](../../.cursor/rules/test-selection.mdc)). CI jobs call the same script with `--only semgrep`, `--only gitleaks`, `--only audit`, or `--only jest`. The Semgrep rulesets, the gitleaks version and checksums, and the unreachable Jest database URL live in [`scripts/security-check.mjs`](../../scripts/security-check.mjs) only.

Local Semgrep is a prerequisite: `pip install semgrep`, and `semgrep` must be on `PATH`. gitleaks is not a prerequisite. When it is not on `PATH`, the script downloads gitleaks 8.30.1, checks the pinned SHA-256, and extracts it into `node_modules/.cache/gitleaks-8.30.1`. That download needs network access to GitHub.

| Job | What it runs | Result |
| --- | --- | --- |
| Semgrep | `node scripts/security-check.mjs --only semgrep` (OSS CLI, `p/owasp-top-ten`, `p/typescript`, `p/react`, `p/nextjs`, `--error`) | Fails the job on a finding. Action SHAs in this workflow are pinned. |
| gitleaks | `node scripts/security-check.mjs --only gitleaks` | Fails if a secret is found. [`.gitleaks.toml`](../../.gitleaks.toml) allowlists test fixtures the `generic-api-key` rule mislabels, with the reason in that file. |
| npm audit | `node scripts/security-check.mjs --only audit` (`npm audit --audit-level=high --omit=dev`) | Fails when a high or critical production advisory is not listed in [`scripts/audit-allow.json`](../../scripts/audit-allow.json). Also fails when a listed package is no longer high or critical. |
| Jest security | `node scripts/security-check.mjs --only jest` | Fails if those tests fail. The script points Jest at an unreachable database URL so global setup cannot reset the shared test database. This job does not run the full Jest suite or Playwright. |

CI uses Node 20, the same floor as [docs/PLATFORM-ASSUMPTIONS.md](../PLATFORM-ASSUMPTIONS.md) §7.1. There is no `engines` pin and no `.nvmrc`. `@cortex-js/compute-engine` (via `mathlive`) declares `node >= 21.7.3`. Nothing under `src/` imports it. CI stays on 20 so it matches the documented production runtime.

Local lint loads `eslint-plugin-security`'s recommended rules as warnings so existing code does not fail `next lint` or `next build`. A promotion to errors is a separate triage because the existing warning count would fail next lint.

## Accepted production highs

None. [`scripts/audit-allow.json`](../../scripts/audit-allow.json) is an empty list. Add a package there only when there is no forward release and we will not downgrade it. Each entry needs the package name and that one-line reason. The check fails if the entry is still listed after the advisory is gone, and it fails if a new high or critical package appears without an entry.

High and critical production advisories on this branch were cleared without downgrading Prisma or Excalidraw:

- **next** is `^15.5.29` and **next-auth** is `^4.24.15`. Both stay on the current major. The advisory floors are next `15.5.28` and next-auth `4.24.15`.
- **zod** is `^4.6.7` (advisory floor `4.6.6`).
- **nodemailer** is `^10.6.0`. An override points the rest of the tree, including next-auth, at that same copy. Call sites import the `Transporter` type. `nodemailer.Transporter` is not a namespace in 10.x. The advisory range was `<=10.1.3`; 10.6.0 is the version npm reports as the fix.
- **pdfjs-dist** is `^6.5.438`. The advisory range was `>=5.6.83 <6.2.108`. `PDFDocumentProxy.destroy` is gone. The PDF path still calls `doc.cleanup()`, then `loadingTask.destroy()`.
- **deepmerge-ts** is overridden to 8.0.2, outside the `<8.0.0` advisory. **effect** is overridden to 3.21.0, outside `<3.20.0`. `prisma` and `@prisma/client` stay on `^6.16.1` (the lock may resolve a later 6.x). They were reported only through those dependencies.
- **nanoid** 3.x copies are overridden to 3.3.20. The 4.0.2 copy under `@excalidraw/mermaid-to-excalidraw` is overridden to 5.1.16 for that package only. `@excalidraw/excalidraw` stays on `^0.18.1`.
- Same-major overrides clear **lodash-es** 4.18.1, **@xmldom/xmldom** 0.9.12, **postcss** 8.5.33, **defu** 6.1.7, **dompurify** 3.4.18, **immutable** 4.3.9, **sharp** 0.35.5, **socket.io-parser** 4.2.7, **source-map-js** 1.2.2, **undici** 6.29.1, **ws** 8.23.0, and **brace-expansion** 1.x → 1.1.22.
- **picomatch** GHSA-fc5q-39xc-vjpf covers every published release (`<=4.0.7`). `npm view picomatch version` is 4.0.7, so no picomatch override can leave the range. The production copies were picomatch 2.3.2 under `sass@1.51.0` → `chokidar@3` → `anymatch` / `readdirp`, which also flagged `sass`, `chokidar`, `anymatch`, `readdirp`, and `@excalidraw/excalidraw`. **sass** is overridden to 1.79.0, the last release that depends on chokidar 4 and immutable 4 and does not depend on `@parcel/watcher`. chokidar 4 depends only on `readdirp` (no picomatch). sass 1.80.0 adds `@parcel/watcher`, which depends on picomatch 4.0.7, so that pin does not clear the advisory. The app has no `.scss` files. `@excalidraw/excalidraw` lists `sass` but does not import it, and Next treats `sass` as an optional peer for stylesheet compilation. `chokidar` here is the compiler's file watcher, not a request path. The production tree must contain no `picomatch` (`dependency-floors` asserts that). The `picomatch@2.3.1` → 2.3.2 override stays for any leftover dev copy of the older advisory. Remove the sass pin when a picomatch release newer than 4.0.7 exists, or when Excalidraw and Next no longer install sass.

`src/__tests__/security/dependency-floors.test.ts` asserts every installed copy is at or above those advisory floors.

## Local scan preflight

`npm run scan:preflight` runs `scripts/local-scan-preflight.mjs`. It judges the environment `next dev` would load, highest precedence first: values already in the process environment, then `.env.development.local`, `.env.local`, `.env.development`, and `.env`. Missing files are skipped. It does not read `.env.production.local`. Within one file, the last assignment of a key wins. It exits 0 only when that merged environment cannot point a local scan at another database or at shared credentials.

`DATABASE_URL` and `DIRECT_URL` pass only when the hostname is `localhost`, `127.0.0.1`, or a Neon hostname that starts with `ep-icy-flower` (both `ep-icy-flower-amjka8db` and `ep-icy-flower-amjka8db-pooler`). Every other host fails, including other `*.neon.tech` hosts and `ep-bold-feather` in any region. A `host` query parameter that names a different host fails even when the URL hostname is allowed.

`BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `WHITEBOARD_SYNC_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `CRON_SECRET`, `SETUP_SECRET`, and `PLAYWRIGHT_TEST_SECRET` must be empty. If `NEXTAUTH_URL` is set, its host must be localhost.

ZAP is the bounded scanner (`scripts/run-local-zap.mjs`). Docker is not a firewall. The container reaches the host app at `http://host.docker.internal:3000`. The only permitted app origin is `http://127.0.0.1:3000`. Preflight runs first, including for `--print-only`. `--print-only` does not require port 3000. A real scan exits 1 if port 3000 is down, and exits 1 if something is listening on port 3000 on a non-loopback address. Start the app with `npx next dev -H 127.0.0.1`. The script does not start the server and it does not pull images.

Autonomous assessment stays parked and is not part of these checks.

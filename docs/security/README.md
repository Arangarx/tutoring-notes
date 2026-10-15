# Security

Security checks, threat model, and assessment reports for Mynk live here.

Work happens on branch `sec/audit-pipeline`, which uses its own preview database so assessment runs never touch Tyson's preview data or send real email.

## Standing CI checks

[`.github/workflows/security.yml`](../../.github/workflows/security.yml) runs on pull requests and on pushes to `sec/audit-pipeline` and `master`. It is static analysis, dependency audit, secret scanning, and the existing Jest security tests. It does not call any deployed site, and it does not run an autonomous assessment.

| Job | What it runs | Result |
| --- | --- | --- |
| Semgrep | OSS CLI with `p/owasp-top-ten`, `p/typescript`, `p/react`, `p/nextjs`, and `--error` | Fails the job on a finding. The earlier `yaml.github-actions.security.github-actions-mutable-action-tag` findings were in this workflow; pinning those actions cleared them. A local scan after the pin reported 0 findings |
| gitleaks | `gitleaks detect` on the repository | Fails if a secret is found |
| npm audit | `node scripts/check-npm-audit.mjs` (runs `npm audit --audit-level=high --omit=dev`) | Fails when a high or critical production advisory is not listed in [`scripts/audit-allow.json`](../../scripts/audit-allow.json). Also fails when a listed package is no longer high or critical. Rechecked 2026-10-13: 0 critical, 0 high. The allowlist is empty |
| Jest security | `npx jest src/__tests__/security` only | Fails if those tests fail. The four files mock the database and do not need a live database. This job does not run the full Jest suite or Playwright |

Local lint loads `eslint-plugin-security`'s recommended rules as warnings so existing code does not fail `next lint` or `next build`. A promotion to errors is a separate triage because the existing warning count would fail next lint.

## Accepted production highs

None. [`scripts/audit-allow.json`](../../scripts/audit-allow.json) is an empty list. Add a package there only when there is no forward release and we will not downgrade it. Each entry needs the package name and that one-line reason. The check fails if the entry is still listed after the advisory is gone, and it fails if a new high or critical package appears without an entry.

The 2026-10-13 highs (0 critical, 7 high) were cleared without downgrading Prisma or Excalidraw:

- **nodemailer** is `^10.1.0`. An override points the rest of the tree, including next-auth, at that same copy. Call sites import the `Transporter` type. `nodemailer.Transporter` is not a namespace in 10.x.
- **pdfjs-dist** is `^6.4.299`. `PDFDocumentProxy.destroy` is gone. The PDF path still calls `doc.cleanup()`, then `loadingTask.destroy()`.
- **deepmerge-ts** is overridden to 8.0.2, outside the `<8.0.0` advisory. prisma and `@prisma/config` were reported only through that dependency, so they cleared with it. `prisma` and `@prisma/client` stay on `^6.16.1`.
- **nanoid** 4.0.2 under `@excalidraw/mermaid-to-excalidraw` is overridden to 5.1.16 for that package only. The existing `nanoid@3.3.3` → 3.3.20 override stays. `@excalidraw/excalidraw` stays on `^0.18.1`.

`effect` 3.21.0, pulled in by `@prisma/config`, is already outside GHSA-38f7-945m-qr2g (`< 3.20.0`). It was not overridden.

## Local scan preflight

`npm run scan:preflight` runs `scripts/local-scan-preflight.mjs`. It judges the environment `next dev` would load, highest precedence first: values already in the process environment, then `.env.development.local`, `.env.local`, `.env.development`, and `.env`. Missing files are skipped. It does not read `.env.production.local`. Within one file, the last assignment of a key wins. It exits 0 only when that merged environment cannot point a local scan at another database or at shared credentials.

`DATABASE_URL` and `DIRECT_URL` pass only when the hostname is `localhost`, `127.0.0.1`, or a Neon hostname that starts with `ep-icy-flower` (both `ep-icy-flower-amjka8db` and `ep-icy-flower-amjka8db-pooler`). Every other host fails, including other `*.neon.tech` hosts and `ep-bold-feather` in any region. A `host` query parameter that names a different host fails even when the URL hostname is allowed.

`BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `WHITEBOARD_SYNC_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `CRON_SECRET`, `SETUP_SECRET`, and `PLAYWRIGHT_TEST_SECRET` must be empty. If `NEXTAUTH_URL` is set, its host must be localhost.

ZAP is the bounded scanner (`scripts/run-local-zap.mjs`). Docker is not a firewall. The container reaches the host app at `http://host.docker.internal:3000`. The only permitted app origin is `http://127.0.0.1:3000`. Preflight runs first, including for `--print-only`. `--print-only` does not require port 3000. A real scan exits 1 if port 3000 is down, and exits 1 if something is listening on port 3000 on a non-loopback address. Start the app with `npx next dev -H 127.0.0.1`. The script does not start the server and it does not pull images.

Autonomous assessment is parked until Andrew decides. Strix and Shannon are not installed. `STRIX_TELEMETRY=0` stays required before any future Strix run, and outbound network for that run must stay limited to the app plus one model provider.

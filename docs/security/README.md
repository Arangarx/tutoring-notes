# Security

Security checks, threat model, and assessment reports for Mynk live here.

Work happens on branch `sec/audit-pipeline`, which uses its own preview database so assessment runs never touch Tyson's preview data or send real email.

## Standing CI checks

[`.github/workflows/security.yml`](../../.github/workflows/security.yml) runs on pull requests and on pushes to `sec/audit-pipeline`. It is static analysis, dependency audit, secret scanning, and the existing Jest security tests. It does not call any deployed site, and it does not run an autonomous assessment.

| Job | What it runs | Result |
| --- | --- | --- |
| Semgrep | OSS CLI with `p/owasp-top-ten`, `p/typescript`, `p/react`, `p/nextjs` | Report-only until the baseline is triaged |
| gitleaks | `gitleaks detect` on the repository | Fails if a secret is found |
| npm audit | `node scripts/check-npm-audit.mjs` (runs `npm audit --audit-level=high --omit=dev`) | Fails when a high or critical production advisory is not listed in [`scripts/audit-allow.json`](../../scripts/audit-allow.json). Also fails when a listed package is no longer high or critical. Rechecked 2026-10-13: 0 critical, 0 high. The allowlist is empty |
| Jest security | `npx jest src/__tests__/security` only | Fails if those tests fail. The four files mock the database and do not need a live database. This job does not run the full Jest suite or Playwright |

Local lint loads `eslint-plugin-security`'s recommended rules as warnings so existing code does not fail `next lint` or `next build`. Those warnings can be promoted to errors after triage.

## Accepted production highs

None. [`scripts/audit-allow.json`](../../scripts/audit-allow.json) is an empty list. Add a package there only when there is no forward release and we will not downgrade it. Each entry needs the package name and that one-line reason. The check fails if the entry is still listed after the advisory is gone, and it fails if a new high or critical package appears without an entry.

The 2026-10-13 highs (0 critical, 7 high) were cleared without downgrading Prisma or Excalidraw:

- **nodemailer** is `^10.1.0`. An override points the rest of the tree, including next-auth, at that same copy. Call sites import the `Transporter` type. `nodemailer.Transporter` is not a namespace in 10.x.
- **pdfjs-dist** is `^6.4.299`. `PDFDocumentProxy.destroy` is gone. The PDF path still calls `doc.cleanup()`, then `loadingTask.destroy()`.
- **deepmerge-ts** is overridden to 8.0.2, outside the `<8.0.0` advisory. prisma and `@prisma/config` were reported only through that dependency, so they cleared with it. `prisma` and `@prisma/client` stay on `^6.16.1`.
- **nanoid** 4.0.2 under `@excalidraw/mermaid-to-excalidraw` is overridden to 5.1.16 for that package only. The existing `nanoid@3.3.3` → 3.3.20 override stays. `@excalidraw/excalidraw` stays on `^0.18.1`.

`effect` 3.21.0, pulled in by `@prisma/config`, is already outside GHSA-38f7-945m-qr2g (`< 3.20.0`). It was not overridden.

## Local scan preflight

`npm run scan:preflight` runs `scripts/local-scan-preflight.mjs`. It reads the repo `.env` and exits 0 only when that file cannot point a local scan at the shared preview database or at shared credentials. `DATABASE_URL` must be localhost or a Neon pooler host, and must not be the shared preview pooler. `DIRECT_URL` must be localhost or a Neon direct host (the host name must not contain `-pooler`), and must not be the shared preview direct host. `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `WHITEBOARD_SYNC_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `PLAYWRIGHT_TEST_SECRET` must be empty. If `NEXTAUTH_URL` is set, its host must be localhost.

ZAP is the bounded local scanner (`scripts/run-local-zap.mjs`). It runs the preflight first. The only origin it will use is `http://127.0.0.1:3000`. It does not start the dev server and it does not pull images. The docker command it prints does not firewall the container.

Strix and Shannon are not run until outbound network is limited to the app plus one model provider. `STRIX_TELEMETRY=0` is required before any future Strix run.

Autonomous assessment is deferred until Andrew can supervise.

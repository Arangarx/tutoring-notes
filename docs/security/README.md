# Security

Security checks, threat model, and assessment reports for Mynk live here.

Work happens on branch `sec/audit-pipeline`, which uses its own preview database so assessment runs never touch Tyson's preview data or send real email.

## Standing CI checks

[`.github/workflows/security.yml`](../../.github/workflows/security.yml) runs on pull requests and on pushes to `sec/audit-pipeline`. It is static analysis, dependency audit, secret scanning, and the existing Jest security tests. It does not call any deployed site, and it does not run an autonomous assessment.

| Job | What it runs | Result |
| --- | --- | --- |
| Semgrep | OSS CLI with `p/owasp-top-ten`, `p/typescript`, `p/react`, `p/nextjs` | Report-only until the baseline is triaged |
| gitleaks | `gitleaks detect` on the repository | Fails if a secret is found |
| npm audit | `npm audit --audit-level=high --omit=dev` | Fails on high or critical production advisories. Rechecked 2026-10-13 after a forward upgrade: 0 critical, 7 high. The highs that remain are listed below |
| Jest security | `npx jest src/__tests__/security` only | Fails if those tests fail. The four files mock the database and do not need a live database. This job does not run the full Jest suite or Playwright |

Local lint loads `eslint-plugin-security`'s recommended rules as warnings so existing code does not fail `next lint` or `next build`. Those warnings can be promoted to errors after triage.

## Accepted production highs

These stay until an upstream release exists that we can take without a downgrade:

- **Prisma line.** `prisma` and `@prisma/client` stay on `^6.16.1` (installed 6.19.x). `@prisma/config` and its `deepmerge-ts` 7.1.5 dependency are inside advisory range `6.13.0-dev.1 - 8.1.0-dev.4`. The latest 7.x of deepmerge-ts is still inside that range. npm's only suggested fix is `prisma@6.12.0`, which is older than what this app runs.
- **Excalidraw line.** `@excalidraw/excalidraw` stays on `^0.18.1`. `@excalidraw/mermaid-to-excalidraw` still installs `nanoid@4.0.2`. There is no 4.x release outside `4.0.0 - 5.1.15` (the patches are 3.3.20 and 5.1.16). npm's suggested fix downgrades excalidraw to 0.17.6. The direct `nanoid@3.3.3` pin is overridden to 3.3.20.

Two other highs were tried forward and reverted because `npx next build` failed:

- **nodemailer** stayed at 7.0.13. 10.1.0 still has `createTransport`, but the `nodemailer.Transporter` namespace is gone, so the build failed. `next-auth@4.24.15` is flagged only because it peers that nodemailer. next-auth 5 was not installed.
- **pdfjs-dist** stayed on 5.x (lockfile 5.7.284, range `^5.6.205`). 6.4.299 removed `PDFDocumentProxy.destroy`. The PDF whiteboard path was not reworked.

Autonomous assessment is deferred until Andrew can supervise.

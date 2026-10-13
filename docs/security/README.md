# Security

Security checks, threat model, and assessment reports for Mynk live here.

Work happens on branch `sec/audit-pipeline`, which uses its own preview database so assessment runs never touch Tyson's preview data or send real email.

## Standing CI checks

[`.github/workflows/security.yml`](../../.github/workflows/security.yml) runs on pull requests and on pushes to `sec/audit-pipeline`. It is static analysis, dependency audit, secret scanning, and the existing Jest security tests. It does not call any deployed site, and it does not run an autonomous assessment.

| Job | What it runs | Result |
| --- | --- | --- |
| Semgrep | OSS CLI with `p/owasp-top-ten`, `p/typescript`, `p/react`, `p/nextjs` | Report-only until the baseline is triaged |
| gitleaks | `gitleaks detect` on the repository | Fails if a secret is found |
| npm audit | `npm audit --audit-level=high --omit=dev` | Fails on high or critical production advisories. Checked 2026-10-13: 2 critical and 22 high, and every one had a fix available |
| Jest security | `npx jest src/__tests__/security` only | Fails if those tests fail. The four files mock the database and do not need a live database. This job does not run the full Jest suite or Playwright |

Local lint loads `eslint-plugin-security`'s recommended rules as warnings so existing code does not fail `next lint` or `next build`. Those warnings can be promoted to errors after triage.

Autonomous assessment is deferred until Andrew can supervise.

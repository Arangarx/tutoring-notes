# Brand-previews archive

> **Looking for the canonical Mynk brand reference?**
> It's at [`../palette-mocks-FINAL-mynka-blue.html`](../palette-mocks-FINAL-mynka-blue.html).
> Decision rationale: [`../../MYNK-BRAND-PHASE-2-DECISIONS.md`](../../MYNK-BRAND-PHASE-2-DECISIONS.md).
> Engineering quick-reference: [`../../BRAND.md`](../../BRAND.md).

The Mynk brand was finalized on **2026-05-19** as **Mynka Blue**
(brand `#1E3D54`, coral accent `#E27D60`, cream surfaces) with a
Fraunces V4 wordmark + V2 heading + Inter 400 body + JetBrains Mono
labels typography stack.

Every file in this folder is a **historical exploration mock** that
led to that decision. They are preserved here so the brand's history
is auditable — not for use as design references. Each archived file
has a sticky yellow banner at the top redirecting to the FINAL
reference; if you find yourself building a screen from one of these,
stop and use the FINAL instead.

## Order of exploration

| File | Round | What it was for |
|---|---|---|
| `palette-mocks.html` | Initial | First palette swatches across ~15 concepts |
| `palette-mocks-warm-colors.html` | Initial | Warmer-palette spike branching from initial |
| `palette-mocks-round-2-coolors.html` | Round 2 | Coolors.co trending palettes pulled in for breadth |
| `concept-3-dark-mode-iterations.html` | Side study | Dark-mode iterations on "Concept 3" (warm graphite) |
| `palette-mocks-daughter-picks.html` | Side study | Daughter-driven palette suggestions |
| `palette-mocks-FINALISTS.html` | Finalist 1 | First narrowed shortlist (~10 finalists) |
| `palette-mocks-FINALISTS-round-2.html` | Finalist 2 | Concept 3 + Midnight Woodland Whimsy mashups (M1–M4) |
| `palette-mocks-FINALISTS-round-3.html` | Finalist 3 | MWW + coral variants; Forest-Teal Bridge v2 (M4 → F1) |
| `palette-mocks-FINALISTS-round-4.html` | Finalist 4 | Forest-Teal Bridge softer variants → F1–F4 + first typography matrix |
| `palette-mocks-FINALISTS-round-5.html` | Finalist 5 | Full 4×4 palette × typography compact matrix |
| `palette-mocks-FINALISTS-round-6.html` | Finalist 6 | Richer matrix cells with body-weight variation |
| `palette-mocks-FINALISTS-comprehensive-F1-V4w-V2h.html` | Finalist 7 | Forest-Teal Bridge v2 (F1) at full product scale — the runner-up comparison against F2 |
| `typography-mocks.html` | Side study | Initial Fraunces / Inter / JetBrains Mono pairings |
| `typography-mocks-fraunces-pop.html` | Side study | Bolder Fraunces SOFT-axis variants (V1–V6) |

## Promotion / demotion rules

If a future redesign promotes a different palette out of this archive:

1. Update [`../../MYNK-BRAND-PHASE-2-DECISIONS.md`](../../MYNK-BRAND-PHASE-2-DECISIONS.md)
   first (canonical decision changes there).
2. Move the new winner out of `archived/` and rename it to
   `palette-mocks-FINAL-<name>.html`.
3. Move the previous `palette-mocks-FINAL-*.html` back into
   `archived/` with its own banner.
4. Update [`../../BRAND.md`](../../BRAND.md) and
   [`../../DESIGN-TOKENS-PLAN.md`](../../DESIGN-TOKENS-PLAN.md)
   with the new token values.
5. Plan and execute the in-app migration via the design-tokens plan.

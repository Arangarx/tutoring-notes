/**
 * Fake NextAuth secret for the production-shape Playwright server
 * (`playwright.prod-shape.config.ts`) and the suite that signs a session JWT
 * for it (`tests/prod-shape/refused-start.prod.spec.ts`).
 *
 * Local only. Not a credential for any deployed environment.
 */
export const PROD_SHAPE_NEXTAUTH_SECRET = "prod-shape-nextauth-secret-not-for-anything-real";

# Copilot Task List (Execute in Order)

1) Create `src/domain/plans.ts` with Free/Starter/Growth quotas (2/5/10) + `getPlan()`.
2) Ensure `Organization` and `Property` models match `docs/20-backend-plans-and-models.md`.
3) Add middlewares: `ensureOrg`, `attachOrg`, `limitProperties` and apply to POST /api/properties (and any bulk/import creates).
4) Implement routes:
   - Realtor: GET /api/properties/mine
   - Public: GET /api/properties/public, GET /api/properties/by-slug/:slug
   - Summary: GET /me/summary
5) Add PayFast:
   - Raw body capture before urlencoded (server.ts)
   - POST /billing/checkout/:planId (hosted subscription form)
   - POST /payfast/itn (ITN verification + DB update)
6) Frontend:
   - `useOrgSummary` hook
   - `ProfilePage` with plan badge + property meter
   - Update landing Growth “Buy now” button → `startCheckout("growth")`
   - Create `/billing/return` polling page; `/billing/cancel` page
   - Add public browse + detail pages if not present
7) Verify security rules & run tests in `docs/60-security-and-tests.md`.

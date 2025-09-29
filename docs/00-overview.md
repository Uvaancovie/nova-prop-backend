# PropNova — Implementation Overview

Stack:
- Frontend: Vite + React + shadcn/ui + React Query
- Backend: Express + Mongoose (MongoDB Atlas)
- Payments: PayFast Subscriptions (Hosted), ITN webhooks to backend
- Hosting: API on Render → https://nova-prop-backend.onrender.com

Plan ladder (server truth):
- free → maxProperties=2
- starter → maxProperties=5
- growth → maxProperties=10

Must-haves:
1) Server-only quotas in `src/domain/plans.ts`.
2) `Organization` model with `planId`, `subscriptionStatus`, `extraPropertySlots`.
3) Server middleware: `ensureOrg → attachOrg → limitProperties()` on **all** property-create routes.
4) `/me/summary` endpoint → Profile page meter (used/max).
5) PayFast checkout route (`/billing/checkout/:planId`) → Hosted page.
6) PayFast ITN webhook (`/payfast/itn`) → validate + activate plan.
7) Landing page (canvas file `Propnova Landing Page (vite + Shadcn)`) — change Growth “Buy now” to call checkout.

Security:
- Never trust client `orgId`/`planId`.
- Only ITN flips plans.
- Validate ITN signature + merchant + amount + (optional) remote validate.

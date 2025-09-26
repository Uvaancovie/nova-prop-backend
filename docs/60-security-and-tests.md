# Security + Tests

Security rules:
- Server sets orgId from JWT; ignore any orgId/planId in client requests.
- Plans/quotas/prices come from src/domain/plans.ts only.
- All property creation paths: authRequired → ensureOrg → attachOrg → limitProperties (Mongo transaction).
- Only ITN updates plan; Return URL is UI only.
- Validate ITN: signature + merchant_id + amount (+ remote validate using rawBody).
- Rate-limit /payfast/itn and property create routes. Log ITN payloads (90d).

Manual tests:
1) Realtor on free: create 2 properties OK; third → 403 PROP_LIMIT_REACHED.
2) Growth purchase flow (sandbox): Checkout → PayFast → ITN → /billing/return → /profile shows Growth • active; cap 10.
3) Concurrency: at 9 properties on growth, fire 5 parallel creates → final count ≤ 10 (never 11).
4) Public: /browse-properties lists; /property/:slug shows detail.

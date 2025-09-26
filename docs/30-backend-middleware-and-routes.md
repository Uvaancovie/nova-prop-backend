# Enforcement + Routes

## src/middleware/ensureOrg.ts
- On authed request, if user.orgId missing → create Organization(plan=free), attach to user.
- Otherwise, leave plan as-is (we can keep all on Free if desired).

## src/middleware/entitlements.ts
- attachOrg: load org by req.user.orgId; attach (req.org, req.plan=getPlan(org.planId)).
- limitProperties(): start Mongo session; count Properties by orgId; compare to plan max + extra slots; 403 if limit; else pass & stash session on req.

## src/routes/properties.ts (create)
POST /api/properties
authRequired → ensureOrg → attachOrg → limitProperties → create Property with orgId from JWT (ignore client orgId).
Commit session; handle abort on errors.

## src/routes/properties.ts (realtor list)
GET /api/properties/mine → authRequired → find by orgId.

## src/routes/properties.public.ts
GET /api/properties/public → list public cards (title, city, price, photos, slug).
GET /api/properties/by-slug/:slug → public detail.

## src/routes/me.summary.ts
GET /me/summary → returns:
{
  plan: { id, label, status },
  usage: { properties: { used, max } }
}

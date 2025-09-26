# Plans + Models

## src/domain/plans.ts
export const PLANS = {
  free:    { label: "Free",    priceZar: 0,   quotas: { maxProperties: 2  } },
  starter: { label: "Starter", priceZar: 149, quotas: { maxProperties: 5  } },
  growth:  { label: "Growth",  priceZar: 199, quotas: { maxProperties: 10 } },
} as const;
export type PlanId = keyof typeof PLANS;
export function getPlan(planId: string) { return PLANS[(planId as PlanId)] ?? PLANS.free; }

## src/models/Organization.ts
- name, ownerUserId (ref User)
- planId: "free"|"starter"|"growth" (default free)
- subscriptionStatus: "inactive"|"active"|"past_due"|"canceled" (default inactive)
- extraPropertySlots: Number (default 0)

## src/models/Property.ts
- orgId (ref Organization) **required**
- ownerUserId (ref User) **required**
- title (required), description, city, price.nightly, photos[], isPublic (default true), slug (unique), createdAt

## (Optional) src/models/Subscription.ts
- orgId, planId, provider="payfast", status, providerToken, lastItnAt

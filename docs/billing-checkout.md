Here you go, Mr Covie — a **single “drop-in” Markdown brief** your 5o-mini agent can follow to wire **subscriptions + checkout** end-to-end, using your **current landing file** and your **Render API**.

---

# PropNova — PayFast Subscriptions & Checkout (Agent Implementation Brief)

**Stack:** Vite + React + shadcn/ui (frontend) · Express + Mongoose (backend on Render)
**API Base:** `https://nova-prop-backend.onrender.com`
**Landing file (exists):** `Propnova Landing Page (vite + Shadcn)` (see code snippet at end of this doc)
**Plans (server truth):** `free:2` · `starter:5` · `growth:10` · `agency:unlimited (Enterprise @ R399)`

## 0) Goals

* Realtor navigates to **/billing** or Pricing section → clicks “Buy now”.
* Frontend calls **server checkout** → server returns auto-posting HTML to **PayFast hosted subscriptions**.
* After payment, PayFast redirects user to **/billing/return**; PayFast also POSTs **ITN** to backend.
* ITN verifies signature/amount and **activates plan** on the org.
* Profile shows **plan, status, next renewal, and property cap used/max**.

---

## 1) Backend — Environment (Render)

Set these **exact** env vars in Render:

```
PAYFAST_MODE=live           # change to live when you switch
PAYFAST_MERCHANT_ID=31497961
PAYFAST_MERCHANT_KEY=j7zjpqxlrqqeo
PAYFAST_PASSPHRASE=Propnovajason123
API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=https://www.nova-prop.com   # for local dev use http://localhost:5173
```

> ⚠️ Use **Sandbox** merchant creds when PAYFAST_MODE=sandbox. Live creds only on PAYFAST_MODE=live.

---

## 2) Backend — Shared helpers

Create `src/lib/payfast.ts`:

```ts
export const PAYFAST_HOST =
  process.env.PAYFAST_MODE === "live"
    ? "https://www.payfast.co.za"
    : "https://sandbox.payfast.co.za";

export const MERCHANT_ID  = process.env.PAYFAST_MERCHANT_ID!;
export const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY!;
export const PASSPHRASE   = process.env.PAYFAST_PASSPHRASE || "";
```

Plans `src/domain/plans.ts` (if missing):

```ts
export const PLANS = {
  free:    { label: "Free",    priceZar: 0,   quotas: { maxProperties: 2  } },
  starter: { label: "Starter", priceZar: 149, quotas: { maxProperties: 5  } },
  growth:  { label: "Growth",  priceZar: 199, quotas: { maxProperties: 10 } },
} as const;
export type PlanId = keyof typeof PLANS;
export function getPlan(planId: string) {
  return PLANS[(planId as PlanId)] ?? PLANS.free;
}
```

---

## 3) Backend — Raw body capture (ITN)

Add **before** `express.urlencoded()` in `src/server.ts`:

```ts
app.use((req: any, _res, next) => {
  if ((req.headers["content-type"] || "").includes("application/x-www-form-urlencoded")) {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => { req.rawBody = buf; next(); });
  } else next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
```

---

## 4) Backend — Ensure org on auth

`src/middleware/ensureOrg.ts`:

```ts
import Organization from "../models/Organization";
import User from "../models/User";

export async function ensureOrg(req: any, _res: any, next: any) {
  if (!req.user?.orgId) {
    const org = await Organization.create({
      name: "Realtor Org",
      ownerUserId: req.user._id,
      planId: "free",
      subscriptionStatus: "inactive",
    });
    await User.updateOne({ _id: req.user._id }, { $set: { orgId: org._id } });
    req.user.orgId = org._id;
  }
  next();
}
```

Use `ensureOrg` on any routes that require an org (including checkout).

---

## 5) Backend — Checkout route (Hosted Subscriptions)

Create `src/routes/billing.checkout.ts`:

```ts
import { Router } from "express";
import crypto from "crypto";
import { authRequired } from "../middleware/authz";
import { ensureOrg } from "../middleware/ensureOrg";
import { getPlan } from "../domain/plans";
import { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE } from "../lib/payfast";

function signParams(params: Record<string,string|number>) {
  const pairs = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).trim()).replace(/%20/g, "+")}`);
  const base = pairs.join("&");
  const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, "+")}` : base;
  const signature = crypto.createHash("md5").update(withPass).digest("hex");
  return `${base}&signature=${signature}`;
}

const r = Router();

r.post("/billing/checkout/:planId", authRequired, ensureOrg, async (req: any, res) => {
  const planId = String(req.params.planId);
  if (!["starter", "growth"].includes(planId)) return res.status(400).json({ message: "Invalid plan" });
  const plan = getPlan(planId);

  const m_payment_id = `sub_${planId}_${req.user.orgId}_${Date.now()}`;
  const params: Record<string,string|number> = {
    merchant_id: MERCHANT_ID,
    merchant_key: MERCHANT_KEY,
    return_url: `${process.env.APP_BASE_URL}/billing/return`,
    cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
    notify_url: `${process.env.API_BASE_URL}/payfast/itn`,

    name_first: req.user.firstName || "PropNova",
    name_last:  req.user.lastName  || "Subscriber",
    email_address: req.user.email,
    m_payment_id,
    item_name: `PropNova ${plan.label} Subscription`,

    amount: plan.priceZar.toFixed(2),
    subscription_type: 1,
    recurring_amount: plan.priceZar.toFixed(2),
    frequency: 3, // monthly
    cycles: 0,    // indefinite
  };

  const query = signParams(params);
  const action = `${PAYFAST_HOST}/eng/process?${query}`;
  res.setHeader("Content-Type", "text/html");
  res.send(`<!doctype html><html><body><form id="pf" action="${action}" method="post"></form><script>document.getElementById('pf').submit();</script></body></html>`);
});

export default r;
```

Mount it:

```ts
import billingCheckout from "./routes/billing.checkout";
app.use(billingCheckout);
```

---

## 6) Backend — ITN webhook (Notify URL)

Create `src/routes/payfast.itn.ts`:

```ts
import { Router } from "express";
import crypto from "crypto";
import fetch from "node-fetch";
import { PAYFAST_HOST, MERCHANT_ID, PASSPHRASE } from "../lib/payfast";
import Organization from "../models/Organization";
import Subscription from "../models/Subscription";
import { getPlan } from "../domain/plans";

const r = Router();

function md5Signature(form: Record<string,string>) {
  const keys = Object.keys(form).filter(k => k !== "signature").sort();
  const base = keys.map(k => `${k}=${encodeURIComponent(form[k]).replace(/%20/g, "+")}`).join("&");
  const withPass = PASSPHRASE ? `${base}&passphrase=${encodeURIComponent(PASSPHRASE).replace(/%20/g, "+")}` : base;
  return crypto.createHash("md5").update(withPass).digest("hex");
}

async function remoteValidate(raw: string) {
  const resp = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: raw
  });
  return (await resp.text()).trim() === "VALID";
}

r.post("/payfast/itn", async (req: any, res) => {
  try {
    const raw = req.rawBody || "";
    const form: Record<string,string> = Object.fromEntries(Object.entries(req.body).map(([k,v]) => [k, String(v)]));
    const expected = md5Signature(form);
    if ((form.signature||"").toLowerCase() !== expected.toLowerCase()) return res.status(200).send("OK");
    if (form.merchant_id !== MERCHANT_ID) return res.status(200).send("OK");
    const valid = await remoteValidate(raw);
    if (!valid) return res.status(200).send("OK");

    const [_, planId, orgId] = (form.m_payment_id || "").split("_");
    const plan = getPlan(planId);
    const amount = parseFloat(form.amount_gross || form.amount || "0");
    if (plan.priceZar > 0 && Math.abs(amount - plan.priceZar) > 0.01) return res.status(200).send("OK");

    const status = (form.payment_status || "").toUpperCase();
    const subStatus =
      status === "COMPLETE" ? "active" :
      status === "CANCELLED" ? "canceled" :
      status === "FAILED" ? "past_due" : "inactive";

    await Subscription.findOneAndUpdate(
      { orgId },
      { orgId, planId, provider: "payfast", status: subStatus, providerToken: form.token || undefined, lastItnAt: new Date() },
      { upsert: true, new: true }
    );

    await Organization.findByIdAndUpdate(orgId, { planId, subscriptionStatus: subStatus });
    return res.status(200).send("OK");
  } catch (e) {
    console.error("ITN error:", e);
    return res.status(200).send("OK");
  }
});

export default r;
```

Mount it:

```ts
import payfastItn from "./routes/payfast.itn";
app.use(payfastItn);
```

**PayFast Dashboard → Recurring Billing:**

* **Notify URL:** `https://nova-prop-backend.onrender.com/payfast/itn`
* **Return URL:** `https://www.nova-prop.com/billing/return`
* **Cancel URL:** `https://www.nova-prop.com/billing/cancel`
* Require signature: **ON** · Passphrase set (must match `PAYFAST_PASSPHRASE`)

---

## 7) Backend — Summary endpoint (profile usage)

If missing, add `src/routes/me.summary.ts`:

```ts
import { Router } from "express";
import { authRequired } from "../middleware/authz";
import Organization from "../models/Organization";
import Property from "../models/Property";
import Subscription from "../models/Subscription";
import { getPlan } from "../domain/plans";

const r = Router();
r.get("/me/summary", authRequired, async (req: any, res) => {
  const org = await Organization.findById(req.user.orgId).lean();
  if (!org) return res.status(404).json({ message: "Org not found" });
  const plan = getPlan(org.planId);
  const used = await Property.countDocuments({ orgId: org._id });
  const sub = await Subscription.findOne({ orgId: org._id }).lean();
  // naive nextRenewalAt estimate: last ITN + 1 month (improve if you wire promo webhooks)
  const nextRenewalAt = sub?.lastItnAt ? new Date(new Date(sub.lastItnAt).setMonth(new Date(sub.lastItnAt).getMonth() + 1)) : null;

  res.json({
    plan: { id: org.planId, label: plan.label, status: org.subscriptionStatus },
    usage: { properties: { used, max: (plan.quotas.maxProperties + (org.extraPropertySlots||0)) } },
    subscription: sub ? {
      provider: sub.provider,
      nextRenewalAt,
      renewsEvery: "monthly"
    } : null
  });
});
export default r;
```

Mount it:

```ts
import meSummary from "./routes/me.summary";
app.use(meSummary);
```

---

## 8) Frontend — Env + helper

`.env` in Vite:

```
VITE_API_URL=https://nova-prop-backend.onrender.com
```

Create `src/lib/billing.ts`:

```ts
export async function startCheckout(planId: "starter" | "growth") {
  const r = await fetch(`${import.meta.env.VITE_API_URL}/billing/checkout/${planId}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${localStorage.getItem("jwt") || ""}` },
  });
  if (!r.ok) throw new Error("checkout_failed");
  const html = await r.text();
  const w = window.open("", "_self");
  w?.document.write(html);
  w?.document.close();
}
```

---

## 9) Frontend — Wire the Pricing “Buy now” button (landing page)

**File:** `Propnova Landing Page (vite + Shadcn)` — replace the Growth CTA:

```diff
- <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => (window.location.href = "/billing")}>Buy now</Button>
+ <Button
+   className="w-full bg-violet-600 hover:bg-violet-700"
+   onClick={() => startCheckout("growth")}
+ >
+   Buy now
+ </Button>
```

At the top of the file, add:

```ts
import { startCheckout } from "@/lib/billing";
```

(If you show **Starter** purchase, call `startCheckout("starter")` on that button.)

---

## 10) Frontend — Return/Cancel pages

Add **/billing/return** that polls `/me/summary` then redirects to **/profile**:

```tsx
// src/pages/BillingReturn.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function BillingReturn() {
  const nav = useNavigate();
  const [status, setStatus] = useState<"pending"|"active"|"failed">("pending");

  useEffect(() => {
    let attempts = 0;
    const t = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL}/me/summary`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${localStorage.getItem("jwt") || ""}` },
        });
        const j = await r.json();
        if (j?.plan?.id !== "free" && j?.plan?.status === "active") {
          setStatus("active");
          clearInterval(t);
          setTimeout(() => nav("/profile"), 1000);
        } else if (attempts >= 10) {
          setStatus("failed"); clearInterval(t);
        }
      } catch {
        if (attempts >= 10) { setStatus("failed"); clearInterval(t); }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [nav]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      {status === "pending" && <p>Processing your subscription…</p>}
      {status === "active"  && <p className="text-emerald-600">Success! Your plan is active. Redirecting…</p>}
      {status === "failed"  && <p className="text-red-600">We couldn’t verify the payment. Please refresh or contact support.</p>}
    </div>
  );
}
```

Add a simple cancel page and **routes** in your router:

```tsx
import BillingReturn from "./pages/BillingReturn";
<Route path="/billing/return" element={<BillingReturn />} />
<Route path="/billing/cancel" element={<div className="p-8 text-center">Payment canceled.</div>} />
```

---

## 11) Frontend — Profile plan/usage

Your Profile page should call `/me/summary` and display:

* **Plan badge**: `Free / Starter / Growth • status`
* **Usage meter**: `used / max` properties
* **Next renewal**: date from `subscription.nextRenewalAt` (if present)

---

## 12) Acceptance tests

* **Checkout opens**: Click Growth “Buy now” → PayFast hosted page renders without 400s.
* **ITN activates**: After paying, ITN hits `/payfast/itn`, and `/me/summary` returns `plan.id="growth"`, `status="active"`.
* **Profile shows success**: `/billing/return` redirects to **/profile** showing **Growth • active** and cap **10**.
* **Enforcement**: Create properties up to plan cap; next create returns `403 PROP_LIMIT_REACHED`.

---

## 13) Common pitfalls (avoid)

* Using **live** merchant creds on **sandbox.payfast.co.za** (or vice versa).
* `notify_url` pointing to **localhost** (PayFast can’t reach it) — always use the public Render URL.
* Missing **passphrase** or mismatched signature building (ensure md5 of `alpha-sorted params + &passphrase=...`).
* No `orgId` at checkout (`ensureOrg` must run before building `m_payment_id`).

---

## 14) Exact landing snippet reference (current state)

The pricing Growth button currently is:

```jsx
<Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => (window.location.href = "/billing")}>Buy now</Button>
```

**Replace with** `startCheckout("growth")` as shown in §9.

---

> Implement the steps in order. Do not craft PayFast URLs in the browser — always call the server’s `/billing/checkout/:planId` and post the signed HTML it returns.

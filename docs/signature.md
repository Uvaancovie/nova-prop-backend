Here’s a **copy-paste Markdown brief** your agent can follow to fix the **signature mismatch** and the **Express trust-proxy / rate-limit** error, and to wire the Pricing CTA to the real checkout.

---

# PropNova — Fix PayFast Signature + Proxy & Wire Checkout (Implementation Brief)

**Stack:** Vite + React + shadcn (frontend) · Express + Mongoose (Render API)
**API:** `https://nova-prop-backend.onrender.com`
**Live UI:** `https://www.nova-prop.com`
**Landing file to edit:** `Propnova Landing Page (vite + Shadcn)` (see button change in §4)

---

## 0) Symptoms to fix

1. **PayFast 400** — “Generated signature does not match submitted signature.”
   Causes: passphrase mismatch, including empty fields in the signature, or wrong host/creds pairing.

2. **Express error** — `X-Forwarded-For header … trust proxy false` from `express-rate-limit`.
   Cause: behind Render’s proxy; must enable `trust proxy` before rate-limit.

---

## 1) Server environment (Render) — verify

Set or confirm these env vars (exact names), then redeploy:

```env
# LIVE
PAYFAST_MODE=live
PAYFAST_MERCHANT_ID=31497961
PAYFAST_MERCHANT_KEY=j7zjpqxlrqqeo
PAYFAST_PASSPHRASE=Propnovajason123

API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=https://www.nova-prop.com
```

> If you ever revert to **sandbox**, you must also switch to Sandbox merchant ID/Key and the code will auto-target `https://sandbox.payfast.co.za`.

---

## 2) Server: trust proxy before rate-limit (fix the Express warning)

In your Express bootstrap (e.g., `src/server.ts`), **before** mounting any rate-limit or IP logic:

```ts
// Enable correct client IPs behind Render/Proxies
app.set("trust proxy", true);

// (then your rate-limit middleware, if any)
```

---

## 3) Server: robust PayFast signing (drop empty fields, append passphrase, then MD5)

Create/replace your signing helper used by the **checkout route**:

```ts
// src/lib/payfast-sign.ts
import crypto from "crypto";

export function buildSignedQuery(
  params: Record<string, string | number | null | undefined>,
  passphrase: string
) {
  // 1) Remove undefined / null / empty-string keys entirely
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (sv === "") continue;                 // IMPORTANT: do not sign empty keys (e.g., name_last="")
    clean[k] = sv;
  }

  // 2) Alpha-sort & encode values; convert %20 -> +
  const base = Object.keys(clean)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(clean[k]).replace(/%20/g, "+")}`)
    .join("&");

  // 3) Append passphrase (if set) then MD5 hash to hex
  const baseWithPass = passphrase
    ? `${base}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`
    : base;

  const signature = crypto.createHash("md5").update(baseWithPass).digest("hex");

  // 4) Full query to send to PayFast
  return `${base}&signature=${signature}`;
}
```

Use it in your **checkout route** (hosted subscriptions):

```ts
// src/routes/billing.checkout.ts
import { Router } from "express";
import { authRequired } from "../middleware/authz";
import { ensureOrg } from "../middleware/ensureOrg";
import { getPlan } from "../domain/plans";
import { PAYFAST_HOST, MERCHANT_ID, MERCHANT_KEY, PASSPHRASE } from "../lib/payfast";
import { buildSignedQuery } from "../lib/payfast-sign";

const r = Router();

r.post("/billing/checkout/:planId", authRequired, ensureOrg, async (req: any, res) => {
  const planId = String(req.params.planId);
  if (!["starter", "growth"].includes(planId)) return res.status(400).json({ message: "Invalid plan" });
  const plan = getPlan(planId);

  const m_payment_id = `sub_${planId}_${req.user.orgId}_${Date.now()}`;

  const query = buildSignedQuery(
    {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${process.env.APP_BASE_URL}/billing/return`,
      cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
      notify_url: `${process.env.API_BASE_URL}/payfast/itn`,
      name_first: req.user.firstName || "PropNova",
      // name_last intentionally omitted if blank
      email_address: req.user.email,
      m_payment_id,
      item_name: `PropNova ${plan.label} Subscription`,
      amount: plan.priceZar.toFixed(2),
      subscription_type: 1,                 // recurring
      recurring_amount: plan.priceZar.toFixed(2),
      frequency: 3,                         // monthly
      cycles: 0,                            // indefinite
    },
    PASSPHRASE
  );

  const action = `${PAYFAST_HOST}/eng/process?${query}`;
  res.setHeader("Content-Type", "text/html");
  res.send(`<!doctype html><html><body>
    <form id="pf" action="${action}" method="post"></form>
    <script>document.getElementById('pf').submit();</script>
  </body></html>`);
});

export default r;
```

> **Why this fixes the 400:** PayFast calculates the hash on exactly the (non-empty) fields it receives, sorted A→Z, with passphrase appended. If you include an empty key in your signature but PayFast ignores it (or vice versa), the hashes differ → 400. This helper guarantees parity.

**Optional debug (temporary):**

```ts
console.log("[PF] action:", action);
```

---

## 4) Frontend: wire the Pricing CTA to the **server checkout**, not `/billing`

**File in canvas:** `Propnova Landing Page (vite + Shadcn)`
Replace the **Growth** button:

```diff
- <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => (window.location.href = "/billing")}>Buy now</Button>
+ <Button
+   className="w-full bg-violet-600 hover:bg-violet-700"
+   onClick={() => startCheckout("growth")}
+ >
+   Buy now
+ </Button>
```

Add helper + import:

```ts
// src/lib/billing.ts
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

```diff
+ import { startCheckout } from "@/lib/billing";
```

Set Vite env (frontend):

```env
VITE_API_URL=https://nova-prop-backend.onrender.com
```

*(You can keep Starter as a signup CTA for now, or also wire `startCheckout("starter")` similarly.)*

---

## 5) PayFast dashboard sanity (one-time)

* **Recurring Billing → Require signature:** ON
* **Security passphrase:** exactly `Propnovajason123` (matches `PAYFAST_PASSPHRASE`)
* **Notify URL (ITN):** `https://nova-prop-backend.onrender.com/payfast/itn`
* **Return URL:** `https://www.nova-prop.com/billing/return`
* **Cancel URL:** `https://www.nova-prop.com/billing/cancel`
* **Account enabled for subscriptions:** Yes

---

## 6) Acceptance checklist

* [ ] **Live flow:** Button → PayFast hosted form loads (no 400).
* [ ] **ITN arrives:** `/payfast/itn` receives POST after success (ensure your existing ITN route verifies and upgrades plan).
* [ ] **Profile updates:** `/billing/return` polls `/me/summary` and shows **Growth • active • 10 properties**.
* [ ] **Server warning gone:** No more `trust proxy` error from `express-rate-limit`.

---

## 7) Common pitfalls (double-check)

* Host/creds mismatch (live vs sandbox).
* Passphrase typo / trailing space.
* Including **empty fields** in signature string.
* Not calling the **server** checkout (manually constructing URLs in the browser).
* `notify_url` pointing to localhost (must be the public Render URL).

---

Apply the above in order. This resolves the signature error, removes the proxy warning, and connects the Pricing CTA to a working PayFast checkout.

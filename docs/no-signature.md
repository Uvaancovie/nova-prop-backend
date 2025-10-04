Mr Covie — here’s a **copy-paste Markdown brief** to fix your PayFast 400 by (a) posting a **real HTML form** (no brittle querystrings), (b) handling **signature on/off** cleanly, and (c) fixing the **trust proxy** warning.

---

# PropNova — Make PayFast Checkout Work (Form POST + Optional Signature + Proxy Fix)

**Why you’re getting 400 now:**

* You’re sending a **GET** with a long querystring. Any tiny encoding/empty-field mismatch breaks PayFast’s signature check.
* Even if you turned off “Require signature” in the dashboard, you’re still **including a `signature` param** → PayFast validates it anyway and 400s.
* There’s also an Express warning: `X-Forwarded-For … trust proxy false`, which we’ll fix.

This guide refactors the backend to **POST a hidden form** and to **omit `signature` entirely when disabled**. That makes the flow robust.

---

## 0) Backend env (Render) — add one flag & confirm values

```env
# LIVE (adjust if you’re testing sandbox)
PAYFAST_MODE=live
PAYFAST_MERCHANT_ID=31497961
PAYFAST_MERCHANT_KEY=j7zjpqxlrqqeo
PAYFAST_PASSPHRASE=Propnovajason123

# New: control whether we sign requests
PAYFAST_REQUIRE_SIGNATURE=false   # set to true if you enable signature in dashboard

API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=https://www.nova-prop.com
```

> Important: **If the dashboard “Require signature” is OFF, set `PAYFAST_REQUIRE_SIGNATURE=false` and do NOT send a `signature` param.**
> When you’re ready to harden security, switch both **ON** and the code will sign correctly.

---

## 1) Express proxy fix (remove the rate-limit warning)

In your server bootstrap (before rate-limit and routes):

```ts
// server.ts / app.ts
app.set("trust proxy", true); // you’re behind Render’s proxy
```

---

## 2) Use a real HTML POST form (no more GET querystring)

Replace your checkout route to **render an HTML form with hidden inputs**.
When `PAYFAST_REQUIRE_SIGNATURE=true`, we compute `signature`; otherwise we **do not include** it.

```ts
// src/routes/billing.checkout.ts
import { Router } from "express";
import crypto from "crypto";
import { authRequired } from "../middleware/authz";
import { ensureOrg } from "../middleware/ensureOrg";
import { getPlan } from "../domain/plans";

const r = Router();

const PAYFAST_HOST =
  process.env.PAYFAST_MODE === "live"
    ? "https://www.payfast.co.za"
    : "https://sandbox.payfast.co.za";

const REQUIRE_SIG = String(process.env.PAYFAST_REQUIRE_SIGNATURE || "true") === "true";
const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID!;
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY!;
const PASSPHRASE  = process.env.PAYFAST_PASSPHRASE || "";

function urlEncodePlus(str: string) {
  return encodeURIComponent(str).replace(/%20/g, "+");
}

function computeSignature(params: Record<string,string>) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${urlEncodePlus(params[k])}`)
    .join("&");
  const withPass = PASSPHRASE ? `${base}&passphrase=${urlEncodePlus(PASSPHRASE)}` : base;
  return crypto.createHash("md5").update(withPass).digest("hex");
}

function renderAutoPostForm(action: string, fields: Record<string,string>) {
  const inputs = Object.entries(fields)
    .map(([k,v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, "&quot;")}" />`)
    .join("\n");
  return `<!doctype html>
<html><body>
  <form id="pf" method="post" action="${action}">
    ${inputs}
  </form>
  <script>document.getElementById('pf').submit();</script>
</body></html>`;
}

r.post("/billing/checkout/:planId",
  authRequired,
  ensureOrg,
  async (req: any, res) => {
    const planId = String(req.params.planId);
    if (!["starter","growth"].includes(planId)) {
      return res.status(400).json({ message: "Invalid plan" });
    }
    const plan = getPlan(planId);
    const m_payment_id = `sub_${planId}_${req.user.orgId}_${Date.now()}`;

    // Build fields (omit empty values entirely)
    const fields: Record<string,string> = {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${process.env.APP_BASE_URL}/billing/return`,
      cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
      notify_url: `${process.env.API_BASE_URL}/payfast/itn`,
      name_first: (req.user.firstName || "PropNova"),
      email_address: req.user.email,
      m_payment_id,
      item_name: `PropNova ${plan.label} Subscription`,
      amount: plan.priceZar.toFixed(2),
      subscription_type: "1",
      recurring_amount: plan.priceZar.toFixed(2),
      frequency: "3",
      cycles: "0",
    };

    // Remove any accidental empty keys (defensive)
    for (const k of Object.keys(fields)) {
      if (!fields[k] || fields[k].trim() === "") delete fields[k];
    }

    if (REQUIRE_SIG) {
      const signature = computeSignature(fields);
      fields.signature = signature;
    }

    const html = renderAutoPostForm(`${PAYFAST_HOST}/eng/process`, fields);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }
);

export default r;
```

**Why this helps**

* A **POST form** avoids querystring encoding pitfalls and mirrors PayFast’s examples.
* When signature is **disabled**, we **don’t send** `signature` at all → PayFast won’t try to validate it.
* When you re-enable signature later, the same route will compute it correctly (A→Z sort, `%20→+`, append passphrase before MD5).

---

## 3) (Optional) tighten your ITN validator too

Your ITN route should already **recompute the signature** when `REQUIRE_SIG=true`.
When you run without signatures, just **skip signature checks** but still do **remote validation**:

```ts
// inside /payfast/itn
const REQUIRE_SIG = String(process.env.PAYFAST_REQUIRE_SIGNATURE || "true") === "true";
if (REQUIRE_SIG) {
  // recompute signature & compare...
  // if mismatch: return res.status(200).send("OK");
}
// always do remote validate (recommended), amount checks, etc.
```

> Even with signature **off**, keep **remote validate** (`/eng/query/validate`) and **amount** checks for safety.

---

## 4) Frontend CTA must call the server checkout (not /billing)

In **Propnova Landing Page (vite + Shadcn)** you currently send users to `/billing`.
Replace the Growth “Buy now” click with a call to the server checkout:

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

Then in your pricing card:

```diff
+ import { startCheckout } from "@/lib/billing";

- <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => (window.location.href = "/billing")}>Buy now</Button>
+ <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => startCheckout("growth")}>Buy now</Button>
```

And make sure your Vite env has:

```
VITE_API_URL=https://nova-prop-backend.onrender.com
```

---

## 5) PayFast dashboard settings to match

* If **not** using signature now:

  * **Require signature:** OFF
  * **Security passphrase:** can stay set; we simply won’t send `signature` param.
* URLs:

  * **Notify URL:** `https://nova-prop-backend.onrender.com/payfast/itn`
  * **Return URL:** `https://www.nova-prop.com/billing/return`
  * **Cancel URL:** `https://www.nova-prop.com/billing/cancel`
* Merchant account enabled for **Recurring Billing**.

---

## 6) Quick test checklist

* [ ] Click “Buy now (Growth)” → a **PayFast hosted page** loads (no 400).
* [ ] After success, you land on **/billing/return**; your ITN handler updates `Organization.planId` and `subscriptionStatus`.
* [ ] Profile shows **plan + limits**.
* [ ] Console has **no** `trust proxy` warnings.

---

## 7) Later: re-enable signature (recommended)

When you want to harden security:

1. Set **Require signature = ON** in dashboard.
2. Set `PAYFAST_REQUIRE_SIGNATURE=true` in env and redeploy.
3. The exact same route will now include a correct `signature`, and your ITN will verify it.

---

Apply the above exactly. You’ll stop sending a mismatched `signature`, avoid encoding gotchas by **posting** a form, and the Render proxy warning will be gone.

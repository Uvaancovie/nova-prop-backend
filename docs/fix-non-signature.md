Got you, Mr Covie. Here’s a tight, copy-paste **Markdown brief** to make the PayFast checkout work even with “Require signature = OFF”, and to stop the recurring 400. It also patches your landing CTA.

---

# PropNova — Fix “Generated signature does not match” (No-Signature Mode) + Wire Checkout

**Context**

* Frontend: Vite + React + shadcn
* Backend: Express on Render → `https://nova-prop-backend.onrender.com`
* Live UI: `https://www.nova-prop.com`
* Current issue: PayFast 400 “Generated signature does not match submitted signature” even after disabling signatures in dashboard → you’re still sending a `signature` param or a brittle querystring GET.

**Goal**

* Use a **server-rendered HTML `<form method="post">`** to PayFast.
* **Do not include `signature`** when dashboard signatures are OFF.
* Button calls server checkout route (not `/billing`).
* Express behind proxy works cleanly.

---

## 1) Server env (Render)

```env
PAYFAST_MODE=live
PAYFAST_MERCHANT_ID=31497961
PAYFAST_MERCHANT_KEY=j7zjpqxlrqqeo
PAYFAST_PASSPHRASE=Propnovajason123

# IMPORTANT: As long as dashboard "Require signature" is OFF, keep this false.
PAYFAST_REQUIRE_SIGNATURE=false

API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=https://www.nova-prop.com
```

> When you later re-enable signatures in the PayFast dashboard, flip `PAYFAST_REQUIRE_SIGNATURE=true` and the code below will include a correct signature.

---

## 2) Express proxy fix (prevents rate-limit/IP warnings)

In Express bootstrap (before any rate-limit or routes):

```ts
app.set("trust proxy", true);
```

---

## 3) Checkout route: real POST form, optional signature

Create/replace `src/routes/billing.checkout.ts`:

```ts
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

function urlEncodePlus(s: string) {
  return encodeURIComponent(s).replace(/%20/g, "+");
}

function computeSignature(fields: Record<string,string>) {
  const base = Object.keys(fields)
    .sort()
    .map(k => `${k}=${urlEncodePlus(fields[k])}`)
    .join("&");
  const withPass = PASSPHRASE ? `${base}&passphrase=${urlEncodePlus(PASSPHRASE)}` : base;
  return crypto.createHash("md5").update(withPass).digest("hex");
}

function renderAutoPostForm(action: string, fields: Record<string,string>) {
  const inputs = Object.entries(fields)
    .map(([k,v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g,"&quot;")}" />`)
    .join("\n");
  return `<!doctype html><html><body>
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
      name_first: req.user.firstName || "PropNova",
      email_address: req.user.email,
      m_payment_id,
      item_name: `PropNova ${plan.label} Subscription`,
      amount: plan.priceZar.toFixed(2),
      subscription_type: "1",
      recurring_amount: plan.priceZar.toFixed(2),
      frequency: "3",
      cycles: "0",
    };

    // Remove accidental blanks (e.g., name_last "")
    for (const k of Object.keys(fields)) {
      if (!fields[k] || fields[k].trim() === "") delete fields[k];
    }

    // Only include signature if both dashboard+env require it
    if (REQUIRE_SIG) {
      fields.signature = computeSignature(fields);
    }

    // (Optional) debug once if still failing
    // console.log("[PF] requireSig:", REQUIRE_SIG, "fields:", fields);

    const html = renderAutoPostForm(`${PAYFAST_HOST}/eng/process`, fields);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }
);

export default r;
```

Mount it in your server bootstrap:

```ts
import billingCheckout from "./routes/billing.checkout";
app.use(billingCheckout);
```

**Why this fixes the 400 now:**

* We **don’t send `signature`** when signatures are disabled.
* We **POST a form** (no fragile long querystring).
* We remove empty inputs before sending (no ghost keys to desync hashes later).

---

## 4) Frontend: call the server checkout (not `/billing`)

Add helper `src/lib/billing.ts`:

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

Ensure Vite env:

```
VITE_API_URL=https://nova-prop-backend.onrender.com
```

### Patch your landing page CTA (current code shows `/billing` navigation)

In **Propnova Landing Page (vite + Shadcn)** replace Growth button:

```diff
+ import { startCheckout } from "@/lib/billing";

- <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => (window.location.href = "/billing")}>Buy now</Button>
+ <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => startCheckout("growth")}>Buy now</Button>
```

(Do similar for Starter if you want: `startCheckout("starter")`.)

---

## 5) PayFast dashboard (for no-signature mode)

* **Require signature:** OFF
* **Notify URL:** `https://nova-prop-backend.onrender.com/payfast/itn`
* **Return URL:** `https://www.nova-prop.com/billing/return`
* **Cancel URL:** `https://www.nova-prop.com/billing/cancel`
* **Recurring Billing enabled:** ON

> Later, to harden: turn dashboard **Require signature = ON**, set `PAYFAST_REQUIRE_SIGNATURE=true`, redeploy — you’ll automatically include a correct `signature`.

---

## 6) Acceptance checks

* [ ] Clicking **Buy now** renders the PayFast hosted page (no 400).
* [ ] After success, you land on `/billing/return` and ITN updates plan.
* [ ] Profile shows correct plan + limits.
* [ ] No Express “trust proxy” warnings.

---

### Notes

* The 403 on `kit.fontawesome.com` is unrelated to payments (a blocked asset/CDN token). Ignore or remove FA if you don’t use it.
* If you still see a 400 after all this, log the **exact fields** you POST (without secrets) and confirm dashboard mode (live vs sandbox) matches your env and host.

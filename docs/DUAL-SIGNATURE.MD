Here’s a **single, copy-paste Markdown file** you can give to your Copilot agent. It **fixes the PayFast signature mismatch** (with your new passphrase `Novapropsignature1`), ensures **the posted fields exactly match the signed fields**, and wires the **landing page CTA** to the server checkout.

---

# PropNova — Fix PayFast Signature (Live) + Wire Checkout

**Goal:** Stop `400 Bad Request — Generated signature does not match submitted signature` on PayFast.

**Root causes (typical):**

* Signing a different set of fields than you actually post (even an empty key breaks parity).
* Wrong signature construction (must be **alphabetical key order**, **spaces as `+`**, **percent escapes UPPERCASE**).
* Using the wrong environment (live vs sandbox) or wrong passphrase.

This brief enforces the exact rules, logs the base once for sanity, and posts a minimal form (no brittle querystrings).

---

## 0) Environment (Render)

Set these **exact** env vars and redeploy:

```env
# LIVE
PAYFAST_MODE=live
PAYFAST_MERCHANT_ID=31497961
PAYFAST_MERCHANT_KEY=j7zjpqxlrqqeo
PAYFAST_PASSPHRASE=Novapropsignature1
PAYFAST_REQUIRE_SIGNATURE=true

# Optional: log base strings during testing (turn off after success)
PAYFAST_DEBUG_SIGNATURE=true

API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=https://www.nova-prop.com
```

Also, at the **top of your Express server** (before any rate-limit), add:

```ts
app.set("trust proxy", true);
```

---

## 1) Helper — Clean fields + Build signature (A→Z, `+`, UPPERCASE %)

**Create** `src/lib/payfast-sign.ts`:

```ts
import crypto from "crypto";

const DEBUG = String(process.env.PAYFAST_DEBUG_SIGNATURE || "false") === "true";

/** encodeURIComponent with spaces as '+' and percent escapes UPPERCASE */
export function phpUrlEncode(s: string) {
  const enc = encodeURIComponent(s).replace(/%20/g, "+");
  return enc.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
}

/** Remove null/undefined/empty-string keys so form==signature fields */
export function cleanFields(obj: Record<string, any>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;     // IMPORTANT: do not sign or post empty values
    out[k] = sv;
  }
  return out;
}

/** Build the PayFast signature: A→Z keys, encode php-style, append passphrase, MD5 */
export function buildPayfastSignature(
  rawFields: Record<string, any>,
  passphrase: string
) {
  const fields = cleanFields(rawFields);
  const keys = Object.keys(fields).sort(); // A→Z
  const base = keys.map((k) => `${k}=${phpUrlEncode(fields[k])}`).join("&");
  const baseWithPass = passphrase ? `${base}&passphrase=${phpUrlEncode(passphrase)}` : base;
  const signature = crypto.createHash("md5").update(baseWithPass).digest("hex");

  if (DEBUG) {
    console.log("[PAYFAST DEBUG] checkout base:", baseWithPass);
    console.log("[PAYFAST DEBUG] checkout signature:", signature);
  }

  return { fields, signature };
}

export function renderAutoPostForm(action: string, fields: Record<string, string>) {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}" />`)
    .join("\n");
  return `<!doctype html>
<html><body>
  <form id="pf" method="post" action="${action}">
    ${inputs}
  </form>
  <script>document.getElementById('pf').submit();</script>
</body></html>`;
}
```

---

## 2) Checkout route — Post a real form; sign the **same fields** you post

**Create/replace** `src/routes/billing.checkout.ts`:

```ts
import { Router } from "express";
import { authRequired } from "../middleware/authz";
import { ensureOrg } from "../middleware/ensureOrg";
import { getPlan } from "../domain/plans";
import { buildPayfastSignature, renderAutoPostForm } from "../lib/payfast-sign";

const r = Router();

const PAYFAST_HOST =
  process.env.PAYFAST_MODE === "live"
    ? "https://www.payfast.co.za"
    : "https://sandbox.payfast.co.za";

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID!;
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY!;
const PASSPHRASE  = process.env.PAYFAST_PASSPHRASE || "";
const REQUIRE_SIG = String(process.env.PAYFAST_REQUIRE_SIGNATURE || "true") === "true";

r.post("/billing/checkout/:planId",
  authRequired,
  ensureOrg,
  async (req: any, res) => {
    const planId = String(req.params.planId);
    if (!["starter","growth"].includes(planId)) return res.status(400).json({ message: "Invalid plan" });
    const plan = getPlan(planId);

    const m_payment_id = `sub_${planId}_${req.user.orgId}_${Date.now()}`;

    // 1) Build the EXACT fields you intend to POST (omit blank keys)
    const baseFields: Record<string, string> = {
      // Merchant
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${process.env.APP_BASE_URL}/billing/return`,
      cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
      notify_url: `${process.env.API_BASE_URL}/payfast/itn`,

      // Buyer (omit name_last if blank)
      name_first: req.user.firstName || "PropNova",
      email_address: req.user.email,

      // Transaction
      m_payment_id,
      amount: plan.priceZar.toFixed(2),
      item_name: `PropNova ${plan.label} Subscription`,

      // Subscriptions
      subscription_type: "1",
      recurring_amount: plan.priceZar.toFixed(2),
      frequency: "3", // monthly
      cycles: "0",    // indefinite
    };

    // 2) Sign the same cleaned set we will POST
    let fieldsToPost = baseFields;
    if (REQUIRE_SIG) {
      const { fields, signature } = buildPayfastSignature(baseFields, PASSPHRASE);
      fieldsToPost = fields;
      fieldsToPost.signature = signature;
    }

    // 3) Render an auto-posting form (no fragile querystring)
    const html = renderAutoPostForm(`${PAYFAST_HOST}/eng/process`, fieldsToPost);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }
);

export default r;
```

**Mount** the route in your server bootstrap:

```ts
import billingCheckout from "./routes/billing.checkout";
app.use(billingCheckout);
```

---

## 3) ITN verification — recompute with the same rules

In your `/payfast/itn` route, verify the signature with the **same** algorithm:

```ts
import crypto from "crypto";
import { phpUrlEncode } from "../lib/payfast-sign";

function verifyItnSignature(pfData: Record<string,string>, passphrase: string) {
  const clean: Record<string,string> = {};
  for (const [k, v] of Object.entries(pfData)) {
    if (k === "signature") continue;
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    clean[k] = sv;
  }
  const keys = Object.keys(clean).sort(); // A→Z
  const base = keys.map(k => `${k}=${phpUrlEncode(clean[k])}`).join("&");
  const baseWithPass = passphrase ? `${base}&passphrase=${phpUrlEncode(passphrase)}` : base;
  const calc = crypto.createHash("md5").update(baseWithPass).digest("hex");
  return (pfData.signature || "").toLowerCase() === calc.toLowerCase();
}
```

> Keep your other ITN checks: **merchant_id match**, **amount match**, and **remote validate** (`POST ${PAYFAST_HOST}/eng/query/validate` with the **raw body**).

---

## 4) Landing page CTA — call server checkout (not `/billing`)

In your **canvas file** `Propnova Landing Page (vite + Shadcn)`, the Growth card still uses:

```jsx
<Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => (window.location.href = "/billing")}>Buy now</Button>
```

Replace it to call the server checkout:

```diff
+ import { startCheckout } from "@/lib/billing";

- <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => (window.location.href = "/billing")}>Buy now</Button>
+ <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => startCheckout("growth")}>Buy now</Button>
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

And ensure Vite env (frontend):

```env
VITE_API_URL=https://nova-prop-backend.onrender.com
```

---

## 5) PayFast dashboard sanity

* **Require signature:** ON
* **Security passphrase:** `Novapropsignature1` (exactly, no trailing spaces)
* **Notify URL (ITN):** `https://nova-prop-backend.onrender.com/payfast/itn`
* **Return URL:** `https://www.nova-prop.com/billing/return`
* **Cancel URL:** `https://www.nova-prop.com/billing/cancel`
* **Recurring Billing:** enabled

---

## 6) Acceptance checklist

* [ ] On clicking **Buy now (Growth)** the **PayFast form loads** (no 400).
* [ ] Render logs show **[PAYFAST DEBUG] checkout base** once; keys are **alphabetical**; spaces are `+`; `%xx` are **UPPERCASE**.
* [ ] Successful payment → PayFast hits **/payfast/itn** → org plan switches to *growth*; profile shows plan + limits.
* [ ] Turn off `PAYFAST_DEBUG_SIGNATURE` once verified.

---

### Notes

* The **exact same fields** you sign are posted to PayFast; no extras, no empties.
* If you must add optional fields later (e.g., `name_last`, `cell_number`), **include them only when non-empty**—and the helper will sign/post them automatically.
* If you test in **Sandbox**, switch both env and dashboard merchant creds; the helper auto-points to `https://sandbox.payfast.co.za`.

---

**Done.** This enforces PayFast’s signature rules and fixes the mismatch in live mode with your new passphrase.

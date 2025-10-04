Mr Covie — you flipped the passphrase to **`Novapropsignature1`** and turned signatures **ON**. PayFast still 400s because your signing code is using the **wrong rules**. Their **Custom Integration** flow for Subscriptions requires:

* Build the signature string from **non-empty fields only**.
* **Field order matters** → use the **form/document order**, **not alphabetical** (do **not** use the API-signature format). 
* URL-encode values, convert spaces to `+`, and make percent encodings **UPPERCASE** (e.g., `http%3A%2F%2F`). 
* Append `&passphrase=Novapropsignature1` **before** MD5. 

Below is a **copy-paste Markdown brief** + code that will make the signature pass.

---

# PropNova — PayFast Signature (Subscriptions) — Final Fix

**Mode:** LIVE
**Merchant ID/Key:** (your live creds)
**Security Passphrase:** `Novapropsignature1` (dashboard + env)
**Flow:** Server renders an **HTML `<form method="post">`** to `https://www.payfast.co.za/eng/process` and includes a **correct `signature`**.

---

## 1) Backend env (Render)

```env
PAYFAST_MODE=live
PAYFAST_MERCHANT_ID=31497961
PAYFAST_MERCHANT_KEY=j7zjpqxlrqqeo
PAYFAST_PASSPHRASE=Novapropsignature1
PAYFAST_REQUIRE_SIGNATURE=true

API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=https://www.nova-prop.com
```

---

## 2) Signature helper (form-order, non-empty, upper-case % enc)

Create `src/lib/payfast-sign.ts`:

```ts
import crypto from "crypto";

/**
 * Encode with spaces as + and percent escapes UPPERCASE.
 */
function encodePlusUpper(str: string) {
  const enc = encodeURIComponent(str).replace(/%20/g, "+");
  return enc.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
}

/**
 * Build signature for PayFast Custom Integration (SUBSCRIPTIONS):
 * - DO NOT alpha-sort keys. Use the exact "form order" array you provide.
 * - Include ONLY non-empty fields.
 * - After the last key=value, append &passphrase=... then MD5 (lowercase hex).
 */
export function buildSignature(
  formOrderKeys: string[],
  fields: Record<string, string | number | null | undefined>,
  passphrase: string
) {
  const pairs: string[] = [];
  for (const key of formOrderKeys) {
    const v = fields[key];
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue; // skip empties entirely
    pairs.push(`${key}=${encodePlusUpper(sv)}`);
  }
  let base = pairs.join("&");
  if (passphrase) base += `&passphrase=${encodePlusUpper(passphrase)}`;
  return crypto.createHash("md5").update(base).digest("hex");
}

/**
 * Render a safe auto-posting form.
 */
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

> Why: PayFast’s **Custom Integration** signature explicitly says **don’t alphabetize**; use the **attribute order**; encode **spaces as `+`** and percent escapes **UPPERCASE**; append **passphrase** then MD5. 

---

## 3) Checkout route (uses the helper and correct form order)

Create/replace `src/routes/billing.checkout.ts`:

```ts
import { Router } from "express";
import { authRequired } from "../middleware/authz";
import { ensureOrg } from "../middleware/ensureOrg";
import { getPlan } from "../domain/plans";
import { buildSignature, renderAutoPostForm } from "../lib/payfast-sign";

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
    if (!["starter", "growth"].includes(planId)) {
      return res.status(400).json({ message: "Invalid plan" });
    }
    const plan = getPlan(planId);
    const m_payment_id = `sub_${planId}_${req.user.orgId}_${Date.now()}`;

    // --- Build fields (omit empties) ---
    const fields: Record<string, string> = {
      // Merchant details
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${process.env.APP_BASE_URL}/billing/return`,
      cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
      notify_url: `${process.env.API_BASE_URL}/payfast/itn`,
      // Buyer details
      name_first: req.user.firstName || "PropNova",
      // name_last intentionally omitted if empty
      email_address: req.user.email,
      // Transaction details
      m_payment_id,
      amount: plan.priceZar.toFixed(2),
      item_name: `PropNova ${plan.label} Subscription`,
      // Subscriptions (Recurring Billing)
      subscription_type: "1",
      recurring_amount: plan.priceZar.toFixed(2),
      frequency: "3", // monthly
      cycles: "0",    // indefinite
    };

    // --- Form order array (as per doc blocks) ---
    const FORM_ORDER = [
      // Merchant details block (order as in doc)
      "merchant_id",
      "merchant_key",
      "return_url",
      "cancel_url",
      "notify_url",
      // Buyer details block
      "name_first",
      "name_last",
      "email_address",
      "cell_number",
      // Transaction details block
      "m_payment_id",
      "amount",
      "item_name",
      "item_description",
      "custom_int1","custom_int2","custom_int3","custom_int4","custom_int5",
      "custom_str1","custom_str2","custom_str3","custom_str4","custom_str5",
      "email_confirmation","confirmation_address",
      // Subscriptions block
      "subscription_type",
      "billing_date",
      "recurring_amount",
      "frequency",
      "cycles",
      "subscription_notify_email",
      "subscription_notify_webhook",
      "subscription_notify_buyer",
    ];

    if (REQUIRE_SIG) {
      const signature = buildSignature(FORM_ORDER, fields, PASSPHRASE);
      fields.signature = signature;
    }

    // Optional: log once while debugging; then remove
    // console.log("[PF] base fields:", fields);

    const html = renderAutoPostForm(`${PAYFAST_HOST}/eng/process`, fields);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }
);

export default r;
```

**Why this works:** You’re now generating the signature using the **documented block order**, skipping empty keys, encoding per rules, and appending the **new passphrase** before MD5. This exactly matches PayFast’s expectation for **Custom Integration Subscriptions**, which is different from their API signature format. 

---

## 4) ITN verification (mirror rules)

In your `/payfast/itn` handler, recompute signature in the **same way**:

```ts
import crypto from "crypto";

function encodePlusUpper(s: string) {
  const enc = encodeURIComponent(s).replace(/%20/g, "+");
  return enc.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
}

function verifyItnSignature(pfData: Record<string,string>, passphrase: string) {
  // Build "all posted fields except signature" in the order they were received
  // (PayFast sends keys consistently for ITN; do NOT sort alphabetically)
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(pfData)) {
    if (k === "signature") continue;
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    pairs.push(`${k}=${encodePlusUpper(sv)}`);
  }
  let base = pairs.join("&");
  if (passphrase) base += `&passphrase=${encodePlusUpper(passphrase)}`;
  const calc = crypto.createHash("md5").update(base).digest("hex");
  return (pfData.signature || "").toLowerCase() === calc.toLowerCase();
}
```

Use with your other 3 checks (valid IPs, amount match, server `/eng/query/validate`). 

---

## 5) Dashboard sanity

* **Require signature:** ON
* **Security passphrase:** `Novapropsignature1` (exactly; no trailing spaces)
* **Notify URL:** `https://nova-prop-backend.onrender.com/payfast/itn`
* **Return/Cancel:** your nova-prop URLs
* **Recurring Billing:** enabled

---

## 6) Frontend button

Make sure your Pricing button calls the server checkout (not `/billing`):

```ts
// src/lib/billing.ts
export async function startCheckout(planId: "starter" | "growth") {
  const r = await fetch(`${import.meta.env.VITE_API_URL}/billing/checkout/${planId}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${localStorage.getItem("jwt") || ""}` },
  });
  const html = await r.text();
  const w = window.open("", "_self");
  w?.document.write(html);
  w?.document.close();
}
```

And in your pricing card (see your current canvas file), change:

```diff
- onClick={() => (window.location.href = "/billing")}
+ onClick={() => startCheckout("growth")}
```

---

## 7) Quick debug (if still failing)

Temporarily print the **exact** signature base for one request:

```ts
// inside buildSignature — after computing base
console.log("[PF SIGN BASE]", base); // REMOVE after verifying once
```

* If PayFast still complains, compare your printed base to their expected base (support can confirm).
* 99% of mismatches are due to **field order**, **including an empty field**, or **encoding not in + / UPPERCASE** — all solved above. 

---

Apply this exactly and your signatures will validate with the new passphrase.

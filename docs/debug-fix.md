Mr Covie — your debug shows you’re **signing in “block/form” order**. PayFast’s **signature rule for web/checkout + recurring** is to **MD5 the alphabetically-sorted key=value pairs (non-empty only), then append `&passphrase=...` and hash**. If the order isn’t A→Z, you’ll get exactly this error. Also make sure spaces are `+` and percent escapes are **UPPERCASE**. ([PayFast Developer Documentation][1])

Below is a tight, drop-in fix (helper + route) and a short checklist.

---

# ✅ Fix PayFast Signature (A→Z order, + for spaces, UPPERCASE %)

## 1) Env (Render)

Keep these (live mode + your new passphrase):

```env
PAYFAST_MODE=live
PAYFAST_MERCHANT_ID=31497961
PAYFAST_MERCHANT_KEY=j7zjpqxlrqqeo
PAYFAST_PASSPHRASE=Novapropsignature1
PAYFAST_REQUIRE_SIGNATURE=true

API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=https://www.nova-prop.com
```

## 2) Signature helper (alphabetical order; non-empty; `+` and UPPERCASE %)

`src/lib/payfast-sign.ts`

```ts
import crypto from "crypto";

/** encodeURIComponent with spaces as '+' and percent escapes UPPERCASE */
export function encodePlusUpper(s: string) {
  const enc = encodeURIComponent(s).replace(/%20/g, "+");
  return enc.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
}

/** Build the PayFast signature: sort keys A→Z, drop empties, append passphrase, MD5 hex */
export function buildAlphabeticalSignature(
  fields: Record<string, string | number | null | undefined>,
  passphrase: string
) {
  // 1) remove null/undefined/empty-string
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    clean[k] = sv;
  }

  // 2) A→Z order + encode
  const base = Object.keys(clean)
    .sort() // <— IMPORTANT: alphabetical
    .map((k) => `${k}=${encodePlusUpper(clean[k])}`)
    .join("&");

  // 3) append passphrase and MD5
  const baseWithPass = passphrase
    ? `${base}&passphrase=${encodePlusUpper(passphrase)}`
    : base;

  const signature = crypto.createHash("md5").update(baseWithPass).digest("hex");
  return { signature, baseWithPass };
}
```

## 3) Checkout route (POST form + correct signature)

`src/routes/billing.checkout.ts`

```ts
import { Router } from "express";
import { authRequired } from "../middleware/authz";
import { ensureOrg } from "../middleware/ensureOrg";
import { getPlan } from "../domain/plans";
import { buildAlphabeticalSignature, encodePlusUpper } from "../lib/payfast-sign";

const r = Router();

const PAYFAST_HOST =
  process.env.PAYFAST_MODE === "live"
    ? "https://www.payfast.co.za"
    : "https://sandbox.payfast.co.za";

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID!;
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY!;
const PASSPHRASE  = process.env.PAYFAST_PASSPHRASE || "";
const REQUIRE_SIG = String(process.env.PAYFAST_REQUIRE_SIGNATURE || "true") === "true";

function renderAutoPostForm(action: string, fields: Record<string, string>) {
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

r.post("/billing/checkout/:planId",
  authRequired,
  ensureOrg,
  async (req: any, res) => {
    const planId = String(req.params.planId);
    if (!["starter","growth"].includes(planId)) return res.status(400).json({ message: "Invalid plan" });
    const plan = getPlan(planId);

    const m_payment_id = `sub_${planId}_${req.user.orgId}_${Date.now()}`;

    // Build fields (DO NOT include empty strings)
    const fields: Record<string, string> = {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${process.env.APP_BASE_URL}/billing/return`,
      cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
      notify_url: `${process.env.API_BASE_URL}/payfast/itn`,
      name_first: req.user.firstName || "PropNova",
      email_address: req.user.email,
      m_payment_id,
      amount: plan.priceZar.toFixed(2),
      item_name: `PropNova ${plan.label} Subscription`,
      subscription_type: "1",
      recurring_amount: plan.priceZar.toFixed(2),
      frequency: "3", // monthly
      cycles: "0",
    };

    // Remove any accidental empties just in case
    for (const k of Object.keys(fields)) {
      if (!fields[k] || fields[k].trim() === "") delete fields[k];
    }

    if (REQUIRE_SIG) {
      const { signature, baseWithPass } = buildAlphabeticalSignature(fields, PASSPHRASE);
      fields.signature = signature;

      // TEMP debug one time (compare with your previous logs)
      console.log("[PAYFAST DEBUG] checkout base (A->Z):", baseWithPass);
      console.log("[PAYFAST DEBUG] checkout signature:", signature);
    }

    const html = renderAutoPostForm(`${PAYFAST_HOST}/eng/process`, fields);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }
);

export default r;
```

### What changes vs your current debug

Your printed base used **block/form order**. The code above builds the signature on **A→Z order** of keys (e.g., `amount`, `cancel_url`, `cycles`, `email_address`, …, `subscription_type`). That matches PayFast’s signature spec and prevents the 400. Also note **UPPERCASE percent encodings** and spaces as `+`. ([PayFast Developer Documentation][1])

## 4) ITN: verify with the same rules

In your `/payfast/itn` handler, recompute signature the same way (A→Z over non-empty keys excluding `signature`), plus the other checks (remote validate, merchant_id match, amount match):

```ts
function verifyItnSignature(pfData: Record<string,string>, passphrase: string) {
  // drop signature & empties; A→Z order
  const clean: Record<string,string> = {};
  for (const [k,v] of Object.entries(pfData)) {
    if (k === "signature") continue;
    if (v === undefined || v === null) continue;
    const sv = String(v).trim();
    if (!sv) continue;
    clean[k] = sv;
  }
  const keys = Object.keys(clean).sort();
  const base = keys.map(k => `${k}=${encodePlusUpper(clean[k])}`).join("&");
  const baseWithPass = passphrase ? `${base}&passphrase=${encodePlusUpper(passphrase)}` : base;
  const calc = crypto.createHash("md5").update(baseWithPass).digest("hex");
  return (pfData.signature || "").toLowerCase() === calc.toLowerCase();
}
```

(Then still do PayFast’s **/eng/query/validate** “remote validate” request and your **amount** check.) ([Payfast by Network][2])

---

## 5) Dashboard sanity

* **Require signature:** ON
* **Security passphrase:** exactly `Novapropsignature1` (no spaces)
* **Notify URL:** `https://nova-prop-backend.onrender.com/payfast/itn`
* **Return/Cancel:** your nova-prop URLs
* **Recurring Billing:** enabled

---

## 6) Quick checklist (run once)

* [ ] The **debug base** line now shows keys in **alphabetical** order (not block order).
* [ ] The hosted page **loads** (no 400).
* [ ] After paying, ITN verifies and upgrades org plan.

---

### Why this fixes your 400

PayFast rejects when the **signature base string** differs from what **they** build. The two most common causes are **wrong key order** and **encoding** (spaces and lowercase `%xx`). The code above enforces **A→Z order**, **`+` for spaces**, **UPPERCASE percent escapes**, and appends your new passphrase **before** hashing — exactly what their docs describe. ([PayFast Developer Documentation][1])

If you still hit issues, paste the new `[PAYFAST DEBUG] checkout base (A->Z)` line here and we’ll eyeball the order immediately.

[1]: https://developers.payfast.co.za/api?utm_source=chatgpt.com "The Payfast API and integration can be ..."
[2]: https://support.payfast.help/portal/en/kb/articles/what-causes-the-itn-security-check-errors-20-9-2022?utm_source=chatgpt.com "What causes the ITN security check errors? - Payfast by Network"

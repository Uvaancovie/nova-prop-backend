Mr Covie — the error message:

> **“Merchant unable to receive payments due to invalid account details provided.”**

…and your URL shows:

* `host = https://sandbox.payfast.co.za`
* `merchant_id=31497961` (your **live** merchant)
* `merchant_key=j7zjpqxlrqqeo` (your **live** key)
* `notify_url=http://localhost:4000/payfast/itn`
* `m_payment_id=sub_growth_unknown_…` (no orgId)

That combo will trigger a 400 in Sandbox. Here’s exactly how to fix it.

---

## Fix checklist (do all 5)

1. **Use matching creds for the environment**

   * If you’re calling **sandbox.payfast.co.za**, you **must** use a **Sandbox merchant** (different Merchant ID/Key from the Sandbox dashboard).
   * If you only have **live** credentials, switch `PAYFAST_MODE=live` and call `https://www.payfast.co.za/eng/process` (not sandbox).

2. **Make `notify_url` public (not localhost)**

   * Set to: `https://nova-prop-backend.onrender.com/payfast/itn`
   * Localhost **won’t work** for ITN because PayFast’s servers can’t reach your machine.

3. **Return/Cancel URLs**

   * For local dev, you *can* use `http://localhost:5173/billing/return` and `/cancel` (browser redirect).
   * For production, use your live site: `https://www.nova-prop.com/billing/return`.

4. **Ensure `orgId` is present (no more `unknown`)**

   * Add `ensureOrg` before the checkout handler so `m_payment_id=sub_<planId>_<orgId>_<ts>` contains a real org id.

   ```ts
   r.post("/billing/checkout/:planId",
     authRequired,
     ensureOrg,        // <-- add this
     async (req, res) => { /* ... */ }
   );
   ```

5. **Passphrase & signature must match dashboard**

   * In your PayFast dashboard set the **Security Passphrase**.
   * In `.env` set `PAYFAST_PASSPHRASE=Propnovajason123`.
   * Your signature code should append `&passphrase=<…>` **before** MD5 (you already do this).

---

## Correct env + URLs (Sandbox route)

If you want to stay on **Sandbox**:

* Create a **Sandbox merchant** in PayFast and copy its **Sandbox Merchant ID/Key**.
* On Render set:

```
PAYFAST_MODE=sandbox
PAYFAST_MERCHANT_ID=<YOUR_SANDBOX_MERCHANT_ID>
PAYFAST_MERCHANT_KEY=<YOUR_SANDBOX_MERCHANT_KEY>
PAYFAST_PASSPHRASE=Propnovajason123
API_BASE_URL=https://nova-prop-backend.onrender.com
APP_BASE_URL=http://localhost:5173   # for local UI testing
```

Your server should build (automatically) a URL like:

```
https://sandbox.payfast.co.za/eng/process?
merchant_id=<SANDBOX_ID>&merchant_key=<SANDBOX_KEY>
&return_url=http%3A%2F%2Flocalhost%3A5173%2Fbilling%2Freturn
&cancel_url=http%3A%2F%2Flocalhost%3A5173%2Fbilling%2Fcancel
&notify_url=https%3A%2F%2Fnova-prop-backend.onrender.com%2Fpayfast%2Fitn
&m_payment_id=sub_growth_<ORGID>_<TS>
&item_name=PropNova%20Growth%20Subscription
&amount=199.00&subscription_type=1&recurring_amount=199.00&frequency=3&cycles=0
&signature=<md5>
```

---

## Common causes of that exact error (so you can rule them out)

* **Live credentials on sandbox** (your current case) or vice versa.
* Merchant account **not enabled for Subscriptions** (toggle Recurring Billing in dashboard).
* **Passphrase mismatch** (dashboard vs env vs how you sign).
* **ITN URL invalid** (localhost / http to a server that forces https).
* **Amount** not matching the plan you assert server-side (rare for initial attempt).

---

## Quick sanity test

1. Hit a small **diagnostic** endpoint to confirm env at runtime:

```ts
r.get("/_diag/payfast", (_req, res) => {
  res.json({
    mode: process.env.PAYFAST_MODE,
    merchantIdPresent: !!process.env.PAYFAST_MERCHANT_ID,
    merchantKeyPresent: !!process.env.PAYFAST_MERCHANT_KEY,
    passphrasePresent: !!process.env.PAYFAST_PASSPHRASE,
    appBaseUrl: process.env.APP_BASE_URL,
    apiBaseUrl: process.env.API_BASE_URL,
  });
});
```

2. Ensure it returns `mode: "sandbox"`, all three `Present: true`, and the correct base URLs.

3. Retry the **Buy now** flow. You should reach the PayFast hosted page with **no 400**.

---

If you want, I can also give you a tiny “env guard” that throws at boot if any of the required PayFast envs are missing, so you never see `merchant_id=undefined` again.

# PayFast Integration

Dashboard settings:
- Require signature: ON
- Notify URL (ITN): https://nova-prop-backend.onrender.com/payfast/itn
- Return URL: https://www.nova-prop.com/billing/return
- Cancel URL: https://www.nova-prop.com/billing/cancel
- Tokenization: OFF (optional later)
- IP whitelist: blank for sandbox; add PayFast IPs in prod.

## Raw body capture (server.ts) BEFORE urlencoded:
app.use((req: any, _res, next) => {
  if ((req.headers["content-type"] || "").includes("application/x-www-form-urlencoded")) {
    let buf = ""; req.on("data", c => buf += c); req.on("end", () => { req.rawBody = buf; next(); });
  } else next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

## src/lib/payfast.ts
export const PAYFAST_HOST = process.env.PAYFAST_MODE === "live" ? "https://www.payfast.co.za" : "https://sandbox.payfast.co.za";
export const MERCHANT_ID  = process.env.PAYFAST_MERCHANT_ID!;
export const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY!;
export const PASSPHRASE   = process.env.PAYFAST_PASSPHRASE || "";

## src/routes/billing.checkout.ts
POST /billing/checkout/:planId ("starter"|"growth")
- Build signed query (alpha-sort → urlencode → append passphrase → md5).
- Set notify_url = ${API_BASE_URL}/payfast/itn
- Return tiny HTML that auto-posts to PayFast hosted process.

## src/routes/payfast.itn.ts
POST /payfast/itn
- Recompute md5 signature (alpha-sort + url-encode + passphrase).
- Check merchant_id; (recommended) remote validate via /eng/query/validate using req.rawBody.
- Parse m_payment_id = "sub_<planId>_<orgId>_<ts>".
- Check amount vs server plan price.
- Map payment_status → subscriptionStatus ("COMPLETE"→active; "CANCELLED"→canceled; "FAILED"→past_due; else inactive).
- Update Organization.planId + subscriptionStatus. Upsert Subscription.
- Always res.status(200).send("OK") to avoid retry storms.

Mount routes:
app.use(require("./routes/billing.checkout").default);
app.use(require("./routes/payfast.itn").default);

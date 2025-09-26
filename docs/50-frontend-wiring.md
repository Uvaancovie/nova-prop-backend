# Frontend (Vite + shadcn) Wiring

Env:
- VITE_API_URL=https://nova-prop-backend.onrender.com

## useOrgSummary hook
- GET ${VITE_API_URL}/me/summary with credentials + Authorization Bearer.
- Returns plan + properties usage.

## ProfilePage
- Show plan badge (Free/Starter/Growth • status)
- Show meter: used/max properties.

## Navbar chip (optional)
- Show {plan.label} • {used}/{max}.

## AddPropertyPage
- Fetch /me/summary; if used>=max → disable submit & show “Upgrade” modal.
- Still rely on server 403 (authoritative).

## Public browse & detail
- /browse-properties → GET /api/properties/public (grid of cards).
- /property/:slug or /p/:slug → GET /api/properties/by-slug/:slug (public detail).

## Landing page (canvas file: "Propnova Landing Page (vite + Shadcn)")
- **Change Growth “Buy now” button** to call checkout:

async function startCheckout(planId) {
  const r = await fetch(`${import.meta.env.VITE_API_URL}/billing/checkout/${planId}`, {
    method: "POST", credentials: "include",
    headers: { Authorization: `Bearer ${localStorage.getItem("jwt")||""}` }
  });
  const html = await r.text();
  const w = window.open("", "_self");
  w?.document.write(html);
  w?.document.close();
}

<Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => startCheckout("growth")}>Buy now</Button>

## BillingReturn page (/billing/return)
- Poll /me/summary every 2s up to 20s; when plan.id != "free" && status=="active" → navigate("/profile").

## BillingCancel page (/billing/cancel)
- Simple “Payment canceled” view.

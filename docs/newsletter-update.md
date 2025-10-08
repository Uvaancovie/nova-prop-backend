Here you go, **Mr Covie** — an **expert, goal-based prompt** you can paste straight into your **Claude 4 Sonnet** agent. It’s written to drive a professional **UI/UX with shadcn**, matches your current **Vite + React + Tailwind + shadcn** stack, respects your **roles (client/realtor)**, and enforces the **10 newsletters / month** limit. It also ensures **DM kickoff on subscribe**, and updates the **navbar** (replace duplicate Browse with **News**) across your existing layout (see your canvas “Propnova Landing Page (vite + Shadcn)” header).

---

# 📌 Expert Prompt — Implement PropNova Realtor Newsletters (Quota, Image+CTA, Inbox UX) with shadcn

**You are a senior full-stack engineer** implementing a polished **Newsletter** feature for **PropNova**. Tech: **Express + Mongoose + Vite/React + Tailwind + shadcn/ui + lucide-react**. Maintain our purple theme (Tailwind `violet` scale), clean whitespace, and accessible components.

Deliver **pixel-tight, mobile-first** UI and secure backend with **role guards**. Strictly follow the tasks below.

---

## 🎯 Goal

1. **Clients** can **subscribe/unsubscribe** to a **realtor’s newsletter** from **Browse/Property** pages.
2. **Realtors** can **compose** up to **10 newsletters per calendar month** and send to all active subscribers.
3. Newsletters support **Title + Body + Image (URL) + CTA (label+URL)**.
4. **Clients** view newsletters in a dedicated **News inbox** (email-like list + preview).
5. On **subscribe**, auto-create/ensure a **DM conversation**, send **system messages** to both sides, and return `conversationId` so the client can “Message Realtor” immediately.
6. Update **navbar** to include **News** (replace the duplicate Browse entry). Show **News** for both roles; route to different pages:

   * Client → `/news` (inbox)
   * Realtor → `/realtor/news` (composer + subscribers + sent)

---

## ✅ Non-Negotiable Requirements

* **Monthly quota:** Max **10 newsletters** per realtor per **calendar month**. Block the 11th with HTTP **429** and JSON `{ code: "NEWSLETTER_MONTHLY_QUOTA_REACHED" }`.
* **A11y & UX:** Use **shadcn** components (`Card`, `Tabs`, `Button`, `Input`, `Textarea`, `Badge`, `Dialog`, `Sheet`, `Avatar`, `Separator`, `Skeleton`). Keyboard accessible; proper focus states; responsive on mobile.
* **Security:** `requireClient`, `requireRealtor`, and ownership checks on subscriber lists and sends.
* **Performance:** Paginate lists; index queries; use `insertMany` for deliveries.
* **Sanitization:** No raw HTML injection; treat body as plain text (preserve newlines). CTA URL must be `https`.
* **Telemetry:** Log quota checks and send events.
* **Styling:** Purple accent (`violet-600/700`), professional spacing, subtle borders (`border-violet-100`), and modern cards.

---

## 🗂 Data Model (Mongoose)

Create/confirm models:

### `NewsletterSubscription`

```ts
realtorId: ObjectId (User, idx)
clientId:  ObjectId (User, idx)
status:    "subscribed" | "unsubscribed" (default "subscribed")
unsubscribedAt?: Date
timestamps: true
unique index: { realtorId: 1, clientId: 1 }
```

### `Newsletter`

```ts
realtorId: ObjectId (User, idx)
title: string (<=120)
body: string (<=8000)
imageUrl?: string
cta?: { label: string; url: string } // url must be https
sentAt?: Date
stats: { recipients: number; delivered: number; opened: number } // opened reserved
timestamps: true
index: { realtorId: 1, createdAt: -1 }
```

### `Conversation` (new, for DM thread)

```ts
type: "realtor_client"
realtorId: ObjectId (User, idx)
clientId:  ObjectId (User, idx)
lastMessageAt: Date
timestamps: true
unique index: { realtorId: 1, clientId: 1 }
```

### `Message` (reuse)

Ensure supports:

```ts
conversationId: ObjectId (Conversation)
toUserId: ObjectId (User)
fromUserId: ObjectId (User)
type: "newsletter" | "dm" | "system"
subject?: string
body: string
meta?: any // { newsletterId?, imageUrl?, cta?, kind? }
timestamps: true
```

---

## 🔐 Middleware

* `requireClient`, `requireRealtor` role guards.
* `canDMRealtor` — allow client to DM realtor only if subscribed; realtors always allowed.

---

## 🧠 Monthly Quota

```ts
function monthWindow(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth();
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
}

async function assertNewsletterQuota(realtorId: ObjectId) {
  const { start, end } = monthWindow();
  const count = await Newsletter.countDocuments({
    realtorId, createdAt: { $gte: start, $lt: end }
  });
  if (count >= 10) {
    const err: any = new Error("Monthly newsletter limit reached (10/10)");
    err.status = 429; err.code = "NEWSLETTER_MONTHLY_QUOTA_REACHED";
    throw err;
  }
}
```

---

## 🧭 Backend Endpoints (Express)

Mount router at `/newsletter`.

1. **POST** `/newsletter/subscribe` (client)
   **Body**: `{ realtorId }`
   Steps:

   * Upsert `NewsletterSubscription` → `status: 'subscribed'`.
   * **Ensure conversation** for `(realtorId, clientId)`; create if missing.
   * **System message → realtor**: “New subscriber: {clientName} ({email})”.
   * **System message → client**: “You’re subscribed and can message this realtor.”
   * **Return** `{ ok: true, conversationId }`.

2. **POST** `/newsletter/unsubscribe` (client)
   **Body**: `{ realtorId }`

   * Set `status: 'unsubscribed'`, `unsubscribedAt: now`.
   * System message to client: “You unsubscribed.”
   * Return `{ ok: true }`.

3. **GET** `/newsletter/subscribers?page=&pageSize=` (realtor)

   * List `status: 'subscribed'` with `clientId {name,email}`; paginate.
   * Return `{ page, pageSize, total, rows }`.

4. **POST** `/newsletter/send` (realtor)
   **Body**: `{ title, body, imageUrl?, cta?: { label, url } }`

   * Validate lengths; CTA URL must be `https`.
   * **Enforce quota** via `assertNewsletterQuota`.
   * Create `Newsletter` (with `sentAt: now`).
   * Fetch all `subscribed` recipients.
   * Bulk `Message.insertMany` with `type: 'newsletter'`, `subject: title`, `body`, meta `{ newsletterId, imageUrl, cta }`.
   * Update `stats.delivered`.
   * Return `{ ok: true, newsletterId, recipients }`.

> Add basic `express-rate-limit` (e.g., 5 sends / 15 min per realtor) on `/send`.

---

## 🖥️ Frontend (Vite/React + shadcn)

### 1) **Navbar** (update both app shells)

* Replace duplicate **Browse** link with **News**:

  * **Client → `/news`**
  * **Realtor → `/realtor/news`**
* Keep professional spacing, `text-muted-foreground` for idle, hover to `text-foreground`.

### 2) **Client News Inbox** — `/news`

* **Layout**:

  * `Card` with two-pane inbox (sm: stacked; md+: `grid-cols-[320px_1fr]`).
  * **Left list**: newsletter messages (subject, snippet, date, unread dot via `Badge`).
  * **Right preview**:

    * Title (xl), time, realtor name/avatar, body (pre-wrapped), optional `imageUrl` (rounded `img`), optional CTA (`Button variant="secondary"` opening `target="_blank"`).
* **Data**: reuse messages API (`GET /messages?type=newsletter&page=`).
* **Empty state**: “No newsletters yet — subscribe on a property to get updates.”
* **Mark as read** on open (optional).

### 3) **Subscribe Button** (on Browse/PropertyDetails)

* `SubscribeButton` (shadcn `Button`) that toggles subscribe/unsubscribe.
* On **subscribe success**, use returned `conversationId` to display a **“Message Realtor”** button:

  * `Button className="bg-violet-600 hover:bg-violet-700"` → `navigate("/messages?thread=" + conversationId)`
* Initial state prop: `isSubscribedToOwner` from property GET (server should compute).

### 4) **Realtor News Page** — `/realtor/news`

* **Tabs**: `Compose`, `Subscribers`, `Sent`

  * **Compose** (Card):

    * Inputs: `Title` (`Input`), `Body` (`Textarea`), `Image URL` (`Input`), `CTA Label` / `CTA URL` (`Input` x 2).
    * **Live preview** Card: render title/body; show image preview if URL; show CTA button.
    * **Quota meter**: `Badge` “You’ve sent X/10 this month”; disable **Send** when met.
    * `Button className="bg-violet-600 hover:bg-violet-700"` to send; toast feedback.
  * **Subscribers** (Card):

    * Paginated list (name, email, since).
    * Empty state if none.
  * **Sent** (Card):

    * List past newsletters with recipients count and sent date.

### 5) **Messages Rendering**

* In `MessagesPage`, add renderer for:

  * `type === 'newsletter'` → **NewsletterCard** (same style as News preview).
  * `type === 'system'` → subtle gray info block.

---

## 🧪 QA Checklist

* **Subscribe flow**: Client subscribes → API returns `conversationId` → client sees toast + “Message Realtor” → realtor receives system message.
* **Quota**: Send 10 newsletters; 11th rejected with 429 & proper code.
* **Inbox**: Client `/news` shows list + preview; image & CTA render; responsive.
* **Security**: Only realtor sees their subscribers; client can DM only if subscribed.
* **Navbar**: “News” visible and routes per role; duplicate Browse removed.
* **A11y**: Keyboard navigation in lists, focus outline on buttons/links.

---

## 🧱 Implementation To-Do (Step-by-Step)

1. **Models**: Add `Newsletter`, `NewsletterSubscription`, `Conversation` (unique index).
2. **Middleware**: `requireClient`, `requireRealtor`, `canDMRealtor`.
3. **Routes**: Implement `/newsletter/subscribe`, `/unsubscribe`, `/subscribers`, `/send` with quota & validation.
4. **Messages**: Bulk insert newsletter deliveries; system messages on subscribe/unsubscribe; update DM send route if needed.
5. **Navbar**: Replace duplicate Browse with **News**; wire routes `/news` & `/realtor/news`.
6. **Client UI**: Build **News** inbox (list + preview) with shadcn; integrate messages API.
7. **Property UI**: Add `SubscribeButton`; on success show **Message Realtor** using `conversationId`.
8. **Realtor UI**: Build `/realtor/news` with Tabs (Compose/Subscribers/Sent), live preview, quota meter, polished shadcn styling.
9. **Validation**: CTA URL must be `https`; trim lengths; sanitize text.
10. **Perf & DX**: indexes, pagination, `insertMany`, clear error codes; small skeleton loaders.

---

## 🎨 UI Notes (shadcn + Tailwind)

* Use Cards with `border-violet-100`, `rounded-2xl`, comfortable padding.
* Headings: `text-2xl font-bold` (desktop), `text-xl` (mobile).
* Buttons: primary `bg-violet-600 hover:bg-violet-700`, secondary `variant="outline"` or subtle `variant="secondary"`.
* Badges for quota/unread states; `Separator` between list items; `Skeleton` on load.
* Keep visuals consistent with your existing **Propnova** landing (purple + white, clean).

---

**Deliverable:** push backend routes/models + front-end pages/components; pass QA checklist; keep code type-safe where possible; include concise comments.
# PropStream Backend API
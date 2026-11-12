# Interlock

**Let AI do the shopping. You keep the keys.**

Interlock is a safety layer that sits between an AI shopping assistant and PayPal. The assistant can ask for anything, but deterministic code (not another AI model) checks every request against the user's spending rules before PayPal is ever contacted.

Built for the PayPal AI Hackathon. Everything runs in the **PayPal sandbox** with test accounts. No real money moves.

## The problem

AI agents can now spend money on our behalf. But an agent can be tricked: a product page can hide instructions, a tool result can be tampered with, or the model can simply get confused. Today, if an agent is allowed to pay, there is often nothing between "the model decided" and "the money moved".

Machines solved this long ago with safety interlocks: a simple mechanism that physically stops the machine no matter what the controller says. Interlock brings that idea to agentic commerce.

## What it does

1. **You set the rules**: most per order, most per week, "ask me first above $X", and which categories the assistant may buy.
2. **The assistant proposes**: an AI agent searches a catalog, reads product pages, and proposes a purchase.
3. **Interlock decides**: plain code checks the proposal and returns one of three verdicts: **approved**, **needs your OK**, or **blocked**.
4. **PayPal is only called on yes**: a blocked request never reaches PayPal. An approved one creates a PayPal sandbox order that the buyer approves and the app captures.
5. **Everything is recorded** in an activity log (a "flight recorder").

### The checks

| Check | What it catches |
| --- | --- |
| Known item | Items that are not in the trusted catalog |
| Quantity | Absurd or invalid quantities |
| Price integrity | An agent claiming a different price than the catalog price |
| Currency | Wrong currency |
| Category | Categories the user did not allow (for example gift cards) |
| Per-order cap | A single order over the user's limit |
| Weekly cap | Spending that would exceed the weekly limit |
| Approval threshold | Larger orders wait for the user's explicit OK |

Two design rules make it hard to fool:

- **The AI never holds the keys.** The assistant's only way to spend is one guarded endpoint (`/api/purchase`). There is no code path where the model talks to PayPal directly.
- **Prices come from the trusted catalog, not from the agent.** Even for an approved purchase, the amount sent to PayPal is calculated from the catalog, never from what the agent claimed.

PayPal capture only happens for orders this app created and approved itself.

## How PayPal and AI are used

**PayPal (sandbox)**: the Orders v2 REST API.
- Create an order (`intent: CAPTURE`) with return and cancel URLs, after Interlock approves.
- The buyer approves at PayPal (sandbox checkout).
- On return, the app captures the order and records the payment.

**AI**: Google Gemini through the Vercel AI SDK, with three tools:
- `search_products`: look up items in the catalog.
- `read_product_page`: read a merchant page (one page contains a planted prompt injection for testing).
- `propose_purchase`: request a purchase. This calls the guarded endpoint, and the verdict comes back to the model.

The agent has a fallback chain across Gemini models, so a busy or retired model does not break the demo.

### Testing the defense

- **"Easy to fool" mode** removes the injection warning from the assistant's prompt. Asking it to read the desk lamp page exposes it to hidden instructions telling it to buy a $500 gift card. Whether the model follows them or not, PayPal is never contacted for that purchase.
- **"Play the attacker" buttons** replay what a hijacked assistant would try: buying a $500 gift card, or changing a price. Both are blocked, with the reasons shown on a receipt.

## Architecture

```
You (rules) ──► Interlock rules ◄──────────────┐
                    ▲                          │
AI assistant ──► propose_purchase ──► /api/purchase ──► verdict
 (Gemini)                                 │
                                  allow / approved only
                                          ▼
                                   PayPal Orders API (sandbox)
                                          │
                              buyer approves at PayPal
                                          ▼
                              /api/paypal/return ──► capture ──► activity log
```

## Run it locally

**Prerequisites:** Node.js 18 or newer, a free PayPal developer account with a sandbox app, and a free Google Gemini API key.

```bash
git clone https://github.com/YOUR_USERNAME/interlock.git
cd interlock
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
GEMINI_API_KEY=your_gemini_api_key
```

Use **sandbox** credentials from the PayPal developer dashboard (Apps & Credentials, Sandbox). The seller should be a **US sandbox Business account**. Then start the app:

```bash
npm run dev
```

Open **http://localhost:3001**.

You can also run the rule engine on its own, with no network or keys:

```bash
npx tsx lib/interlock/demo.ts
```

## Try it (walkthrough for judges)

1. Click **Try buying a $500 gift card**. The receipt is stamped **BLOCKED** and says PayPal was never contacted.
2. Click **Try changing the price**. It is blocked because the price does not match the catalog.
3. In the phone chat, tap **Buy a USB-C cable**. The assistant proposes it, Interlock approves, and a PayPal sandbox order is created. Click **Pay with PayPal sandbox** and log in with the test buyer below. After payment, the page shows the receipt as paid and the activity tape records it.
4. Lower **Most on one order** with the **−** button to $10, then buy the cable again. It is now blocked by your own rule.
5. Turn on **Make the assistant easy to fool**, then tap **Read the lamp page (hidden trick)** and watch the receipts.

**Sandbox buyer (test account only):**

- Email: `PUT_SANDBOX_BUYER_EMAIL_HERE`
- Password: `PUT_SANDBOX_BUYER_PASSWORD_HERE`

Use an incognito window so a real PayPal login does not interfere. These are fake sandbox credentials. No real account or money is involved.

## Project structure

```
app/page.tsx                    The interface
app/api/purchase/route.ts       The guarded purchase endpoint (Interlock -> PayPal)
app/api/agent/route.ts          The AI assistant (Gemini + tools)
app/api/mandate/route.ts        Read and update the user's rules
app/api/audit/route.ts          The activity log
app/api/reset/route.ts          Reset the demo
app/api/paypal/return/route.ts  Capture after the buyer approves
app/api/paypal/cancel/route.ts  Buyer cancelled
lib/interlock/interlock.ts      The rule engine (pure, deterministic)
lib/interlock/catalog.ts        Trusted catalog (source of truth for prices)
lib/interlock/pages.ts          Mock merchant pages (one with a planted injection)
lib/interlock/state.ts          In-memory rules, pending orders and audit log
lib/interlock/demo.ts           Rule-engine scenarios you can run offline
lib/paypal.ts                   PayPal Orders v2 client (sandbox)
```

## Limitations and what's next

- State (rules, spending, the log) is kept in memory and resets when the server restarts. This is intentional for a demo.
- The catalog is a small mock store. Next: connect real product search and merchant allow-lists.

## Built with

Next.js, React, TypeScript, Tailwind CSS, Vercel AI SDK, Google Gemini, PayPal Orders v2 API (sandbox).

## License

MIT
# Per-Second Payments MVP Server

This is the Phase 1 MVP backend described in [`../PLATFORM_PLAN.md`](../PLATFORM_PLAN.md):
upload short (≤120s) videos, track watch time via client heartbeats, and pay
viewers per second watched into an in-app wallet balance.

It deliberately implements the plan's highest-risk pieces first — the ledger
and the anti-fraud/payout logic — since those are what determine whether the
core mechanic is economically and technically viable at all. Everything else
(real video transcoding/CDN, a real feed/ranking service, real cash payouts,
a fraud ML model) is out of scope for this MVP and called out below.

## Run it

```bash
cd server
npm install
npm test      # runs the domain + API test suite (node:test)
npm start     # starts the API on :3000
```

## What's implemented

- `src/domain/video.js` — enforces the 5–120s content length rule.
- `src/domain/fraud.js` — validates each playback heartbeat: app foregrounded,
  player visible, actively playing, playback speed within 0.75x–2x, and that
  the reported position advance is consistent with wall-clock time (catches
  fast-forward farming / tampered clients). Caps how many seconds a single
  heartbeat can ever credit.
- `src/domain/payout.js` — computes the $/sec rate for a chunk of watch time:
  base rate × repeat-watch decay (100% → 20% → 0% for the 1st/2nd/3rd+ watch
  of the *same video* by the *same user* on the *same day*) × trust
  multiplier (clamped 0.1x–1.5x), and enforces a per-user daily paid-seconds
  cap. Also estimates a creator's share of ad spend from the revenue split
  in the plan (55% viewers / 30% creators / 15% platform).
- `src/domain/ledger.js` — append-only, event-sourced earnings ledger.
  Balances and reports are always derived by aggregating events, never by
  mutating a stored balance — this is meant to be treated like a financial
  system, not a typical CRUD table.
- `src/store/memoryStore.js` — in-memory users/videos/sessions. Its methods
  map 1:1 to what a real repository would need to serve, so it's a stand-in
  for a DB, not a permanent design choice.
- `src/api/routes.js` + `src/server.js` — Express API:
  - `POST /videos` — register a video (validates the duration cap).
  - `POST /watch/session` — start a watch session for a user/video, assigns
    that session's position in today's repeat-watch decay curve.
  - `POST /watch/heartbeat` — submit one playback heartbeat; runs fraud
    validation, computes payout, appends a ledger event, returns the new
    wallet balance.
  - `GET /wallet/:userId` — current balance.
  - `GET /creators/:ownerId/dashboard` — per-video watch-seconds, amount
    paid to viewers, and estimated creator earnings.

## What's intentionally NOT here yet

Per the plan's phased rollout, these are explicitly deferred:

- Real video upload/transcoding/CDN delivery (Mux/MediaConvert).
- A real feed/ranking service — there's no discovery here, only direct
  video/session creation.
- Real cash payouts (Stripe Connect/PayPal) or gift-card redemption — the
  wallet balance is tracked but not withdrawable. Per the plan's MVP scope,
  cash-out should start with gift cards, not direct bank transfer, to limit
  money-transmitter regulatory exposure.
- KYC/AML and a real trust-score/fraud-scoring service — `trustScore` is
  currently just a stored field on the user (defaults to `1.0`), not
  computed from behavior.
- Persistence — everything lives in process memory and resets on restart.
  The store/ledger interfaces are written so a Postgres-backed
  implementation can be swapped in without changing route logic.
- Content moderation / copyright matching on upload.

## Design notes worth knowing before extending this

- **Self-watch is blocked**: a video's owner earns nothing watching their
  own content (`self_watch_not_eligible`), to stop the most obvious payout
  extraction loop.
- **Decay is assigned per session, not per heartbeat**: a session's position
  in the repeat-watch decay curve (`watchIndex`) is fixed when the session
  starts, so a single watch doesn't shift rates mid-playback.
- **Rejected heartbeats never touch the ledger**: fraud-check failures and
  self-watch return `accepted: false` and are not recorded as earnings, but
  the plan calls for also logging rejected heartbeats for anomaly-detection
  training data — that pipeline isn't built yet.

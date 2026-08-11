# Platform Plan: Short-Form Video with Per-Second Viewer Payouts

## 1. Concept

A short-form video platform (clips up to **120 seconds**) where creators upload
content and **viewers get paid for time actually watched**, billed/credited
**per second**. This flips the usual ad-supported model: instead of the
platform monetizing attention and paying creators, the platform pays
*viewers* directly for attention, and creators pay (or the platform funds via
sponsors/ads) to have their content watched.

Core loop: **Creator uploads → viewer watches → viewer earns $/sec →
creator/sponsor/platform funds the pool → platform takes a cut.**

## 2. Who Pays Whom (Money Model)

This is the first thing to nail down because it drives everything else.

| Money source | Mechanism |
|---|---|
| **Advertisers/Sponsors** | Pay to have their ad or branded video watched; funds the per-second viewer pool (like a CPM model, but paid out continuously instead of to the creator). |
| **Creators (boosted reach)** | Creators can pay to "boost" a video, meaning watch-seconds on that video are eligible for payout, driving views. |
| **Platform-funded pool** | Platform seeds a rewards pool (subscription revenue, VC funding, transaction fees) to bootstrap viewer earnings before ad demand is sufficient. |
| **Subscriptions** | Viewers or creators pay a subscription for perks (higher payout rate, ad-free earning boosts, analytics). |

Revenue split example (tunable):
- 55% to viewer payout pool
- 30% to creator (based on watch-seconds their content generated)
- 15% platform take rate

## 3. Content Rules

- Max duration: **120 seconds** (hard cap enforced at upload/transcode time).
- Minimum duration: e.g. 5 seconds (avoid spam/empty clips).
- Only original or rights-cleared content (DMCA + content-ID matching required).
- Vertical/short-form aspect ratios preferred (9:16, 1:1), similar to Reels/Shorts/TikTok.

## 4. Per-Second Payout Mechanics

This is the highest-risk, highest-fraud-surface part of the system. Design goals: **accurate**, **hard to game**, **cheap to compute at scale**.

### 4.1 What counts as a "paid second"
- Video must be **in the foreground**, **audible/visible** (viewport visibility ≥ 50%, tab focused), and **actively playing** (not paused, not buffering).
- Playback must be **near real-time speed** (0.75x–2x) — no fast-forward farming.
- Heartbeat events sent from client every 1s (or batched every 3–5s with timestamps) confirm continued engagement.
- Server validates heartbeats against expected video-position progression (reject impossible jumps).

### 4.2 Payout curve (anti-bot / anti-farming)
- Flat per-second rate is exploitable by bots. Use a **decaying/diminishing rate per viewer per video** and a **daily earning cap per user**, plus a **trust score** that scales rate up for verified, human-behaving accounts and down for suspicious ones.
- Example: base rate $0.0005–$0.002/sec (tunable by ad demand), multiplied by a trust multiplier (0.1x–1.5x).
- Same viewer re-watching the same video: payout decays sharply after the first watch (e.g., 100% → 20% → 0% over 3 watches/day) to prevent loop-farming.

### 4.3 Ledger & settlement
- Every accepted heartbeat writes an **append-only earning event** `(user_id, video_id, session_id, second_range, amount, rate_id)`.
- Aggregate into a **per-user running balance** (event-sourced, replayable).
- Daily/weekly **payout batch job** reconciles ledger vs. ad revenue actually collected (never pay out more than the pool has — pool-based clawback/throttle if ad demand < pledged rate).
- Withdrawals via payment processor (Stripe Connect / PayPal Payouts) with KYC above a threshold, minimum withdrawal amount, and hold period (e.g., 3–7 days) to allow fraud reversal.

## 5. Anti-Fraud / Abuse Prevention (critical — this is what makes or breaks the model)

- **Device & session fingerprinting** to detect multi-accounting and bot farms.
- **CAPTCHA / liveness checks** on suspicious sessions (sudden earnings spikes, headless-browser signatures).
- **Rate limiting**: cap earnable seconds per user per hour/day (e.g., max 2 hours of paid watch time/day).
- **ML anomaly detection** on watch patterns (perfectly uniform heartbeat intervals, no scroll/tap/pause variance, identical device clusters).
- **Video-side fraud**: creators can't pay to watch their own content in a loop to extract money — dedupe creator/uploader accounts from their own video's payout eligibility.
- **Shadow payouts**: new/unverified accounts earn into a pending balance released only after identity verification, to blunt bot-farm cash-out.

## 6. High-Level Architecture

```
[Client Apps: iOS/Android/Web]
   |  upload video, playback, heartbeat events
   v
[API Gateway / BFF]
   |
   +--> [Upload Service] --> [Transcode Pipeline] --> [Object Storage + CDN]
   |         (duration validation, format checks)
   |
   +--> [Feed/Recommendation Service] (ranks eligible-for-payout videos)
   |
   +--> [Playback/Heartbeat Ingest Service] --(Kafka/Kinesis)--> [Watch Event Stream]
   |                                                                  |
   |                                                                  v
   |                                                  [Fraud/Anomaly Scoring Service]
   |                                                                  |
   |                                                                  v
   +--> [Ledger Service] <---------------------------------- [Payout Calculation Worker]
             |
             v
   [Wallet/Balance DB] --> [Payout Batch Job] --> [Stripe Connect / PayPal Payouts]
   |
   +--> [Ad/Sponsor Marketplace Service] (funds the pool, tracks spend vs. delivered watch-seconds)
```

### Key services
1. **Upload & Transcode** — enforce ≤120s, generate renditions (HLS/DASH), thumbnail, run content moderation + copyright match.
2. **Feed/Ranking** — decide which videos surface to which viewers (balances creator reach, ad demand, viewer interest).
3. **Playback & Heartbeat Ingest** — lightweight, high-throughput endpoint (this is your highest-QPS system: every active viewer pings every 1–5s).
4. **Fraud/Anomaly Scoring** — real-time + batch scoring pipeline, feeding a trust score used by the payout calculator.
5. **Ledger Service** — event-sourced, immutable, auditable financial ledger (this needs to be treated like a fintech system, not a typical CRUD app).
6. **Wallet/Payout** — balance management, withdrawal, KYC integration, tax reporting (1099s in the US, etc.).
7. **Ad/Sponsor Marketplace** — self-serve ad buying, budget pacing so the pool never overcommits.

## 7. Suggested Tech Stack

- **Mobile/Web client**: React Native or Flutter (mobile-first, since short-form video); Next.js for web.
- **Video**: Mux or AWS MediaConvert/MediaLive for transcode + adaptive bitrate streaming; CDN via CloudFront/Fastly.
- **Backend services**: Go or Node.js (TypeScript) for ingest/API; Python for ML/fraud scoring.
- **Streaming/event bus**: Kafka or Kinesis for heartbeat/watch events.
- **Ledger DB**: Postgres with an event-sourcing pattern (or a purpose-built ledger DB like TigerBeetle for high-integrity double-entry accounting) — this is the piece worth over-investing in correctness.
- **Fraud/ML**: real-time feature store + a gradient-boosted classifier to start (XGBoost), evolving to sequence models on watch behavior.
- **Payments**: Stripe Connect (marketplace payouts + KYC) or PayPal Payouts API.
- **Infra**: Kubernetes on AWS/GCP, Terraform for IaC.

## 8. Legal & Compliance (do not skip — this is the part that kills platforms like this)

- **Money transmitter / regulatory risk**: paying users cash for watching content can trigger money-transmitter licensing requirements in many jurisdictions. Consult counsel before launch; consider starting with in-app credits/rewards redeemable for gift cards instead of direct cash, which has a different regulatory profile.
- **Tax reporting**: 1099-NEC/1099-K obligations (US) once users cross earning thresholds.
- **Sanctions/AML**: KYC + OFAC screening before cash withdrawal.
- **Bot/ToS enforcement**: clear terms prohibiting automated viewing, multi-accounting.
- **Content liability**: DMCA safe harbor process, CSAM detection (PhotoDNA/hash-matching), moderation pipeline (this is non-negotiable for any UGC video platform).
- **Ad standards**: transparency that some watch-time is sponsor-funded (disclosure requirements vary by region, e.g., FTC in the US).

## 9. MVP Scope (Phase 1)

Keep the first version narrow — prove the loop works and isn't trivially farmable before scaling spend.

1. Upload + transcode pipeline with 120s cap.
2. Simple vertical-scroll feed (no fancy ranking yet).
3. Heartbeat-based watch tracking → in-app credit balance (not real cash yet — reduces regulatory/fraud blast radius).
4. Manual/simple fraud rules (rate caps, device fingerprint, decay on repeat views) rather than full ML.
5. One funding source for the pool: platform-seeded budget, capped daily spend.
6. Redemption via gift cards (Tremendous/Tango Card API) instead of direct bank payout — de-risks money-transmitter licensing for MVP.
7. Basic creator dashboard: views, watch-seconds generated, earnings.

## 10. Phase 2+

- Self-serve ad/sponsor marketplace to scale the funding pool.
- Real cash payouts via Stripe Connect once volume + fraud model justify it.
- ML-based fraud scoring and personalized payout rates.
- Creator monetization tools (tipping, subscriptions) alongside viewer payouts.
- Expand ranking/recommendation system for retention.

## 11. Key Risks (ranked)

1. **Unit economics**: does ad/sponsor demand actually cover per-second viewer payouts + platform margin? Model this rigorously before building — it's a marketplace liquidity problem, not just an engineering problem.
2. **Fraud/bot farming**: per-second cash-for-attention is one of the most bot-attractive mechanics possible. Assume adversarial users from day one.
3. **Regulatory**: money transmission, tax, AML — can stall or kill launch in some markets.
4. **Content quality/spam**: incentivizing "watch time" without incentivizing quality can flood the platform with farmable low-effort content (loops, bait).
5. **CAC vs. viewer LTV**: viewers are being paid to be there, so retention/virality can't rely on payouts alone once the pool tightens — need genuine content quality.

## 12. Suggested Next Steps

1. Build a financial model: assumed ad CPMs, target payout rate/sec, projected watch-hours, and platform margin at various scales.
2. Get preliminary legal opinion on money-transmitter exposure for the target launch region.
3. Build the MVP with **credits, not cash**, and a small closed beta to validate that the fraud controls hold up before opening payouts more broadly.
4. Instrument everything from day one — the ledger and fraud pipeline are the product's foundation, not an afterthought.

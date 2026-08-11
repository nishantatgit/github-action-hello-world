'use strict';

// Base payout rate in USD per second of validated watch time, before decay
// and trust adjustments. This is the dial that gets tuned against actual
// ad/sponsor demand once the platform has real revenue data.
const BASE_RATE_PER_SECOND = 0.001;

// Repeat-watch decay: index 0 = 1st watch of a given video by a given user
// on a given day, index 1 = 2nd watch, etc. Anything beyond the array length
// earns nothing. This is what stops loop-farming a single video for cash.
const REPEAT_WATCH_DECAY = [1, 0.2, 0];

// Trust multiplier bounds. Trust score is produced by the fraud/anomaly
// scoring service (out of scope here) and clamped into this range so a bad
// score can throttle earnings but never zero out a legitimate new user, and
// a great score can't runaway multiply payouts.
const MIN_TRUST_MULTIPLIER = 0.1;
const MAX_TRUST_MULTIPLIER = 1.5;

// Max seconds of watch time a single user can earn on in a single day,
// across all videos. Bounds the platform's worst-case daily liability per
// user regardless of how many videos they watch.
const DAILY_CAP_SECONDS = 2 * 60 * 60; // 2 hours

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Computes the $/sec rate that should apply to the next chunk of watch time.
 *
 * @param {object} params
 * @param {number} params.trustScore - raw trust score, will be clamped into
 *   [MIN_TRUST_MULTIPLIER, MAX_TRUST_MULTIPLIER].
 * @param {number} params.watchCountToday - how many prior watch sessions this
 *   user has already had on this exact video today (0 = first watch).
 * @param {number} params.secondsEarnedTodayAcrossAllVideos - running total of
 *   paid seconds this user has already earned today, any video.
 * @returns {number} rate in USD/second, 0 if the user is capped out or the
 *   repeat-watch decay has bottomed out.
 */
function computeRatePerSecond({
  trustScore,
  watchCountToday,
  secondsEarnedTodayAcrossAllVideos,
}) {
  if (secondsEarnedTodayAcrossAllVideos >= DAILY_CAP_SECONDS) {
    return 0;
  }

  const decay = REPEAT_WATCH_DECAY[watchCountToday] ?? 0;
  if (decay === 0) {
    return 0;
  }

  const trustMultiplier = clamp(
    trustScore,
    MIN_TRUST_MULTIPLIER,
    MAX_TRUST_MULTIPLIER
  );

  return BASE_RATE_PER_SECOND * decay * trustMultiplier;
}

/**
 * Computes the payout for a chunk of `seconds` watch time, capping the
 * seconds actually paid so a single chunk can't push the user over the
 * daily cap.
 */
function computePayoutForChunk({
  seconds,
  trustScore,
  watchCountToday,
  secondsEarnedTodayAcrossAllVideos,
}) {
  const remainingCapSeconds = Math.max(
    DAILY_CAP_SECONDS - secondsEarnedTodayAcrossAllVideos,
    0
  );
  const payableSeconds = Math.min(seconds, remainingCapSeconds);
  const rate = computeRatePerSecond({
    trustScore,
    watchCountToday,
    secondsEarnedTodayAcrossAllVideos,
  });

  return {
    payableSeconds,
    ratePerSecond: rate,
    amount: Number((payableSeconds * rate).toFixed(6)),
  };
}

// Revenue split of each dollar the ad/sponsor pool spends, per PLATFORM_PLAN.md.
const VIEWER_POOL_SHARE = 0.55;
const CREATOR_SHARE = 0.3;
const PLATFORM_SHARE = 0.15;

/**
 * Given what viewers were actually paid for watching a creator's video,
 * estimates the creator's share of the same underlying ad spend. This is an
 * MVP approximation - a real implementation tracks ad spend directly rather
 * than backing it out from the viewer payout.
 */
function estimateCreatorEarnings(totalPaidToViewers) {
  return Number(
    ((totalPaidToViewers / VIEWER_POOL_SHARE) * CREATOR_SHARE).toFixed(6)
  );
}

module.exports = {
  BASE_RATE_PER_SECOND,
  REPEAT_WATCH_DECAY,
  MIN_TRUST_MULTIPLIER,
  MAX_TRUST_MULTIPLIER,
  DAILY_CAP_SECONDS,
  VIEWER_POOL_SHARE,
  CREATOR_SHARE,
  PLATFORM_SHARE,
  computeRatePerSecond,
  computePayoutForChunk,
  estimateCreatorEarnings,
};

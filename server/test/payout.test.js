'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BASE_RATE_PER_SECOND,
  DAILY_CAP_SECONDS,
  computeRatePerSecond,
  computePayoutForChunk,
  estimateCreatorEarnings,
} = require('../src/domain/payout');

test('first watch of the day pays full base rate at trust=1', () => {
  const rate = computeRatePerSecond({
    trustScore: 1,
    watchCountToday: 0,
    secondsEarnedTodayAcrossAllVideos: 0,
  });
  assert.equal(rate, BASE_RATE_PER_SECOND);
});

test('second watch of the same video the same day decays to 20%', () => {
  const rate = computeRatePerSecond({
    trustScore: 1,
    watchCountToday: 1,
    secondsEarnedTodayAcrossAllVideos: 0,
  });
  assert.equal(rate, BASE_RATE_PER_SECOND * 0.2);
});

test('third+ watch of the same video the same day pays nothing', () => {
  assert.equal(
    computeRatePerSecond({
      trustScore: 1,
      watchCountToday: 2,
      secondsEarnedTodayAcrossAllVideos: 0,
    }),
    0
  );
  assert.equal(
    computeRatePerSecond({
      trustScore: 1,
      watchCountToday: 99,
      secondsEarnedTodayAcrossAllVideos: 0,
    }),
    0
  );
});

test('trust multiplier is clamped into [0.1, 1.5]', () => {
  const lowTrust = computeRatePerSecond({
    trustScore: -5,
    watchCountToday: 0,
    secondsEarnedTodayAcrossAllVideos: 0,
  });
  assert.equal(lowTrust, BASE_RATE_PER_SECOND * 0.1);

  const highTrust = computeRatePerSecond({
    trustScore: 100,
    watchCountToday: 0,
    secondsEarnedTodayAcrossAllVideos: 0,
  });
  assert.equal(highTrust, BASE_RATE_PER_SECOND * 1.5);
});

test('rate drops to zero once the daily cap is reached', () => {
  const rate = computeRatePerSecond({
    trustScore: 1,
    watchCountToday: 0,
    secondsEarnedTodayAcrossAllVideos: DAILY_CAP_SECONDS,
  });
  assert.equal(rate, 0);
});

test('a chunk that would cross the daily cap is truncated, not rejected', () => {
  const payout = computePayoutForChunk({
    seconds: 10,
    trustScore: 1,
    watchCountToday: 0,
    secondsEarnedTodayAcrossAllVideos: DAILY_CAP_SECONDS - 4,
  });
  assert.equal(payout.payableSeconds, 4);
  assert.equal(payout.amount, Number((4 * BASE_RATE_PER_SECOND).toFixed(6)));
});

test('estimateCreatorEarnings backs out the creator share from viewer payout', () => {
  // viewer pool share is 55%, creator share is 30% of the same ad spend.
  const viewerPayout = 0.55;
  const creatorEarnings = estimateCreatorEarnings(viewerPayout);
  assert.equal(creatorEarnings, 0.3);
});

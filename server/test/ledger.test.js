'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Ledger } = require('../src/domain/ledger');

test('balance sums all events for a user', () => {
  const ledger = new Ledger();
  ledger.appendEvent({ userId: 'u1', videoId: 'v1', sessionId: 's1', seconds: 2, amount: 0.002, ratePerSecond: 0.001 });
  ledger.appendEvent({ userId: 'u1', videoId: 'v2', sessionId: 's2', seconds: 3, amount: 0.003, ratePerSecond: 0.001 });
  ledger.appendEvent({ userId: 'u2', videoId: 'v1', sessionId: 's3', seconds: 5, amount: 0.005, ratePerSecond: 0.001 });

  assert.equal(ledger.getBalance('u1'), 0.005);
  assert.equal(ledger.getBalance('u2'), 0.005);
  assert.equal(ledger.getBalance('unknown'), 0);
});

test('getSecondsEarnedOnDay only counts events from that day for that user', () => {
  const ledger = new Ledger();
  const today = Date.now();
  const yesterday = today - 24 * 60 * 60 * 1000;
  ledger.appendEvent({ userId: 'u1', videoId: 'v1', sessionId: 's1', seconds: 10, amount: 0.01, ratePerSecond: 0.001, timestamp: today });
  ledger.appendEvent({ userId: 'u1', videoId: 'v1', sessionId: 's2', seconds: 20, amount: 0.02, ratePerSecond: 0.001, timestamp: yesterday });

  const todayKey = Ledger.dateKeyFor(today);
  assert.equal(ledger.getSecondsEarnedOnDay('u1', todayKey), 10);
});

test('getWatchCountOnDay counts distinct sessions, not events', () => {
  const ledger = new Ledger();
  const now = Date.now();
  const dateKey = Ledger.dateKeyFor(now);
  // Same session, multiple heartbeats -> still 1 watch.
  ledger.appendEvent({ userId: 'u1', videoId: 'v1', sessionId: 's1', seconds: 1, amount: 0.001, ratePerSecond: 0.001, timestamp: now });
  ledger.appendEvent({ userId: 'u1', videoId: 'v1', sessionId: 's1', seconds: 1, amount: 0.001, ratePerSecond: 0.001, timestamp: now });
  // Different session -> 2nd watch.
  ledger.appendEvent({ userId: 'u1', videoId: 'v1', sessionId: 's2', seconds: 1, amount: 0.0002, ratePerSecond: 0.0002, timestamp: now });

  assert.equal(ledger.getWatchCountOnDay('u1', 'v1', dateKey), 2);
});

test('getVideoStats aggregates watch seconds, payout and unique viewers', () => {
  const ledger = new Ledger();
  ledger.appendEvent({ userId: 'u1', videoId: 'v1', sessionId: 's1', seconds: 5, amount: 0.005, ratePerSecond: 0.001 });
  ledger.appendEvent({ userId: 'u2', videoId: 'v1', sessionId: 's2', seconds: 3, amount: 0.003, ratePerSecond: 0.001 });
  ledger.appendEvent({ userId: 'u1', videoId: 'v2', sessionId: 's3', seconds: 100, amount: 0.1, ratePerSecond: 0.001 });

  const stats = ledger.getVideoStats('v1');
  assert.equal(stats.totalWatchSeconds, 8);
  assert.equal(stats.totalPaidToViewers, 0.008);
  assert.equal(stats.uniqueViewers, 2);
  assert.equal(stats.events, 2);
});

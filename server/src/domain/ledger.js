'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Append-only, event-sourced earnings ledger. Every credited watch-second
 * chunk becomes one immutable event; balances and reports are always
 * derived by replaying/aggregating events rather than mutated in place.
 * This is intentionally the least "clever" code in the service - it's a
 * financial record, so it favors auditability over performance. Swap the
 * in-memory array for an append-only table (or a real ledger DB like
 * TigerBeetle) without changing the public interface below.
 */
class Ledger {
  constructor() {
    this._events = [];
  }

  static dateKeyFor(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  }

  /**
   * Appends a single earning event. Amount/seconds must already be
   * validated and computed (see domain/payout.js) - the ledger does not
   * recompute payout logic, it only records it.
   */
  appendEvent({ userId, videoId, sessionId, seconds, amount, ratePerSecond, timestamp = Date.now() }) {
    const event = {
      id: randomUUID(),
      userId,
      videoId,
      sessionId,
      seconds,
      amount,
      ratePerSecond,
      timestamp,
      dateKey: Ledger.dateKeyFor(timestamp),
    };
    this._events.push(event);
    return event;
  }

  getBalance(userId) {
    return round(
      this._events
        .filter((e) => e.userId === userId)
        .reduce((sum, e) => sum + e.amount, 0)
    );
  }

  getSecondsEarnedOnDay(userId, dateKey) {
    return this._events
      .filter((e) => e.userId === userId && e.dateKey === dateKey)
      .reduce((sum, e) => sum + e.seconds, 0);
  }

  getWatchCountOnDay(userId, videoId, dateKey) {
    const sessionIds = new Set(
      this._events
        .filter(
          (e) =>
            e.userId === userId && e.videoId === videoId && e.dateKey === dateKey
        )
        .map((e) => e.sessionId)
    );
    return sessionIds.size;
  }

  getVideoStats(videoId) {
    const events = this._events.filter((e) => e.videoId === videoId);
    const viewers = new Set(events.map((e) => e.userId));
    return {
      videoId,
      totalWatchSeconds: events.reduce((sum, e) => sum + e.seconds, 0),
      totalPaidToViewers: round(events.reduce((sum, e) => sum + e.amount, 0)),
      uniqueViewers: viewers.size,
      events: events.length,
    };
  }

  // Exposed for tests/inspection only - never mutate the returned array.
  allEvents() {
    return this._events.slice();
  }
}

function round(amount) {
  return Number(amount.toFixed(6));
}

module.exports = { Ledger };

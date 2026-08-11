'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Process-local in-memory store for the MVP. Every method here maps to a
 * query a real repository (Postgres/etc) would need to serve, so swapping
 * this out later means implementing the same interface against a DB rather
 * than rewriting call sites.
 */
class MemoryStore {
  constructor() {
    this.users = new Map(); // userId -> { id, trustScore }
    this.videos = new Map(); // videoId -> { id, title, ownerId, durationSeconds, createdAt }
    this.sessions = new Map(); // sessionId -> { id, userId, videoId, startedAt, lastPosition }
  }

  upsertUser(userId, { trustScore = 1.0 } = {}) {
    const existing = this.users.get(userId);
    const user = existing ?? { id: userId, trustScore };
    if (existing) user.trustScore = trustScore ?? existing.trustScore;
    this.users.set(userId, user);
    return user;
  }

  getUser(userId) {
    return this.users.get(userId) ?? this.upsertUser(userId);
  }

  createVideo({ title, ownerId, durationSeconds }) {
    const id = randomUUID();
    const video = {
      id,
      title,
      ownerId,
      durationSeconds,
      createdAt: Date.now(),
    };
    this.videos.set(id, video);
    return video;
  }

  getVideo(videoId) {
    return this.videos.get(videoId) ?? null;
  }

  /**
   * Number of sessions this user already started for this video on the
   * given day, BEFORE the session being created now. Used to assign each
   * new session a watchIndex (0 = first watch today) for the payout decay
   * curve - computed once at session start so every heartbeat in the
   * session decays consistently, rather than shifting mid-session.
   */
  countSessionsForDay(userId, videoId, dateKey) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.videoId === videoId &&
        session.dateKey === dateKey
      ) {
        count += 1;
      }
    }
    return count;
  }

  createSession({ userId, videoId, dateKey }) {
    const id = randomUUID();
    const watchIndex = this.countSessionsForDay(userId, videoId, dateKey);
    const session = {
      id,
      userId,
      videoId,
      dateKey,
      watchIndex,
      startedAt: Date.now(),
      lastPosition: 0,
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  updateSessionPosition(sessionId, position) {
    const session = this.sessions.get(sessionId);
    if (session) session.lastPosition = position;
    return session;
  }
}

module.exports = { MemoryStore };

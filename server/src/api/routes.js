'use strict';

const express = require('express');
const { validateVideoInput, ValidationError } = require('../domain/video');
const { validateHeartbeat } = require('../domain/fraud');
const { computePayoutForChunk, estimateCreatorEarnings } = require('../domain/payout');
const { Ledger } = require('../domain/ledger');

/**
 * Builds the API router. Store and ledger are injected so tests (and a
 * future real server) can swap in fresh instances per test / real DB-backed
 * implementations without touching route logic.
 */
function createRouter({ store, ledger }) {
  const router = express.Router();

  router.post('/videos', (req, res) => {
    const { title, ownerId, durationSeconds } = req.body ?? {};
    try {
      validateVideoInput({ title, ownerId, durationSeconds });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    store.upsertUser(ownerId);
    const video = store.createVideo({ title, ownerId, durationSeconds });
    return res.status(201).json(video);
  });

  router.post('/watch/session', (req, res) => {
    const { userId, videoId } = req.body ?? {};
    if (!userId || !videoId) {
      return res.status(400).json({ error: 'userId and videoId are required' });
    }
    const video = store.getVideo(videoId);
    if (!video) {
      return res.status(404).json({ error: 'video not found' });
    }
    store.upsertUser(userId);
    const dateKey = Ledger.dateKeyFor(Date.now());
    const session = store.createSession({ userId, videoId, dateKey });
    return res.status(201).json({
      sessionId: session.id,
      watchIndex: session.watchIndex,
      selfWatch: video.ownerId === userId,
    });
  });

  router.post('/watch/heartbeat', (req, res) => {
    const {
      sessionId,
      currentPosition,
      deltaTimeSeconds,
      playbackRate,
      isForeground,
      isVisible,
      isPlaying,
    } = req.body ?? {};

    const session = store.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session not found' });
    }
    const video = store.getVideo(session.videoId);
    const user = store.getUser(session.userId);

    const fraudResult = validateHeartbeat({
      previousPosition: session.lastPosition,
      currentPosition,
      deltaTimeSeconds,
      playbackRate,
      isForeground,
      isVisible,
      isPlaying,
    });

    if (!fraudResult.valid) {
      return res.status(200).json({
        accepted: false,
        reason: fraudResult.reason,
        balance: ledger.getBalance(user.id),
      });
    }

    store.updateSessionPosition(sessionId, currentPosition);

    const selfWatch = video.ownerId === user.id;
    if (selfWatch) {
      return res.status(200).json({
        accepted: false,
        reason: 'self_watch_not_eligible',
        balance: ledger.getBalance(user.id),
      });
    }

    const dateKey = Ledger.dateKeyFor(Date.now());
    const secondsEarnedTodayAcrossAllVideos = ledger.getSecondsEarnedOnDay(
      user.id,
      dateKey
    );

    const payout = computePayoutForChunk({
      seconds: fraudResult.creditedSeconds,
      trustScore: user.trustScore,
      watchCountToday: session.watchIndex,
      secondsEarnedTodayAcrossAllVideos,
    });

    if (payout.payableSeconds > 0) {
      ledger.appendEvent({
        userId: user.id,
        videoId: video.id,
        sessionId: session.id,
        seconds: payout.payableSeconds,
        amount: payout.amount,
        ratePerSecond: payout.ratePerSecond,
      });
    }

    return res.status(200).json({
      accepted: true,
      creditedSeconds: payout.payableSeconds,
      amount: payout.amount,
      ratePerSecond: payout.ratePerSecond,
      balance: ledger.getBalance(user.id),
    });
  });

  router.get('/wallet/:userId', (req, res) => {
    const { userId } = req.params;
    return res.json({ userId, balance: ledger.getBalance(userId) });
  });

  router.get('/creators/:ownerId/dashboard', (req, res) => {
    const { ownerId } = req.params;
    const videos = Array.from(store.videos.values()).filter(
      (v) => v.ownerId === ownerId
    );
    const videoStats = videos.map((video) => {
      const stats = ledger.getVideoStats(video.id);
      return {
        ...stats,
        title: video.title,
        durationSeconds: video.durationSeconds,
        estimatedCreatorEarnings: estimateCreatorEarnings(
          stats.totalPaidToViewers
        ),
      };
    });
    const totalEstimatedCreatorEarnings = round(
      videoStats.reduce((sum, v) => sum + v.estimatedCreatorEarnings, 0)
    );
    return res.json({ ownerId, videos: videoStats, totalEstimatedCreatorEarnings });
  });

  return router;
}

function round(amount) {
  return Number(amount.toFixed(6));
}

module.exports = { createRouter };

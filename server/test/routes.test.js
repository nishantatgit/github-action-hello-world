'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/server');

function freshApp() {
  return createApp();
}

test('POST /videos rejects a video over the 120s cap', async () => {
  const app = freshApp();
  const res = await request(app)
    .post('/videos')
    .send({ title: 'Too long', ownerId: 'creator1', durationSeconds: 130 });
  assert.equal(res.status, 400);
});

test('full happy path: upload, watch session, heartbeat credits wallet', async () => {
  const app = freshApp();

  const videoRes = await request(app)
    .post('/videos')
    .send({ title: 'Clip', ownerId: 'creator1', durationSeconds: 60 });
  assert.equal(videoRes.status, 201);
  const videoId = videoRes.body.id;

  const sessionRes = await request(app)
    .post('/watch/session')
    .send({ userId: 'viewer1', videoId });
  assert.equal(sessionRes.status, 201);
  const { sessionId } = sessionRes.body;

  const heartbeatRes = await request(app)
    .post('/watch/heartbeat')
    .send({
      sessionId,
      currentPosition: 2,
      deltaTimeSeconds: 2,
      playbackRate: 1,
      isForeground: true,
      isVisible: true,
      isPlaying: true,
    });

  assert.equal(heartbeatRes.status, 200);
  assert.equal(heartbeatRes.body.accepted, true);
  assert.ok(heartbeatRes.body.amount > 0);

  const walletRes = await request(app).get('/wallet/viewer1');
  assert.equal(walletRes.body.balance, heartbeatRes.body.balance);
  assert.ok(walletRes.body.balance > 0);
});

test('creator cannot earn watching their own video', async () => {
  const app = freshApp();
  const videoRes = await request(app)
    .post('/videos')
    .send({ title: 'Clip', ownerId: 'creator1', durationSeconds: 60 });
  const videoId = videoRes.body.id;

  const sessionRes = await request(app)
    .post('/watch/session')
    .send({ userId: 'creator1', videoId });

  const heartbeatRes = await request(app)
    .post('/watch/heartbeat')
    .send({
      sessionId: sessionRes.body.sessionId,
      currentPosition: 2,
      deltaTimeSeconds: 2,
      playbackRate: 1,
      isForeground: true,
      isVisible: true,
      isPlaying: true,
    });

  assert.equal(heartbeatRes.body.accepted, false);
  assert.equal(heartbeatRes.body.reason, 'self_watch_not_eligible');
});

test('a suspicious fast-forwarded heartbeat is rejected and earns nothing', async () => {
  const app = freshApp();
  const videoRes = await request(app)
    .post('/videos')
    .send({ title: 'Clip', ownerId: 'creator1', durationSeconds: 60 });
  const sessionRes = await request(app)
    .post('/watch/session')
    .send({ userId: 'viewer1', videoId: videoRes.body.id });

  const heartbeatRes = await request(app)
    .post('/watch/heartbeat')
    .send({
      sessionId: sessionRes.body.sessionId,
      currentPosition: 50, // way more than 2 real seconds at <=2x allows
      deltaTimeSeconds: 2,
      playbackRate: 1,
      isForeground: true,
      isVisible: true,
      isPlaying: true,
    });

  assert.equal(heartbeatRes.body.accepted, false);
  assert.equal(heartbeatRes.body.reason, 'position_drift_too_large');

  const walletRes = await request(app).get('/wallet/viewer1');
  assert.equal(walletRes.body.balance, 0);
});

test('creator dashboard reports watch seconds and estimated earnings', async () => {
  const app = freshApp();
  const videoRes = await request(app)
    .post('/videos')
    .send({ title: 'Clip', ownerId: 'creator1', durationSeconds: 60 });
  const videoId = videoRes.body.id;
  const sessionRes = await request(app)
    .post('/watch/session')
    .send({ userId: 'viewer1', videoId });

  await request(app)
    .post('/watch/heartbeat')
    .send({
      sessionId: sessionRes.body.sessionId,
      currentPosition: 2,
      deltaTimeSeconds: 2,
      playbackRate: 1,
      isForeground: true,
      isVisible: true,
      isPlaying: true,
    });

  const dashboardRes = await request(app).get('/creators/creator1/dashboard');
  assert.equal(dashboardRes.status, 200);
  assert.equal(dashboardRes.body.videos.length, 1);
  assert.equal(dashboardRes.body.videos[0].totalWatchSeconds, 2);
  assert.ok(dashboardRes.body.totalEstimatedCreatorEarnings > 0);
});

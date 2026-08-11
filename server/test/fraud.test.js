'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateHeartbeat } = require('../src/domain/fraud');

const baseValid = {
  previousPosition: 10,
  currentPosition: 12,
  deltaTimeSeconds: 2,
  playbackRate: 1,
  isForeground: true,
  isVisible: true,
  isPlaying: true,
};

test('accepts a normal 1x heartbeat', () => {
  const result = validateHeartbeat(baseValid);
  assert.equal(result.valid, true);
  assert.equal(result.creditedSeconds, 2);
});

test('rejects when not foreground', () => {
  const result = validateHeartbeat({ ...baseValid, isForeground: false });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'app_not_foreground');
});

test('rejects when not visible', () => {
  const result = validateHeartbeat({ ...baseValid, isVisible: false });
  assert.equal(result.reason, 'player_not_visible');
});

test('rejects when paused', () => {
  const result = validateHeartbeat({ ...baseValid, isPlaying: false });
  assert.equal(result.reason, 'not_playing');
});

test('rejects playback rates outside 0.75x-2x', () => {
  assert.equal(
    validateHeartbeat({ ...baseValid, playbackRate: 3 }).reason,
    'playback_rate_out_of_range'
  );
  assert.equal(
    validateHeartbeat({ ...baseValid, playbackRate: 0.5 }).reason,
    'playback_rate_out_of_range'
  );
});

test('rejects a fast-forward jump that outpaces wall-clock time', () => {
  // 2 real seconds elapsed but position jumped 20s - impossible at <=2x.
  const result = validateHeartbeat({
    ...baseValid,
    previousPosition: 0,
    currentPosition: 20,
    deltaTimeSeconds: 2,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'position_drift_too_large');
});

test('rejects position moving backwards', () => {
  const result = validateHeartbeat({
    ...baseValid,
    previousPosition: 10,
    currentPosition: 5,
  });
  assert.equal(result.reason, 'position_went_backwards');
});

test('caps credited seconds per heartbeat even if a huge delta is reported', () => {
  const result = validateHeartbeat({
    ...baseValid,
    previousPosition: 0,
    currentPosition: 100,
    deltaTimeSeconds: 100,
  });
  assert.equal(result.valid, true);
  assert.equal(result.creditedSeconds, 5); // MAX_SECONDS_PER_HEARTBEAT
});

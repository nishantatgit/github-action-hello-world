'use strict';

const MIN_PLAYBACK_RATE = 0.75;
const MAX_PLAYBACK_RATE = 2.0;
// How much slack (seconds) we allow between the reported position delta and
// the wall-clock delta * playbackRate before flagging the heartbeat as an
// impossible jump (fast-forward farming, tampered client, etc).
const POSITION_DRIFT_TOLERANCE_SECONDS = 1.5;
// A single heartbeat can never credit more than this many seconds, no matter
// what the client reports - caps the damage of any one forged event.
const MAX_SECONDS_PER_HEARTBEAT = 5;

function validateHeartbeat({
  previousPosition,
  currentPosition,
  deltaTimeSeconds,
  playbackRate = 1,
  isForeground,
  isVisible,
  isPlaying,
}) {
  if (!isForeground) {
    return { valid: false, reason: 'app_not_foreground' };
  }
  if (!isVisible) {
    return { valid: false, reason: 'player_not_visible' };
  }
  if (!isPlaying) {
    return { valid: false, reason: 'not_playing' };
  }
  if (
    typeof playbackRate !== 'number' ||
    playbackRate < MIN_PLAYBACK_RATE ||
    playbackRate > MAX_PLAYBACK_RATE
  ) {
    return { valid: false, reason: 'playback_rate_out_of_range' };
  }
  if (
    typeof previousPosition !== 'number' ||
    typeof currentPosition !== 'number' ||
    typeof deltaTimeSeconds !== 'number' ||
    deltaTimeSeconds <= 0
  ) {
    return { valid: false, reason: 'malformed_payload' };
  }

  const reportedAdvance = currentPosition - previousPosition;
  if (reportedAdvance < 0) {
    return { valid: false, reason: 'position_went_backwards' };
  }

  const expectedAdvance = deltaTimeSeconds * playbackRate;
  const drift = Math.abs(reportedAdvance - expectedAdvance);
  if (drift > POSITION_DRIFT_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'position_drift_too_large' };
  }

  const creditedSeconds = Math.min(
    Math.max(reportedAdvance, 0),
    MAX_SECONDS_PER_HEARTBEAT
  );

  return { valid: true, creditedSeconds };
}

module.exports = {
  MIN_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  POSITION_DRIFT_TOLERANCE_SECONDS,
  MAX_SECONDS_PER_HEARTBEAT,
  validateHeartbeat,
};

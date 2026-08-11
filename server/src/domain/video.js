'use strict';

const MAX_DURATION_SECONDS = 120;
const MIN_DURATION_SECONDS = 5;

class ValidationError extends Error {}

function validateVideoInput({ title, ownerId, durationSeconds }) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new ValidationError('title is required');
  }
  if (!ownerId || typeof ownerId !== 'string') {
    throw new ValidationError('ownerId is required');
  }
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) {
    throw new ValidationError('durationSeconds must be a finite number');
  }
  if (durationSeconds < MIN_DURATION_SECONDS) {
    throw new ValidationError(
      `durationSeconds must be >= ${MIN_DURATION_SECONDS}`
    );
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    throw new ValidationError(
      `durationSeconds must be <= ${MAX_DURATION_SECONDS}`
    );
  }
}

module.exports = {
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  ValidationError,
  validateVideoInput,
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVideoInput, ValidationError } = require('../src/domain/video');

test('accepts a valid video', () => {
  assert.doesNotThrow(() =>
    validateVideoInput({ title: 'Clip', ownerId: 'u1', durationSeconds: 60 })
  );
});

test('rejects videos over the 120s cap', () => {
  assert.throws(
    () => validateVideoInput({ title: 'Too long', ownerId: 'u1', durationSeconds: 121 }),
    ValidationError
  );
});

test('rejects videos under the minimum duration', () => {
  assert.throws(
    () => validateVideoInput({ title: 'Too short', ownerId: 'u1', durationSeconds: 1 }),
    ValidationError
  );
});

test('accepts the exact boundary durations', () => {
  assert.doesNotThrow(() =>
    validateVideoInput({ title: 'Min', ownerId: 'u1', durationSeconds: 5 })
  );
  assert.doesNotThrow(() =>
    validateVideoInput({ title: 'Max', ownerId: 'u1', durationSeconds: 120 })
  );
});

test('rejects missing title/ownerId', () => {
  assert.throws(
    () => validateVideoInput({ title: '', ownerId: 'u1', durationSeconds: 30 }),
    ValidationError
  );
  assert.throws(
    () => validateVideoInput({ title: 'X', ownerId: '', durationSeconds: 30 }),
    ValidationError
  );
});

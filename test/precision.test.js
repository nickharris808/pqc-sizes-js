/**
 * Precision tests: this package must never disagree with the Python one.
 *
 * Oracle: NO INPUT MAY PRODUCE A CONFIDENT-LOOKING ANSWER THAT IS WRONG.
 *
 * JavaScript numbers are IEEE doubles, so integers above 2^53-1 are not exact.
 * Python integers are arbitrary precision. A differential run over 3,042 inputs
 * found 18 divergences, every one at or above 2^53. The worst was safety-relevant:
 *
 *     largestLegitimateObject = 2^53 + 1, memoryBudget = 2^54
 *     python maxConcurrentContexts -> 1
 *     js     maxConcurrentContexts -> 2      <-- claims MORE concurrency is safe
 *
 * A sizing tool that overstates safe concurrency is worse than no tool. So the
 * library now refuses unrepresentable inputs instead of returning a number it
 * cannot stand behind. After the guard: 3,010 agree, 32 refused, 0 wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fragmentsFor, maxConcurrentContexts, reassemblyWindow,
} from '../src/index.js';

const UNSAFE = Number.MAX_SAFE_INTEGER + 2; // 2^53 + 1, not exactly representable

test('refuses an object size JavaScript cannot represent exactly', () => {
  assert.throws(
    () => reassemblyWindow(UNSAFE, 2 ** 54, 3),
    /MAX_SAFE_INTEGER/,
  );
});

test('refuses an unrepresentable memory budget', () => {
  assert.throws(() => reassemblyWindow(12000, UNSAFE, 3), /MAX_SAFE_INTEGER/);
});

test('refuses in maxConcurrentContexts — the divergence that mattered', () => {
  // Unguarded this returned 2; exact arithmetic gives 1.
  assert.throws(() => maxConcurrentContexts(UNSAFE, 2 ** 54), /MAX_SAFE_INTEGER/);
});

test('refuses in fragmentsFor', () => {
  assert.throws(() => fragmentsFor(UNSAFE, 384), /MAX_SAFE_INTEGER/);
});

test('the refusal explains where to get an exact answer', () => {
  assert.throws(() => reassemblyWindow(UNSAFE, 2 ** 54, 3), /pqc-sizes/);
  assert.throws(() => reassemblyWindow(UNSAFE, 2 ** 54, 3), /refuses/);
});

test('everything at or below MAX_SAFE_INTEGER still works', () => {
  const w = reassemblyWindow(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1);
  assert.equal(w.floor, Number.MAX_SAFE_INTEGER);
  assert.equal(w.isEmpty, false);
});

test('realistic inputs are unaffected by the guard', () => {
  const w = reassemblyWindow(12000, 32768, 3);
  assert.equal(w.isEmpty, true);
  assert.equal(w.ceiling, 10922);
  assert.equal(maxConcurrentContexts(12000, 32768), 2);
  assert.equal(fragmentsFor(7533, 384), 20);
});

/**
 * Boundary fixtures computed by the Python package (arbitrary precision).
 * Each entry: [object, budget, concurrency, expectedCeiling, expectedMaxConc].
 * These sit just below the safe-integer limit, where both implementations must
 * agree exactly.
 */
const PY_FIXTURES = [
  [4503599627370495, 9007199254740991, 2, 4503599627370495, 2],
  [12000, 9007199254740991, 7, 1286742750677284, 750599937895],
  [1125899906842623, 4503599627370496, 3, 1501199875790165, 4],
];

test('PARITY: agrees with Python on exact boundary values', () => {
  for (const [obj, bud, con, ceil, maxc] of PY_FIXTURES) {
    const w = reassemblyWindow(obj, bud, con);
    assert.equal(w.ceiling, ceil, `ceiling for ${obj}/${bud}/${con}`);
    assert.equal(maxConcurrentContexts(obj, bud), maxc, `maxConc for ${obj}/${bud}`);
  }
});

test('a refusal is never mistaken for a result', () => {
  // The failure mode being prevented: catching the throw and treating the
  // absence of a value as "no problem found".
  let result = 'unset';
  try {
    result = reassemblyWindow(UNSAFE, 2 ** 54, 3).isEmpty;
  } catch {
    result = 'refused';
  }
  assert.equal(result, 'refused');
  assert.notEqual(result, false);
});

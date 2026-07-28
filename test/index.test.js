/**
 * Tests for pqc-sizes (JS). Uses node:test — no test-framework dependency.
 *
 * The parity block at the end is the important one: this package must agree
 * with the Python implementation exactly, or the two tell users different
 * things about the same protocol.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALGORITHMS, TRANSPORTS, credential, credentialBytes,
  fragmentsFor, maxConcurrentContexts, reassemblyWindow,
} from '../src/index.js';

// ------------------------------------------------------------- sizes

test('known standard sizes', () => {
  assert.equal(ALGORITHMS['ML-KEM-768'].publicKey, 1184);
  assert.equal(ALGORITHMS['ML-KEM-768'].ciphertextOrSig, 1088);
  assert.equal(ALGORITHMS['ML-DSA-65'].publicKey, 1952);
  assert.equal(ALGORITHMS['ML-DSA-65'].ciphertextOrSig, 3309);
  assert.equal(ALGORITHMS['SLH-DSA-SHA2-128f'].ciphertextOrSig, 17088);
});

test('category-3 credential totals 7533', () => {
  assert.equal(credentialBytes('ML-KEM-768', 'ML-DSA-65'), 7533);
});

test('breakdown sums to total', () => {
  const c = credential('ML-KEM-768', 'ML-DSA-65');
  const sum = Object.values(c.breakdown).reduce((a, b) => a + b, 0);
  assert.equal(sum, c.totalBytes);
});

test('unknown algorithm throws with the valid list', () => {
  assert.throws(() => credentialBytes('NOPE', 'ML-DSA-65'), /unknown algorithm/);
});

test('classical fits one frame, post-quantum does not', () => {
  assert.equal(fragmentsFor(ALGORITHMS.X25519.publicKey, TRANSPORTS['wifi-mgmt-frag']), 1);
  assert.ok(fragmentsFor(credentialBytes('ML-KEM-768', 'ML-DSA-65'),
    TRANSPORTS['wifi-mgmt-frag']) > 1);
});

// --------------------------------------------------------- fragments

test('fragments round up', () => {
  assert.equal(fragmentsFor(7533, 384), 20);
  assert.equal(fragmentsFor(768, 384), 2);
  assert.equal(fragmentsFor(385, 384), 2);
  assert.equal(fragmentsFor(1, 384), 1);
});

test('zero object is zero fragments', () => {
  assert.equal(fragmentsFor(0, 384), 0);
});

test('fragments reject bad input', () => {
  assert.throws(() => fragmentsFor(100, 0), /positive/);
  assert.throws(() => fragmentsFor(100, -1), /positive/);
  assert.throws(() => fragmentsFor(-1, 384), /non-negative/);
  assert.throws(() => fragmentsFor(1.5, 384), /integer/);
});

test('ethernet credential is 6 fragments', () => {
  assert.equal(fragmentsFor(7533, TRANSPORTS.ethernet), 6);
});

// ------------------------------------------------------------ window

test('non-empty window recommends the ceiling', () => {
  const w = reassemblyWindow(12000, 65536, 4);
  assert.equal(w.ceiling, 16384);
  assert.equal(w.isEmpty, false);
  assert.equal(w.recommended, 16384);
  assert.ok(w.admits(16384));
  assert.ok(w.admits(12000));
});

test('window excludes values outside the interval', () => {
  const w = reassemblyWindow(12000, 65536, 4);
  assert.equal(w.admits(11999), false);
  assert.equal(w.admits(16385), false);
});

test('window empties at 3 concurrent contexts on a 32 KiB budget', () => {
  assert.equal(reassemblyWindow(12000, 32768, 1).isEmpty, false);
  assert.equal(reassemblyWindow(12000, 32768, 2).isEmpty, false);
  assert.equal(reassemblyWindow(12000, 32768, 3).isEmpty, true);
  assert.equal(reassemblyWindow(12000, 32768, 4).isEmpty, true);
});

test('empty window explains and names a safe concurrency', () => {
  const w = reassemblyWindow(12000, 32768, 3);
  const text = w.explain();
  assert.match(text, /EMPTY WINDOW/);
  assert.match(text, /10,922/);
  assert.match(text, /at most 2/);
  assert.equal(w.recommended, null);
  // and that number must actually be safe
  assert.equal(reassemblyWindow(12000, 32768, 2).isEmpty, false);
});

test('degenerate case: object alone exceeds the budget', () => {
  const w = reassemblyWindow(20000, 8192, 1);
  assert.ok(w.isEmpty);
  assert.match(w.explain(), /cannot help/);
});

test('window rejects non-positive input', () => {
  assert.throws(() => reassemblyWindow(0, 65536, 4), /positive/);
  assert.throws(() => reassemblyWindow(12000, 0, 4), /positive/);
  assert.throws(() => reassemblyWindow(12000, 65536, 0), /positive/);
});

test('max concurrency is derived and agrees with emptiness', () => {
  assert.equal(maxConcurrentContexts(12000, 32768), 2);
  assert.equal(maxConcurrentContexts(12000, 65536), 5);
  const limit = maxConcurrentContexts(12000, 32768);
  assert.equal(reassemblyWindow(12000, 32768, limit).isEmpty, false);
  assert.equal(reassemblyWindow(12000, 32768, limit + 1).isEmpty, true);
});

// ------------------------------------------- parity with the Python package

test('PARITY: algorithm table matches the Python package byte for byte', () => {
  // These are the values asserted in the Python test suite. If either drifts,
  // the two packages would tell users different things about the same protocol.
  const expected = {
    'ML-KEM-512': [800, 768], 'ML-KEM-768': [1184, 1088], 'ML-KEM-1024': [1568, 1568],
    'ML-DSA-44': [1312, 2420], 'ML-DSA-65': [1952, 3309], 'ML-DSA-87': [2592, 4627],
    'Falcon-512': [897, 752], 'Falcon-1024': [1793, 1462],
    'SLH-DSA-SHA2-128s': [32, 7856], 'SLH-DSA-SHA2-128f': [32, 17088],
    'Classic-McEliece-348864': [261120, 96],
    X25519: [32, 32], 'ECDSA-P256': [65, 72],
  };
  assert.deepEqual(Object.keys(ALGORITHMS).sort(), Object.keys(expected).sort());
  for (const [name, [pk, ct]] of Object.entries(expected)) {
    assert.equal(ALGORITHMS[name].publicKey, pk, `${name} publicKey`);
    assert.equal(ALGORITHMS[name].ciphertextOrSig, ct, `${name} ciphertextOrSig`);
  }
});

test('PARITY: transport table matches the Python package', () => {
  assert.deepEqual(TRANSPORTS, {
    'wifi-mgmt-frag': 384, 'wifi-mtu': 2304, ethernet: 1500, 'ethernet-jumbo': 9000,
    'ble-att': 251, 'matter-btp': 244, lorawan: 51, 'usb-hid': 64, 'coap-dtls': 1152,
  });
});

test('PARITY: the documented worked examples produce identical results', () => {
  assert.equal(credentialBytes('ML-KEM-768', 'ML-DSA-65'), 7533);
  assert.equal(fragmentsFor(7533, 384), 20);
  assert.equal(fragmentsFor(7533, 1500), 6);
  assert.equal(reassemblyWindow(12000, 65536, 4).ceiling, 16384);
  assert.equal(maxConcurrentContexts(12000, 32768), 2);
});

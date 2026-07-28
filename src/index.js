/**
 * pqc-sizes — post-quantum object sizes, fragmentation, and the reassembly window.
 *
 * Zero dependencies. Pure arithmetic. Runs in Node and in the browser.
 *
 * The interesting function is reassemblyWindow(). A receiver holding partial,
 * not-yet-authenticated reassembly state needs a capacity cap, and that cap has
 * TWO boundaries:
 *
 *     floor   = the largest legitimate object you must accept
 *     ceiling = global reassembly budget / worst-case concurrent contexts
 *
 * Below the floor you refuse honest peers; above the ceiling concurrent sessions
 * exhaust the budget. If floor > ceiling the interval is EMPTY and no cap works --
 * which is a design answer, not an error.
 *
 * The ceiling formulation is the non-obvious half: the intuitive bound is
 * per-object, and that is wrong, because exposure is retention x concurrency.
 */

/** @typedef {{name:string,kind:string,category:number|null,publicKey:number,ciphertextOrSig:number,sharedSecret?:number}} Algorithm */

/** Sizes in bytes, from standards-conformant implementations. */
export const ALGORITHMS = Object.freeze({
  'ML-KEM-512': { name: 'ML-KEM-512', kind: 'kem', category: 1, publicKey: 800, ciphertextOrSig: 768, sharedSecret: 32 },
  'ML-KEM-768': { name: 'ML-KEM-768', kind: 'kem', category: 3, publicKey: 1184, ciphertextOrSig: 1088, sharedSecret: 32 },
  'ML-KEM-1024': { name: 'ML-KEM-1024', kind: 'kem', category: 5, publicKey: 1568, ciphertextOrSig: 1568, sharedSecret: 32 },
  'ML-DSA-44': { name: 'ML-DSA-44', kind: 'sig', category: 2, publicKey: 1312, ciphertextOrSig: 2420 },
  'ML-DSA-65': { name: 'ML-DSA-65', kind: 'sig', category: 3, publicKey: 1952, ciphertextOrSig: 3309 },
  'ML-DSA-87': { name: 'ML-DSA-87', kind: 'sig', category: 5, publicKey: 2592, ciphertextOrSig: 4627 },
  'Falcon-512': { name: 'Falcon-512', kind: 'sig', category: 1, publicKey: 897, ciphertextOrSig: 752 },
  'Falcon-1024': { name: 'Falcon-1024', kind: 'sig', category: 5, publicKey: 1793, ciphertextOrSig: 1462 },
  'SLH-DSA-SHA2-128s': { name: 'SLH-DSA-SHA2-128s', kind: 'sig', category: 1, publicKey: 32, ciphertextOrSig: 7856 },
  'SLH-DSA-SHA2-128f': { name: 'SLH-DSA-SHA2-128f', kind: 'sig', category: 1, publicKey: 32, ciphertextOrSig: 17088 },
  'Classic-McEliece-348864': { name: 'Classic-McEliece-348864', kind: 'kem', category: 1, publicKey: 261120, ciphertextOrSig: 96, sharedSecret: 32 },
  X25519: { name: 'X25519', kind: 'classical-kex', category: null, publicKey: 32, ciphertextOrSig: 32, sharedSecret: 32 },
  'ECDSA-P256': { name: 'ECDSA-P256', kind: 'classical-sig', category: null, publicKey: 65, ciphertextOrSig: 72 },
});

/** Representative transports: name -> usable payload bytes per frame. */
export const TRANSPORTS = Object.freeze({
  'wifi-mgmt-frag': 384,
  'wifi-mtu': 2304,
  ethernet: 1500,
  'ethernet-jumbo': 9000,
  'ble-att': 251,
  'matter-btp': 244,
  lorawan: 51,
  'usb-hid': 64,
  'coap-dtls': 1152,
});

function requireAlgorithm(name) {
  const a = ALGORITHMS[name];
  if (!a) {
    throw new Error(
      `unknown algorithm '${name}'; known: ${Object.keys(ALGORITHMS).join(', ')}`,
    );
  }
  return a;
}

/**
 * Per-component breakdown of a KEM + signature credential.
 * @returns {{totalBytes:number, breakdown:Record<string,number>}}
 */
export function credential(kemName = 'ML-KEM-768', sigName = 'ML-DSA-65', opts = {}) {
  const { includeKemCiphertext = true, includeSigPublicKey = true } = opts;
  const kem = requireAlgorithm(kemName);
  const sig = requireAlgorithm(sigName);

  const breakdown = {};
  breakdown[`${kem.name} public key`] = kem.publicKey;
  if (includeKemCiphertext) breakdown[`${kem.name} ciphertext`] = kem.ciphertextOrSig;
  if (includeSigPublicKey) breakdown[`${sig.name} public key`] = sig.publicKey;
  breakdown[`${sig.name} signature`] = sig.ciphertextOrSig;

  const totalBytes = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { totalBytes, breakdown };
}

/** Total on-wire bytes for a KEM + signature credential. */
export function credentialBytes(kemName, sigName, opts) {
  return credential(kemName, sigName, opts).totalBytes;
}

/**
 * Number of fragments an object becomes on a transport.
 * Throws on a non-positive frame payload -- a transport carrying nothing is a
 * caller error, not something to return 0 for.
 */
export function fragmentsFor(objectBytes, framePayload) {
  if (!Number.isInteger(objectBytes) || objectBytes < 0) {
    throw new Error('objectBytes must be a non-negative integer');
  }
  if (!Number.isInteger(framePayload) || framePayload <= 0) {
    throw new Error('framePayload must be a positive integer');
  }
  if (objectBytes === 0) return 0;
  return Math.ceil(objectBytes / framePayload);
}

/**
 * The two-sided reassembly-capacity window.
 * @returns {{floor:number,ceiling:number,budget:number,concurrency:number,isEmpty:boolean,recommended:number|null,admits:(n:number)=>boolean,explain:()=>string}}
 */
export function reassemblyWindow(largestLegitimateObject, memoryBudget, concurrency) {
  for (const [label, v] of [
    ['largestLegitimateObject', largestLegitimateObject],
    ['memoryBudget', memoryBudget],
    ['concurrency', concurrency],
  ]) {
    if (!Number.isInteger(v) || v <= 0) {
      throw new Error(`${label} must be a positive integer`);
    }
  }

  const floor = largestLegitimateObject;
  const ceiling = Math.floor(memoryBudget / concurrency);
  const isEmpty = floor > ceiling;
  const fmt = (n) => n.toLocaleString('en-US');

  return {
    floor,
    ceiling,
    budget: memoryBudget,
    concurrency,
    isEmpty,
    recommended: isEmpty ? null : ceiling,
    admits: (cap) => !isEmpty && cap >= floor && cap <= ceiling,
    explain() {
      if (!isEmpty) {
        return `window [${fmt(floor)}, ${fmt(ceiling)}] B; recommended cap ${fmt(ceiling)} B `
          + `(budget ${fmt(memoryBudget)} B / ${concurrency} concurrent contexts)`;
      }
      const safeConc = Math.floor(memoryBudget / floor);
      const advice = safeConc >= 1
        ? `reduce concurrency to at most ${safeConc}`
        : `reducing concurrency cannot help -- a single object (${fmt(floor)} B) already exceeds the budget`;
      return `EMPTY WINDOW: floor ${fmt(floor)} B > ceiling ${fmt(ceiling)} B `
        + `(short by ${fmt(floor - ceiling)} B). No capacity cap is both feasible and safe. `
        + `Raise the budget to at least ${fmt(floor * concurrency)} B, ${advice}, `
        + 'or choose a smaller credential.';
    },
  };
}

/**
 * Highest concurrency for which a non-empty window still exists.
 * Derives a device's safe concurrency limit instead of discovering it in the field.
 */
export function maxConcurrentContexts(largestLegitimateObject, memoryBudget) {
  if (!Number.isInteger(largestLegitimateObject) || largestLegitimateObject <= 0
      || !Number.isInteger(memoryBudget) || memoryBudget <= 0) {
    throw new Error('inputs must be positive integers');
  }
  return Math.floor(memoryBudget / largestLegitimateObject);
}

export default {
  ALGORITHMS,
  TRANSPORTS,
  credential,
  credentialBytes,
  fragmentsFor,
  reassemblyWindow,
  maxConcurrentContexts,
};

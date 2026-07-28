# pqc-sizes (JavaScript)

[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-green.svg)](package.json)
[![tests](https://img.shields.io/badge/tests-19%20passing-brightgreen.svg)](test/)
[![deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

**Your post-quantum credential doesn't fit in one frame. Find out what that costs — in the browser or in Node.**

```js
import { reassemblyWindow } from 'pqc-sizes';

reassemblyWindow(12000, 32768, 3).explain();
// "EMPTY WINDOW: floor 12,000 B > ceiling 10,922 B (short by 1,078 B).
//  No capacity cap is both feasible and safe. Raise the budget to at least
//  36,000 B, reduce concurrency to at most 2, or choose a smaller credential."
```

Zero dependencies. Pure ESM. No crypto, no network, no telemetry.

---

## Why this exists

An X25519 share is 32 bytes and fits in one frame. A category-3 post-quantum credential
is **7,533 bytes** and becomes **20 fragments** on an 802.11 management path.

So a receiver now holds attacker-influenced partial state *before* it can authenticate
it, and it needs a reassembly cap. That cap has **two** boundaries:

```
floor   = the largest legitimate object you must accept
ceiling = global reassembly budget / worst-case concurrent contexts
```

If `floor > ceiling`, the interval is empty and **no cap works**. That's a design answer,
not an error — and it's arithmetic, so it can run anywhere, including a browser.

## Install

```bash
npm install pqc-sizes        # once published
```

## Quickstart

```js
import {
  credentialBytes, fragmentsFor, reassemblyWindow, maxConcurrentContexts,
} from 'pqc-sizes';

credentialBytes('ML-KEM-768', 'ML-DSA-65');   // 7533
fragmentsFor(7533, 384);                       // 20   (Wi-Fi mgmt fragment)
fragmentsFor(7533, 1500);                      // 6    (Ethernet)

const w = reassemblyWindow(12000, 65536, 4);
w.ceiling;        // 16384
w.isEmpty;        // false
w.admits(16385);  // false — one byte over budget

maxConcurrentContexts(12000, 32768);           // 2 — derived, not guessed
```

## Worked example — actual output

```
> credentialBytes('ML-KEM-768', 'ML-DSA-65')
7533

> fragmentsFor(7533, 384)
20

> reassemblyWindow(12000, 32768, 3).explain()
'EMPTY WINDOW: floor 12,000 B > ceiling 10,922 B (short by 1,078 B). No capacity cap
 is both feasible and safe. Raise the budget to at least 36,000 B, reduce concurrency
 to at most 2, or choose a smaller credential.'

> maxConcurrentContexts(12000, 32768)
2
```

**That last number is the point.** You didn't discover your concurrency limit by shipping
and watching devices fall over — you derived it in one call.

## Cross-language parity

This is a port of the Python [`pqc-sizes`](../pqc-sizes), and the two **must not drift** —
otherwise they'd tell users different things about the same protocol.

The test suite pins the entire algorithm and transport table plus every documented worked
example against the Python values. A parity harness runs both implementations over 31
shared values (13 algorithms, 9 transports, 5 fragment cases, 4 window cases) and diffs
the output:

```
IDENTICAL — 31 values agree across JS and Python
```

## API

| Export | Purpose |
|---|---|
| `ALGORITHMS` | 13 algorithms with public-key and ciphertext/signature sizes |
| `TRANSPORTS` | 9 transports with usable payload bytes per frame |
| `credential(kem, sig, opts?)` | `{ totalBytes, breakdown }` |
| `credentialBytes(kem, sig, opts?)` | total bytes only |
| `fragmentsFor(objectBytes, framePayload)` | fragment count, rounded up |
| `reassemblyWindow(largest, budget, concurrency)` | the two-sided window |
| `maxConcurrentContexts(largest, budget)` | highest safe concurrency |

`reassemblyWindow` returns `{ floor, ceiling, budget, concurrency, isEmpty, recommended, admits(cap), explain() }`.

Bad input throws rather than returning a plausible-looking wrong number — a transport
that carries zero bytes is a caller error, not a `0`.

## Browser

Pure ESM with no Node built-ins, so it loads directly:

```html
<script type="module">
  import { reassemblyWindow } from './node_modules/pqc-sizes/src/index.js';
  document.body.textContent = reassemblyWindow(12000, 32768, 3).explain();
</script>
```

## Tests

```bash
npm test        # 19 passing, node:test, no test framework needed
```

## Scope

Arithmetic over published object sizes. It does **not** inspect your implementation,
verify anything cryptographically, or make a security claim about your protocol. A
non-empty window means a cap *exists* — not that your code enforces it.

## Related

[`pqc-sizes` (Python)](../pqc-sizes) · [`pqc-mfb`](../pqc-mfb) ·
[`pqc-guard-action`](../pqc-guard-action) · [`pqc-migration-mcp`](../pqc-migration-mcp)

This package tells you what cap to pick. Enforcing it, and closing the other 38 failure
families, is what the closed core does. Relevant subject matter is covered by a filed
provisional patent application. For commercial use of the full envelope, open a
[GitHub Discussion](https://github.com/nickharris808) or an issue on this repository.

## License

Apache-2.0. See [LICENSE](LICENSE) and [CONTRIBUTING.md](CONTRIBUTING.md).

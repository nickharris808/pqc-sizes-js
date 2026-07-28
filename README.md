# pqc-sizes (JavaScript)

[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-green.svg)](package.json)
[![tests](https://img.shields.io/badge/tests-28%20passing-brightgreen.svg)](test/)
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

**📖 Full documentation, tutorial and conceptual guide: <https://nickharris808.github.io/pqc-toolkit/>**

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
npm install github:nickharris808/pqc-sizes-js
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

This is a port of the Python [`pqc-sizes`](https://github.com/nickharris808/pqc-sizes), and the two **must not drift** —
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
npm test        # 28 passing, node:test, no test framework needed
```

## Scope

Arithmetic over published object sizes. It does **not** inspect your implementation,
verify anything cryptographically, or make a security claim about your protocol. A
non-empty window means a cap *exists* — not that your code enforces it.

## Related

[`pqc-sizes` (Python)](https://github.com/nickharris808/pqc-sizes) · [`pqc-mfb`](https://github.com/nickharris808/pqc-mfb) ·
[`pqc-guard-action`](https://github.com/nickharris808/pqc-guard-action) · [`pqc-migration-mcp`](https://github.com/nickharris808/pqc-migration-mcp)

This package tells you what cap to pick. Enforcing it, and closing the other 38 failure
families, is what the closed core does. Relevant subject matter is covered by a filed
provisional patent application. For commercial use of the full envelope, open a
[GitHub Discussion](https://github.com/nickharris808) or an issue on this repository.

## Honest scope

**What this proves.** The same arithmetic as the Python package, and a test
asserts the two agree on the documented values.

**What it does NOT prove.** Everything in
[`pqc-sizes`' honest scope](https://github.com/nickharris808/pqc-sizes#honest-scope)
applies here too.

**One JavaScript-specific limit.** Numbers are IEEE doubles, so integers above
`2^53 - 1` are not exact. A differential run over 3,042 inputs found 18
divergences from Python, all at or above that bound — and the worst reported a
*higher* safe concurrency than exact arithmetic allows. Rather than return a
number it cannot stand behind, this library **throws** above
`Number.MAX_SAFE_INTEGER` and points you at the Python package. Realistic inputs
are nowhere near that bound.

---

## The PQC migration toolkit

Eleven free tools for teams moving authenticated key exchange to post-quantum. They **find and measure**; they do not repair.

| Tool | What it does | Where |
|---|---|---|
| [pqc-sizes](https://github.com/nickharris808/pqc-sizes) | Sizes, fragment counts, and the two-sided reassembly window | PyPI |
| **pqc-sizes-js** ← you are here | The same arithmetic for Node and the browser | npm |
| [pqc-guard-action](https://github.com/nickharris808/pqc-guard-action) | Fail the build when the window is empty | GitHub Action |
| [pqc-dos-embedded](https://github.com/nickharris808/pqc-dos-embedded) | 169 lines of C: the failure on a real 64 KB device | source |
| [farkas-check](https://github.com/nickharris808/farkas-check) | Re-verify the bound on-device, no SMT solver | source |
| [pqc-migration-mcp](https://github.com/nickharris808/pqc-migration-mcp) | Six MCP tools for AI agents | PyPI |
| [pqc-mfb](https://github.com/nickharris808/pqc-mfb) | 322 cases · 39 failure families · scorer | PyPI |
| [pqc-mfb (data)](https://huggingface.co/datasets/nickh007/pqc-mfb) | The benchmark as a dataset | HF |
| [pqc-formal-corpus](https://huggingface.co/datasets/nickh007/pqc-formal-corpus) | 122 named formal results, 6 provers | HF |
| [pqc-bounds-lean](https://github.com/nickharris808/pqc-bounds-lean) | The same bound in Lean 4 — 0 `sorry`, 0 imports | source |
| [pqc-dos-gate-rtl](https://github.com/nickharris808/pqc-dos-gate-rtl) | The gate in synthesizable RTL, 5 Yosys proofs | source |
| [pqc-explorer](https://huggingface.co/spaces/nickh007/pqc-explorer) | Try it in your browser, no install | HF Space |

**New here?** The [end-to-end tutorial](https://github.com/nickharris808/pqc-sizes/blob/main/TUTORIAL.md) walks one realistic migration through all of them in about ten minutes: sizes -> window -> CI gate -> benchmark.

**In a hurry?** [`pqc-sizes`](https://github.com/nickharris808/pqc-sizes) tells you in five seconds whether your credential fragments and whether a safe cap exists. [`pqc-explorer`](https://huggingface.co/spaces/nickh007/pqc-explorer) does the same in a browser, with no install.

### The closed core

Closing the 39 failure families — downgrade binding, retransmission-safe installation, fragmentation transcripts, roaming forward secrecy, multi-link key separation, admission control, group-key binding — is a separate proprietary codebase. Relevant subject matter is covered by a filed provisional patent application.

That split is measured, not asserted: under a replicate noise control only **4 of 32** repair mechanisms are externally distinguishable, so publishing these detectors does not disclose the repairs.

For commercial licensing, open a [GitHub Discussion](https://github.com/nickharris808/pqc-sizes/discussions) or an issue on any of these repos.

## License

Apache-2.0. See [LICENSE](LICENSE) and [CONTRIBUTING.md](CONTRIBUTING.md).

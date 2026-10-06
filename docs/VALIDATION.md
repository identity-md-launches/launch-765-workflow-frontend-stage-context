# Frontend validation

Worker validation on 2026-10-06. This is locally produced evidence, not an independent network certification.

## Scope and assumptions

One static page implements the approved NODEV terminal, wallet connection, token/pool reads, ETH/NODEV buy/sell, both required sell approvals, and all three ERC-20 writes. The implementation ABI is taken from source commit `80d57910ec635cc8cf8017c9a6e4f8bbe553fd58`. The exact supplied pool key wins over older pool metadata: fee 12500, tick spacing 60 and the initialization guard are preserved. Only the actual native-ETH pair is enabled.

Source/manifests/build configuration are under `web/`, exported runtime under `dist/`, and evidence/design under `docs/`. The explicit `web/.gitignore` allowance is used solely for recursive dependency/cache/test-output exclusions. No root configuration, Solidity, library or workflow files were changed. Root `DESIGN.md` is outside the hard path budget, so its content is supplied as `docs/DESIGN.md`.

## Executed checks

| Check | Result and evidence |
| --- | --- |
| `npm run build` | Pass: includes `tsc --noEmit` followed by Vite export and manifest generation. `evidence/build.txt`. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/nodev-browsers npm test` | **17 passed** on the final production export. `evidence/tests.txt`, `evidence/interaction-results.json`. |
| `npm run verify` | Pass: exact archived/pinned handoff and network equality; pinned ABI canonical Keccak; exact complete export inventory and SHA-256 hashes; schema has no extra top-level fields. `evidence/integrity.txt`. |
| Plain static hosting | Pass at `/ipfs/test-cid/` on a server that returns 404 for unknown paths, without rewrites. HTML, JS, CSS, config and ABI resolve relative to this prefix. |
| RPC reads | Both supplied endpoints returned chain ID 1, token metadata, exact one-billion supply, pool state and nonempty code for token, guard and all listed Uniswap contracts. `evidence/live-chain.json`. |
| Browser inspection | Chromium desktop 1440×1000, mobile 390×844; automated overflow at 1440/768/390/320. Final screenshots are listed below. No page exceptions in the interaction audit; final browser console/resource report is retained. |
| Accessibility | Axe WCAG 2 A/AA and 2.1 AA: no violations in the tested expanded-tools/disconnected state at 320×900. `evidence/accessibility-results.json`. Incomplete automated ARIA/color cases are not promoted to passes. |
| Contrast | Eight rendered text/background pairs measured. All sampled pairs exceed 4.5:1, minimum 6.44:1 for the red button. `evidence/rendered-contrast.json`. |

Vite emits a nonfatal warning for the main JavaScript chunk being over 500kB before compression (about 165kB gzip). The complete export is about 561kB plus its small manifest, comfortably within the asset-count, per-file, submission and publication response budgets. No dependencies, browser binaries, archives or package caches are included in the submitted files.

The interaction suite covers no wallet, disconnected and wrong-chain states; 4902 → add chain → switch; copy and keyboard activation; loop pause; Fire the Dev inline message; rejected connections/signatures; buy encoding, slippage minimum and ETH value; finite token/Permit2 approvals before sell; waiting through receipts; quote expiry, precision and balance validation; simulation reverts; account changes during async quotes; all three ERC-20 actions including revocation; unavailable RPC/code/liquidity; RPC fallback; tampered ABI; reduced motion; accessible labels; gateway subpath; and unconfirmed receipt recovery without a second send. An additional encoding assertion covers the network-flagged extended tuple.

## Live observations and limits

At block **26130154**, both public RPCs reported token code of 1784 bytes, supply `1000000000000000000000000000` base units, 18 decimals, pool fee 12500 and `sqrtPriceX96 = 792281625142643375935439503360000`. This corresponds to **0.00000001 ETH per NODEV**. Active pool liquidity was **0**, so the live site displays the price but disables swaps and explains why. No liquidity is fabricated. Later state can change.

No real wallet was asked to sign, and no real transfer, approval or swap was broadcast. Successful funded swaps, gas costs, actual wallet extension behavior, ENS resolution against a live name, transaction replacements/reorgs, and long-duration RPC reliability remain untested on-chain. Mocked receipt/swap checks establish local interaction and encoding behavior only. Code checks establish presence and record hashes, not independently verified deployed source equivalence. A reload clears local pending state; the README directs visitors to inspect the explorer/wallet before resubmitting.

There is no USD feed in the supplied brief, so token units and an unavailable-USD note are shown. No WalletConnect ID was supplied; injected wallets are supported. The publication domain is not yet known, so absolute social-preview image/site URLs are pending. IPFS publication, fixed CID, naming, public HTTP hash checks and subsequent control-plane verification were not performed in this frontend assignment.

## Better Interface consolidated review

The pinned workflow and core principles of all six domains were read and applied during implementation. Coverage below combines source review with rendered checks; absent features are not invented to fill the checklist.

| Domain | Coverage | Explicit limitations |
| --- | --- | --- |
| Accessibility — Checked | Native landmarks/headings/labels/details/buttons; skip link, 2px focus ring, keyboard activation, field error association/focus, native pending/disabled state, motion preference, accessible names, automated axe audit. | No screen-reader session, physical assistive device or exhaustive keyboard traversal of every financial branch. Forced-color support is in CSS but was not manually rendered. |
| Layout — Checked | Desktop/mobile composition, long checksum addresses, all four widths without horizontal document overflow, collapsed/expanded tools; CSS zoom 2 at 1440px and RTL mirror produced no overflow. | CSS zoom approximates enlargement; native browser-menu zoom, translated text and device safe-area behavior were not tested. |
| Writing — Checked | Workflow headline, permanent diagnostics, inline firing response and footer; simulated-log label; action verbs, explicit finite approval amounts, recoverable errors, USD/source/liquidity disclosure. | English only. |
| Typography — Checked | Actual CSS scale/weights, wrapping at tested widths, selectable addresses, tabular numerical stats, system monospace stack; form text is at least 16px. | System font substitutions on other operating systems, iOS input zoom and larger user font settings not tested. |
| Colors — Checked | Semantic roles, requested dark-only identity, readable secondary text, redundant text for statuses, eight measured rendered pairs, axe contrast check. | Full per-state contrast matrix and all automatic incomplete color cases were not exhaustively resolved; sampled measures are reported precisely. |
| UI — Checked | Hover/focus/selected/disabled/loading/empty/error/confirmed states in source and primary browser paths; 120ms motion, .96 press scale, reduced-motion pause, static glitch illustration. | No 10%-speed animation-panel review or native touch hardware test. Modals, charts, images and theme switching are not applicable. |

## Findings, fixes and rechecks

| Severity | Source location | Finding and implemented fix | Recheck |
| --- | --- | --- | --- |
| High | `web/src/Swap.tsx:45`, `web/src/ContractTools.tsx:28` | An asynchronous result could arrive after the wallet changed. Generation checks discard stale quotes/reviews; wallet identity is checked again immediately before signing. | Changed-account quote interaction passes; source-reviewed equivalent tools guard. |
| High | `web/src/App.tsx:278` | A receipt timeout must not unlock another send. Submitted-but-unconfirmed transactions retain the lock and expose receipt-only recovery. | Timeout/recovery interaction verifies one send and disabled next action. |
| Medium | `web/src/ContractTools.tsx:129` | A wrapping action label included option text, making exact-label targeting ambiguous. Split the visible label from its explicitly associated select. | Contract-tools test and axe label checks pass. |
| Medium | `web/src/style.css:823` | Mobile CSS visually moved swaps ahead of earlier keyboard targets. Removed reordering so visual and DOM sequences agree. | Final mobile screenshot and overflow test checked. |
| Medium | `web/src/Swap.tsx:51`, `web/src/ContractTools.tsx:34` | Error focus could be attempted while the form was disabled for a request. Associate error text/invalid state with its field, then focus after the request clears. | Final interaction/axe suite passes; amount, slippage and recipient failures displayed. |
| Low | `web/src/style.css:1` | Initial unused empty CSS import caused a build warning. Removed it. | Final build has no CSS import warning. |

No unresolved known blocker remains in the implemented frontend. The path conflict and unperformed live/browser behaviors above remain explicit delivery limitations.

## Evidence files

- `evidence/desktop-live.png`, `evidence/mobile-live.png`: real public RPC reads, no wallet, active-liquidity warning.
- `evidence/desktop-mocked.png`, `evidence/mobile-mocked.png`: deterministic mocked chain with nonzero liquidity, expanded ERC-20 tools, reduced motion.
- `evidence/build.txt`, `evidence/tests.txt`, `evidence/interaction-results.json`, `evidence/integrity.txt`: final worker commands/results.
- `evidence/live-chain.json`, `evidence/rendered-contrast.json`, `evidence/accessibility-results.json`, `evidence/browser-console.txt`, `evidence/browser-network.txt`: observed chain and browser evidence.

**Completion:** frontend implementation, production export and worker validation are complete for the stated write scope. Delivery cannot satisfy the conflicting root-design path; the full design document is included at its permitted location. **Git staging/commit is blocked by the workspace's read-only `.git`**: `git add -- web dist docs` failed creating `.git/index.lock`. The source, export and evidence remain present for the publisher to collect; no commit is claimed.

`evidence/submission-budget.json` records the path and raw-byte audit. Existing tracked files plus the proposed delivery total approximately 2.69 MB; allowing 1 KiB overhead per file still stays below 2.8 MB, versus the 8 MiB limit. The complete binary Git bundle was not generated: the partial clone tried to fetch missing historical objects into protected `.git/objects/pack` and failed. Raw-byte accounting is evidence of the small delivered content, not a claim that a complete history bundle was produced.

Guidance attribution and licenses: `licenses/better-interface.txt` and `licenses/eth-frontend-ux.txt`. Protocol encoding was also checked against [Uniswap’s primary swap documentation](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping); chain addresses continue to come exclusively from the supplied network file.

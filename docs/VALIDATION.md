# Swap and Dev Payroll validation

Worker checks on 2026-10-06. These are local results, not an independent certification.

## Scope and required outputs

The existing terminal now quotes despite zero active pool liquidity, removes the unavailable-liquidity warning, decodes sell `NotEnoughLiquidity`, preserves other Quoter revert reasons, and reads the distributor's NODEV balance in the existing refresh cycle. Dev Payroll sits immediately below Dev Diagnostics and shows the requested copy and salary/collected/unclaimed values. Arithmetic and formatting retain all token precision. Other product behavior, contracts, build configuration and dependencies are unchanged.

Required output: source/tests in `web/`, existing `web/package.json` and lockfile, complete relative-URL export at `dist/index.html` with its assets/ABI/manifest, root `DESIGN.md`, and README install/preview/rebuild/publish instructions. The distributor address comes directly from this assignment and the pinned project record. Token/pool/router/RPC configuration and implementation-derived ABI remain bound to the unchanged supplied handoff.

## Reproduction and repairs

1. Before the source fix, the new zero-liquidity buy test failed: **Expected enabled; received disabled** for “Get quote →”. See `evidence/swap-reproduction.txt`. The cause was the `state?.liquidity === 0n` button condition, plus its unconditional warning. Both were removed.
2. Uniswap's Quoter wraps failed pool simulations in `UnexpectedRevertBytes`. The added ABI entries and quote-specific decoder inspect the underlying `NotEnoughLiquidity(bytes32)` and apply the requested sentence only to sells. String reverts, other custom errors and unknown selectors remain visible. An empty revert string retains a failure message; its regression also passes. The observed mainnet sell revert confirms this wrapper and pool ID. Primary sources inspected: [BaseV4Quoter](https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/base/BaseV4Quoter.sol), [QuoterRevert](https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/libraries/QuoterRevert.sol), accessed 2026-10-06. Current main-branch source is explanatory; live calls provide the deployment-specific evidence.
3. Initial browser reproduction started before Chromium installation finished and failed to locate its executable. After installation completed in `/tmp`, reproduction reached the actual disabled-button failure above.
4. The first expanded test run failed during fixture initialization: viem requires an explicit `Error(string)` ABI for encoding that test revert. Adding that ABI fixed the fixture. The complete suite subsequently passed. No project behavior or assertion was weakened to resolve that fixture error. Final `git diff --check` also found trailing spaces in a generated network log; those spaces were removed and the check passed.

## Commands actually run

Node 24.21.0, npm 11.19.0, Chromium 153 via Playwright 1.63.0. To avoid touching repository `node_modules/` or protected package files, dependencies were installed using the exact existing manifest/lockfile in `/tmp/nodev-check/web`. Final source/config and the required ABI were copied there, builds used read-only `GIT_DIR=<workspace>/.git` for the pinned ABI lookup, and final source/export bytes were compared back to the workspace. This is a build staging directory, not a changed configuration.

| Check | Actual result |
| --- | --- |
| `npm ci --prefix /tmp/nodev-check/web --cache /tmp/nodev-npm` | Passed; 45 packages installed, audit reported zero vulnerabilities. No lockfile change. |
| `npm --prefix /tmp/nodev-check/web run build` with `GIT_DIR` set | Passed: `tsc --noEmit`, Vite production build, ABI/hash/export generation. `evidence/build.txt`. |
| Separate `npm --prefix /tmp/nodev-check/web run typecheck` | Passed. `evidence/typecheck.txt`. The configured source typecheck covers `src` and Vite config; tests are executed by Playwright. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/nodev-browsers npm --prefix /tmp/nodev-check/web test` | **26 passed (39.8s)** on the final export. `evidence/tests.txt`, `evidence/interaction-results.json`. |
| `NODEV_MAINNET=1 PLAYWRIGHT_BROWSERS_PATH=/tmp/nodev-browsers npm --prefix /tmp/nodev-check/web test -- mainnet.spec.ts` | **1 passed**, covering both RPCs. `evidence/mainnet-check.txt`, `evidence/mainnet-swap.json`. |
| `npm --prefix /tmp/nodev-check/web run verify` with `GIT_DIR` set | Passed: pinned ABI canonical Keccak, asset inventory and SHA-256 manifest. `evidence/integrity.txt`. Final preflight separately compares archived config with the pinned inputs. |
| Browser inspection of actual workspace `dist/` | Chromium screenshots at 1440×1000 and 390×844; live payroll values, removed warning and normal page layout observed. No console warnings/errors; all recorded resources/RPC requests succeeded. |
| Responsive/accessibility tests | No document overflow at 1440/768/390/320, including full-precision payroll values. CSS 200% zoom and an RTL mirror also had no overflow. Axe WCAG 2 A/AA and 2.1 AA: zero violations in the expanded-tools state at 320×900. |

The main JavaScript chunk remains above Vite's 500kB warning threshold (539.47kB, 164.96kB gzip). The warning is nonfatal and no build settings were altered to suppress it. The export inventory contains six hashed assets plus `imd-deployment.json` (about 566kB total).

Interaction coverage includes: zero-liquidity buy quote and router simulation; direct/wrapped sell liquidity failures; buy liquidity failure with actual reason; other custom, string and unknown-selector errors; unusable zero-output quote; exact payroll arithmetic, disconnected reads, automatic refresh, zero/all-unclaimed states, RPC failure/recovery and narrow layouts. Existing wallet/network changes, finite sell approvals, balance/precision/slippage validation, stale quotes, rejected signatures, pending-receipt recovery, ERC-20 tools, copy/keyboard/log controls, RPC fallback, ABI tampering and gateway-subpath tests also passed.

## Mainnet evidence

Both configured RPCs verified chain ID 1. PublicNode observed block **26130584**; dRPC observed block **26130583**. At each block:

- Active pool liquidity: **0**.
- Input: **0.0001 ETH** (`100000000000000` wei).
- Quoter output: **9,859.085587022901712057 NODEV**, greater than zero.
- 0.5% slippage minimum: **9,809.790159087787203496 NODEV**.
- Universal Router `execute` using the production `encodeSwap` output: **successful eth_call simulation**.
- Distributor balance: **96,891,284.815813117699910152 NODEV**; collected by the specified subtraction: **3,108,715.184186882300089848 NODEV**.
- A separate 1 NODEV sell quote reverted with wrapped `NotEnoughLiquidity`; the production formatter returned exactly “Nobody has bought yet, so the pool has no ETH to pay sellers.”

The test uses each observed block's funded fee recipient as an `eth_call` sender. No private key, wallet signature, state override, storage override or broadcast is involved. Block hashes, sender balances, complete calldata and raw sell reverts are in `evidence/mainnet-swap.json`. Results describe those blocks and can change with later trades.

## Better Interface consolidated review

The pinned workflow and core principles of all six domains were read and applied to the changed surfaces, preserving the existing visual identity. The final design is documented at root `DESIGN.md`.

| Domain | Coverage and findings | Limits |
| --- | --- | --- |
| Accessibility — checked | Native quote buttons/labels, persistent alert, existing focus styles; named payroll section, definition list and polite updates; keyboard/axe regression checks passed. | No screen-reader or assistive-device session; axe marks `aria-prohibited-attr` and `color-contrast` cases incomplete, not passed. |
| Layout — checked | Payroll reuses the panel and left-stack grid directly below diagnostics. Rows wrap and full values remain readable. Desktop/mobile screenshots, 320px reflow, intermediate widths, CSS zoom and RTL stress checked. | Native browser-menu zoom, physical mobile devices and translated content not tested. |
| Writing — checked | Requested payroll copy and sell message retained exactly; financial actions retain plain labels. Other Quoter reverts expose their reason without relabeling a contract denial as wallet rejection. | English only; unknown custom ABI signatures cannot be given invented names. |
| Typography — checked | Existing system monospace/scale preserved, payroll uses tabular figures and selectable exact values. Full-precision fractions wrap at small widths. | Cross-OS fallback fonts and iOS text/input zoom not tested. |
| Colors — checked | Existing semantic tokens reused. Six rendered text pairs sampled: minimum **7.96:1**. Payroll heading/surface **14.23:1**, values/surface **13.97:1**. `evidence/payroll-design-check.json`. | Samples do not cover every wallet/error/hover state or constitute a full contrast matrix. One dark theme exists; additional themes are not applicable. |
| UI — checked | Existing surfaces, controls and motion preserved. Quote pending/ready/error states, payroll awaiting/live/error-recovery states and reduced-motion behavior exercised. | No 10%-speed animation-panel session or native touch hardware. Dialogs, new imagery and theme transitions are not applicable. |

| Severity | Final source location | Finding/fix and recheck |
| --- | --- | --- |
| High | `web/src/Swap.tsx:326` | Zero active liquidity incorrectly blocked a valid buy. Removed the condition and warning. Before/after regression and both mainnet simulations establish the repair. |
| Medium | `web/src/chain.ts:46`, `web/src/config.ts:77` | Existing quote handling could not decode the Quoter wrapper or preserve all revert details. Quote-specific decoding now handles sell liquidity errors and preserves other reasons. Seven error-path browser cases and the live sell check passed. |
| Preventive layout check | `web/src/App.tsx:585`, `web/src/style.css:498` | Exact payroll decimals need room on mobile. New panel rows wrap with tabular figures and unrestricted word wrapping; the tested 320px page has no overflow. No unrelated typography redesign. |

## Deliverable and limitations

Source, unchanged dependency lockfile, complete regenerated `dist/`, root `DESIGN.md`, updated READMEs and actual check evidence are present for contributor collection. `.git/` is explicitly protected, so no staging or commit was attempted or claimed. Publishing/pinning/updating the existing site name is still the publisher's step; this worker did not publish. No signed swap was sent. Actual wallet extension behavior, mined transactions, gas costs, reorgs and long-duration RPC availability remain outside these checks. Solidity was unchanged, so Foundry and Slither were not run for this frontend-only repair.

The browser tool did not provide the guide's suggested `test/scratch/browser/preview.json`; the actual export was served with Python's static HTTP server on local port 4175 instead. The existing suite separately checked the `/ipfs/test-cid/` path with a plain-file server. Generated tool screenshots/snapshots outside named evidence were removed before delivery. Dependencies, caches, browser binaries and registry archives remain outside the submission; ignore files were not changed.

Current evidence: `desktop-live.png`, `mobile-live.png`, `desktop-mocked.png`, `mobile-mocked.png`, `tests.txt`, `interaction-results.json`, `accessibility-results.json`, `build.txt`, `typecheck.txt`, `integrity.txt`, `swap-reproduction.txt`, `mainnet-check.txt`, `mainnet-swap.json`, `payroll-design-check.json`, `layout-stress.json`, `browser-console.txt`, `browser-network.txt`, plus final `preflight.json` and `submission-budget.json`. The delivered content is approximately 2.82 MB raw; a conservative content-plus-metadata budget is about 3.06 MB against the 8 MiB limit. The content ZIP measured about 1.36 MB. A complete Git history bundle was not generated; `.git/` stays untouched and final contributor bundling is external. The retained `live-chain.json` and `rendered-contrast.json` are historical evidence from the preceding task, not this update's mainnet or contrast check.

Guidance attribution: Better Interface by Jakub Krehel (MIT, pinned `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and Impeccable documentation guidance by Paul Bakaus (Apache-2.0, pinned `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`); existing licenses remain in `docs/licenses/`.

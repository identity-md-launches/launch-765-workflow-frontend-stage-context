# NODEV terminal

React + TypeScript + Vite frontend for the deployed **Dev Is A Robot** token. The deliverable is `../dist/`: a complete static site, implementation ABI and deployment manifest. No backend, credentials, hosted font, wallet project ID or registry mirror is needed.

## Run and rebuild

Tested with Node 24.21.0 and npm 11.19.0. Run from `web/`:

```sh
npm ci
npm run build
npm run preview -- --port 4173
```

Open `http://localhost:4173/`. For source development, run `npm run dev` after the first build. The development middleware serves the same generated deployment manifest and ABI from `dist/`. Changes to the handoff require a rebuild. Production always serves the committed export, not the dev server.

The build runs TypeScript, exports Vite with `base: './'`, obtains the ABI from the pinned Git commit, verifies its canonical Keccak hash, writes the ABI and finally regenerates `dist/imd-deployment.json`. Rebuild after any source or export change. Do not manually edit exported assets or their manifest. Keep Git history containing the pinned source commit available when rebuilding.

## Configuration and deployment binding

- `config/handoff.json` and `config/network.json` archive the supplied build inputs because the worker's `.imd/reads/` inputs are removed on delivery. They are not imported by browser code. When the pinned inputs exist, the export script compares them with these archived copies.
- **`dist/imd-deployment.json` is the sole runtime deployment configuration.** `src/config.ts` fetches it relative to the current page and loads each referenced ABI. Addresses, chain ID, pool key and public RPCs come from it. No separate browser address map exists.
- `scripts/export.mjs` uses `git show <sourceCommit>:docs/abi/<Contract>.json`. It compares canonical JSON Keccak (recursively sorted object keys, preserved array order, compact UTF-8 JSON) to the handoff, checks the working ABI and exports a raw ABI array. `LaunchToken` binds to `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee`.
- The runtime also verifies each ABI's canonical Keccak. Before writes it checks the wallet account/chain, configured RPC chain ID, nonempty deployed code and a successful transaction simulation. This checks code presence; it does not independently establish deployed bytecode equivalence to Solidity source.
- The manifest copies the exact attested pool key, including the initialization guard and **12500 fee (1.25%)**. This takes precedence over the older `manifest.pool.fee` value of 3000. `network` and `walletAddChain` remain unchanged.
- Standard Uniswap interfaces are centralized in `src/config.ts`. Quotes, routing and Permit2 use addresses only from `manifest.network.uniswapV4`. The static source link is the repository URL supplied by the handoff.

## Wallet and token actions

Use an injected EIP-1193 browser wallet or a wallet's in-app browser. No WalletConnect project ID was supplied, so QR/WalletConnect is not configured. Connection requests an account explicitly. The wrong-chain state offers one switch control; unknown-chain error 4902 invokes the supplied `wallet_addEthereumChain` parameters and retries switching. Account, chain and disconnect events clear action eligibility and stale reviews.

The terminal reads token metadata/supply, NODEV and ETH balances, and pool `getSlot0`/`getLiquidity` via the configured StateView. Pool ID derives from the exact handoff key. Spot price derives from `sqrtPriceX96`, token order and the deployed 18-decimal pair. USD context is unavailable because the brief supplies no price oracle. Reads use the public RPC list in order with intentional fallback. Polls run after each completed read: 5 seconds connected, 15 seconds disconnected, skipped while hidden. Requests do not accumulate on slow networks. A failed read clears transaction eligibility and exposes retry.

Swaps support the actual attested **ETH/NODEV** pair in both directions. Other pairs are explicitly disabled in this release. `quoteExactInputSingle` is an `eth_call` simulation, never a transaction. Quotes last 30 seconds. Slippage is 0.1–5%, defaults to 0.5%, and sets a nonzero minimum output. Native input sends its exact value without approvals. NODEV input offers each necessary finite allowance as a separate transaction: token → Permit2, then Permit2 → configured Universal Router (one-hour expiry), then swap. Fresh allowances are checked before each step. The router uses `0x10`, actions `0x060c0f`, and the handoff pool key; the extended tuple branch follows `extendedSwapParams` when supplied.

Every send is simulated before requesting a signature; a fresh account/chain check follows simulation. Quotes expiring during simulation cannot be signed. Submitted transactions stay locked through receipt confirmation. If confirmation cannot be read, the explorer link and **Retry confirmation** recover receipt status while sending remains locked. A page reload clears local pending state; inspect your wallet/explorer for pending transactions before sending again after a reload.

ERC-20 tools expose `transfer`, `approve` (zero revokes) and `transferFrom`. They resolve pasted addresses or `.eth` names, show the resolved destination and live balance/allowance, and require an explicit review before confirmation. Native fees are separate. Disconnecting does not revoke on-chain allowances. No privileged controls are invented.

## Checks

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
npm run verify
node scripts/live-check.mjs
```

On this restricted worker, npm used `--cache /tmp/nodev-npm`, and browser install/tests used `PLAYWRIGHT_BROWSERS_PATH=/tmp/nodev-browsers`. Both caches stay outside the submission. Playwright is a development dependency; no browser binary is shipped.

`npm test` checks the actual production export, with mocked EIP-1193 and public RPC responses. It starts a second plain-file server at `/ipfs/test-cid/` to test subpath hosting without SPA rewrites. It never sends funded transactions. `live-check.mjs` performs only public read calls, recording both RPCs and their observed block, metadata, pool and code hashes. The interaction suite writes evidence under `docs/evidence/`; temporary runner output is ignored.

See [validation](../docs/VALIDATION.md) and [implemented design](../docs/DESIGN.md). Publication, IPFS pinning, naming and control-plane checks are subsequent publisher work. No publication check is claimed as browser or swap validation.

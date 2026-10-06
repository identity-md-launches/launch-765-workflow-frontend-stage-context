# NODEV implemented design

## Overview

This single-page terminal serves NODEV holders and visitors inspecting or trading the token. Its green-on-black retro character, robot illustration, headline, fixed diagnostics and looping thought log follow the supplied workflow. Financial controls use plain action labels and persistent feedback. The thought log is explicitly marked as simulated, prewritten output.

This document describes the final source in `web/src/`. The payroll panel reuses the existing terminal system; other page styling is preserved.

## Colors

Source: `web/src/style.css:1`. The implementation uses sRGB hex primitives referenced by semantic variables. It deliberately has one dark theme, with no theme switch.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--bg` | `#080c09` | Page and recessed fields |
| `--surface` | `#101a12` | Panels and neutral controls |
| `--surface-hover` | `#18271b` | Selected direction, output field, hover |
| `--border` | `#314835` | Structural separators |
| `--control-border` | `#617e67` | Input and control boundaries |
| `--text` | `#d8ebd6` | Main text |
| `--muted` | `#9db39e` | Secondary text and captions |
| `--accent`, `--focus` | `#9dfb70` | Terminal identity, primary action, focus outline |
| `--error` | `#ff9992` | Persistent failures |
| `--danger` | `#b62420` | Fire the Dev button, with white label |
| `--warning` | `#e7c87d` | Unavailable operations and warning log lines |

Text and labels distinguish status independently of hue. Green intentionally serves the requested terminal typography as well as actions; button shape/borders identify controls. The current rendered payroll pairs measure 14.23:1 for heading/surface, 13.97:1 for values/surface and 7.96:1 for labels or captions/surface. See `docs/evidence/payroll-design-check.json`; these samples do not establish exhaustive state coverage.

## Typography

The requested stack is `'Courier New', Courier, monospace`. Fonts are system-provided; there is no font download. Regular 400 and bold 700 are used; `font-synthesis: none` avoids fake styles. Browser rendering was inspected in Chromium; exact system font substitution may differ by platform.

The root is 16px. Tokens: `--small: .75rem`, `--body: .875rem`, `--heading: 1.125rem`. The hero scales from 2.1rem to 3.35rem, with 1.14 line-height and −.065em tracking, overridden to 2rem at the narrowest breakpoint. Section headings use 1.4 line-height and become 1rem at the narrow layout; paragraphs use 1.6. Labels and decorative system text range from .625rem to .75rem. Inputs are at least 1rem, with the swap amount at 2rem. Important numeric stats use tabular figures. Headings balance wrapping, descriptions use pretty wrapping, and addresses can break anywhere. Body copy is left aligned in the English release.

## Layout

`.shell` caps content at 1256px including 40px inline padding. The spacing rhythm primarily uses 8/12/16/24/32/40/48/64px. Header → hero → live stats → contract → diagnostics/payroll/log and swap → contract tools → management button → deployment details → footer is the DOM reading order.

The hero pairs flexible copy with a 260px decorative robot. The stats have three columns. `.workspace` uses `1.25fr 1fr`, and `.tool-grid` uses two columns. Content can grow naturally; no fixed text-container heights. The thought log alone has a 186px scroll region and a pause control.

At **65rem**, the robot narrows to 210px, panel padding decreases to 20px and workspace columns become equal. At **49rem**, the robot is hidden, shell padding becomes 24px, panels stack in DOM order, the contract address row stacks, and the tools use one column. At **26rem**, shell/panel padding is 16px, all stats stack and the brand simplifies. The destructive joke action becomes full width on mobile. Mobile keyboard and visual orders agree.

Rendered overflow checks covered 1440, 768, 390 and 320 CSS-pixel widths. Current desktop CSS zoom at 200% and a basic RTL mirror also had no document overflow; native browser zoom, localized content and physical mobile devices were not validated.

## Elevation & Depth

The terminal is mostly flat. One-pixel structural borders, background changes and dashed diagnostic separators define sections. Only the decorative robot and red button use hard offset shadows. Static scanlines and a sliced robot drawing supply a glitch effect without a flashing screen. There are no modal overlays or sticky controls that cover content.

## Shapes

Panels and buttons have 3px radii; input corners are 2px. The robot, square dot and monospaced glyphs preserve the terminal character. The locally authored favicon uses a simple robot SVG. No raster artwork or remote assets are needed for runtime.

## Components

| Pattern and source | Behavior |
| --- | --- |
| `Terminal`, `web/src/App.tsx` | Header connection, read verification, balances, status and transaction lifecycle. Wrong-chain, pending, failed, unconfirmed and confirmed states are explicit. |
| `AddressLink`, `web/src/App.tsx` | Checksum address, explorer link and copy action with a stable status region. Clipboard failure tells the visitor to select the address. |
| `ThoughtLog`, `web/src/App.tsx` | Bounded repeating lines, focusable scroll area, pause/resume; starts paused under reduced motion. Decorative output is not repeatedly announced. |
| `Swap`, `web/src/Swap.tsx` | Native buttons with pressed state for direction, labeled amount/slippage fields, quote summary and one next-step action. Wallet/network verification gates actions; pool trade availability comes from the Quoter result. Zero active liquidity does not disable quotes. Sell `NotEnoughLiquidity` gets the requested explanation; other reverts expose the returned reason. |
| Dev Payroll, `web/src/App.tsx:585` and `.payroll` in `style.css` | A labeled section directly below diagnostics, native definition list, polite balance updates and two captions. Salary is fixed; collected/unclaimed use exact bigint arithmetic and all available decimal places. Missing live data says “Awaiting RPC”. Wrapping rows, tabular digits and `overflow-wrap: anywhere` preserve full values at 320px. No new controls or animations. |
| `ContractTools`, `web/src/ContractTools.tsx` | Native details/summary; labeled action selector and address/amount fields; review shows exact resolved destination and amount. |
| `.primary`, `.small`, `.danger` in `style.css` | Primary green, compact outlined, red management action. Minimum regular button height 44px; compact buttons 40px. Disabled states are native. |
| Focus and feedback | Two-pixel accent outline, 4px offset; forced colors use `Highlight`. Persistent inline errors and polite transaction/copy regions supplement visual changes. |

Motion is optional: button background/scale transitions are 120ms with `cubic-bezier(.2,0,0,1)` and a .96 press scale. A 1.2s cursor blink exists only with `prefers-reduced-motion: no-preference`. The log timer respects reduced motion and its manual pause setting.

## Do's and Don'ts

- Reuse `.shell`, `.panel`, existing spacing and semantic colors when adding content. Preserve readable terminal contrast.
- Keep wallet and financial labels literal. Use the deliberately absurd voice in the diagnostics and simulated log.
- Use native labels, buttons and details controls; keep keyboard order equal to visual order. Put validation beside its field.
- Load deployment values from the runtime manifest. Keep transaction simulations and prerequisite guards when reusing action patterns.
- Preserve relative resource paths. Rebuild the export and manifest together after any runtime change.
- Do not add a decorative loading animation that obscures financial status, an invented USD value, a theme switch without a second theme, or unrelated layout changes.

Design and documentation guidance attribution: Better Interface by Jakub Krehel (MIT, `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and Impeccable by Paul Bakaus (Apache-2.0, `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). This is an implementation-specific adaptation of the supplied documentation method. Full notices/licenses are in `docs/licenses/better-interface.txt`; Ethereum UX guidance is credited in `docs/licenses/eth-frontend-ux.txt`.

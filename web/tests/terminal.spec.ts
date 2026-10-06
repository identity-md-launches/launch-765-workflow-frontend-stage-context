import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { decodeAbiParameters, parseAbiParameters, parseUnits } from "viem";
import { setup, account, other } from "./fixtures";
import network from "../config/network.json" with { type: "json" };
import handoff from "../config/handoff.json" with { type: "json" };
import { poolType } from "../src/config";
import { amount, encodeSwap } from "../src/chain";
import { writeFile } from "node:fs/promises";
const connect = async (page: any) => {
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await expect(page.getByRole("button", { name: "Get quote →" })).toBeEnabled();
};
const quote = async (page: any) => {
  await page.getByLabel("You pay").fill("0.01");
  await page.getByRole("button", { name: "Get quote →" }).click();
};
test("disconnected, copy, log controls, keyboard action and no-wallet error", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page, { wallet: false });
  await page.goto("/");
  await expect(
    page.getByText("RPC chain and contract code verified", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).toLowerCase(),
  ).toBe(handoff.contracts[0].address);
  await page.getByRole("button", { name: "Pause log" }).click();
  await expect(page.getByRole("button", { name: "Resume log" })).toBeVisible();
  await page.getByRole("button", { name: "Fire the Dev" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(
      "ACCESS DENIED: DEV HAS UPLOADED CONSCIOUSNESS TO THE BLOCKCHAIN.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await expect(
    page.getByText("No browser wallet found.", { exact: false }),
  ).toBeVisible();
  await page.locator(".tools summary").click();
  await expect(
    page.getByRole("button", { name: "Review action" }),
  ).toBeDisabled();
});
test("wrong network offers add-chain after 4902 then reconnects reads", async ({
  page,
}) => {
  await setup(page, { wrongChain: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await expect(
    page.getByText("Wrong network.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to Ethereum" })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Get quote →" })).toBeEnabled();
  const calls = await page.evaluate(() =>
    (window as any).walletCalls.filter((c: any) =>
      c.method.startsWith("wallet_"),
    ),
  );
  expect(calls.map((c: any) => c.method)).toEqual([
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
  ]);
  expect(calls[1].params).toEqual([network.walletAddChain]);
  await page.evaluate(() => (window as any).emitWallet("accountsChanged", []));
  await expect(
    page.getByRole("button", { name: "Connect wallet" }).first(),
  ).toBeVisible();
});
test("rejected connection and transaction are recoverable", async ({
  page,
}) => {
  await setup(page, { rejectConnect: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await expect(
    page.getByText("Request rejected in your wallet.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet" }).first(),
  ).toBeEnabled();
});
test("ETH buy uses exact handoff key, minimum output, native value and simulation before signing", async ({
  page,
}) => {
  const s = await setup(page, { receiptDelay: 1200 });
  await page.goto("/");
  await connect(page);
  await quote(page);
  await expect(
    page.getByText("Minimum received:", { exact: false }),
  ).toContainText("99.5 NODEV");
  await page.getByRole("button", { name: "Swap ETH for NODEV" }).click();
  await expect(
    page.getByRole("button", { name: "Waiting for confirmation…" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  expect(s.sends).toHaveLength(1);
  expect(s.sends[0].to.toLowerCase()).toBe(
    network.network.uniswapV4.universalRouter,
  );
  expect(BigInt(s.sends[0].value)).toBe(parseUnits("0.01", 18));
  expect(s.calls.some((c) => c.functionName === "execute")).toBeTruthy();
  expect(s.calls.filter((c) => c.functionName === "approve")).toHaveLength(0);
  const [commands, inputs, deadline] = s.sends[0].args;
  expect(commands).toBe("0x10");
  expect(deadline > BigInt((Date.now() / 1000) | 0)).toBeTruthy();
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    inputs[0],
  );
  expect(actions).toBe("0x060c0f");
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      `(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
    ),
    params[0],
  ) as any;
  expect(swap.poolKey.hooks.toLowerCase()).toBe(handoff.poolKey.hooks);
  expect(swap.poolKey.fee).toBe(12500);
  expect(swap.zeroForOne).toBe(true);
  expect(swap.amountOutMinimum).toBe(parseUnits("99.5", 18));
});
test("NODEV sell confirms each finite approval and then swaps with zero ETH value", async ({
  page,
}) => {
  const s = await setup(page);
  await page.goto("/");
  await connect(page);
  await page.getByRole("button", { name: "Sell NODEV", exact: true }).click();
  await quote(page);
  await page.getByRole("button", { name: "Approve NODEV to Permit2" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Get quote →" })).toBeEnabled();
  await page.getByRole("button", { name: "Get quote →" }).click();
  await page.getByRole("button", { name: "Approve router in Permit2" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Get quote →" })).toBeEnabled();
  await page.getByRole("button", { name: "Get quote →" }).click();
  await page.getByRole("button", { name: "Swap NODEV for ETH" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  expect(s.sends.map((x) => x.functionName)).toEqual([
    "approve",
    "approve",
    "execute",
  ]);
  expect(s.sends[0].args[0].toLowerCase()).toBe(
    network.network.uniswapV4.permit2,
  );
  expect(s.sends[0].args[1]).toBe(parseUnits("0.01", 18));
  expect(s.sends[1].args[1].toLowerCase()).toBe(
    network.network.uniswapV4.universalRouter,
  );
  expect(s.sends[1].args[2]).toBe(parseUnits("0.01", 18));
  expect(s.sends[2].value).toBe("0x0");
});
test("slippage, precision, insufficient balance, stale quote and simulation revert", async ({
  page,
}) => {
  const s = await setup(page, { revertSwap: true });
  await page.goto("/");
  await connect(page);
  await page.getByLabel("You pay").fill("0.0000000000000000001");
  await page.getByRole("button", { name: "Get quote →" }).click();
  await expect(page.locator("#swap-error")).toContainText("18 decimal places");
  await page.getByLabel("You pay").fill("20");
  await page.getByRole("button", { name: "Get quote →" }).click();
  await expect(page.locator("#swap-error")).toContainText("Insufficient ETH");
  await page.getByLabel("You pay").fill("0.01");
  await page.getByLabel("Slippage tolerance").fill("10");
  await page.getByRole("button", { name: "Get quote →" }).click();
  await expect(page.locator("#swap-error")).toContainText(
    "between 0.1% and 5%",
  );
  await page.getByLabel("Slippage tolerance").fill("0.5");
  await page.getByRole("button", { name: "Get quote →" }).click();
  await page.getByRole("button", { name: "Swap ETH for NODEV" }).click();
  await expect(
    page.getByText("The price moved beyond your minimum.", { exact: false }),
  ).toBeVisible();
  expect(s.sends).toHaveLength(0);
  await page.getByRole("button", { name: "Get quote →" }).click();
  await page.clock.install();
  await page.clock.fastForward(31000);
  await expect(
    page.getByText("Quote expired. Request a fresh quote."),
  ).toBeVisible();
});
test("wallet rejection resets pending, and changed account discards in-flight quote", async ({
  page,
}) => {
  const s = await setup(page, { rejectSend: true, quoteDelay: 1000 });
  await page.goto("/");
  await connect(page);
  await quote(page);
  await page.getByRole("button", { name: "Swap ETH for NODEV" }).click();
  await expect(
    page.getByText("Request rejected in your wallet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get quote →" }).click();
  await page.evaluate(
    (other) => (window as any).emitWallet("accountsChanged", [other]),
    other,
  );
  await expect(page.getByRole("button", { name: "Get quote →" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Swap ETH for NODEV" }),
  ).toHaveCount(0);
  expect(s.sends).toHaveLength(0);
});
test("contract tools: validate recipient, transfer, approve/revoke and transferFrom", async ({
  page,
}) => {
  const s = await setup(page);
  await page.goto("/");
  await connect(page);
  await page.locator(".tools summary").click();
  await page.locator("#tool-to").fill("not-an-address");
  await page.locator("#tool-amount").fill("1");
  await page.getByRole("button", { name: "Review action" }).click();
  await expect(page.locator("#tool-error")).toContainText(
    "valid nonzero address",
  );
  await page.locator("#tool-to").fill(other);
  await page.getByRole("button", { name: "Review action" }).click();
  await expect(page.locator(".review")).toContainText(
    "Owner balance: 1,000 NODEV",
  );
  await page.getByRole("button", { name: "Confirm transfer" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Action", { exact: true }).selectOption("approve");
  await page.locator("#tool-amount").fill("0");
  await expect(
    page.getByRole("button", { name: "Review action" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Review action" }).click();
  await expect(page.locator(".review")).toContainText("Revoke");
  await page.getByRole("button", { name: "Confirm allowance" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  s.tokenAllowance = parseUnits("10", 18);
  await page.getByLabel("Action", { exact: true }).selectOption("transferFrom");
  await page.locator("#tool-from").fill(other);
  await page.locator("#tool-to").fill(account);
  await page.locator("#tool-amount").fill("2");
  await expect(
    page.getByRole("button", { name: "Review action" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Review action" }).click();
  await page.getByRole("button", { name: "Confirm transfer" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  expect(s.sends.map((x) => x.functionName)).toEqual([
    "transfer",
    "approve",
    "transferFrom",
  ]);
  expect(s.sends[1].args[1]).toBe(0n);
  expect(s.sends[2].args).toEqual([other, account, parseUnits("2", 18)]);
});
for (const failure of ["failRpc", "noCode", "noLiquidity"] as const)
  test(`${failure} blocks swapping and exposes recovery`, async ({ page }) => {
    await setup(page, { [failure]: true });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await expect(
      page.getByRole("button", { name: "Get quote →" }),
    ).toBeDisabled();
    if (failure === "noLiquidity")
      await expect(
        page.getByText("No active pool liquidity.", { exact: false }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("button", { name: "Retry live reads" }),
      ).toBeVisible();
  });
test("configured RPC fallback works", async ({ page }) => {
  await setup(page, { failFirstRpc: true });
  await page.goto("/");
  await connect(page);
});
test("ABI tampering fails closed", async ({ page }) => {
  await page.route("**/abi/LaunchToken.json", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Contract ABI verification failed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet" }),
  ).toHaveCount(0);
});
test("responsive layout, reduced motion, keyboard focus and automated accessibility", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("RPC chain and contract code verified", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume log" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("link", { name: "Skip to content" })
      .evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe("2px");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.locator(".tools summary").click();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    "../docs/evidence/accessibility-results.json",
    JSON.stringify(
      {
        tool: "axe-core",
        tags: ["wcag2a", "wcag2aa", "wcag21aa"],
        violations: audit.violations,
        passes: audit.passes.map((p) => p.id),
        incomplete: audit.incomplete.map((p) => p.id),
        viewport: { width: 320, height: 900 },
      },
      null,
      2,
    ),
  );
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: "../docs/evidence/mobile-mocked.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../docs/evidence/desktop-mocked.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("static export resolves every resource from a gateway subpath without rewrites", async ({
  page,
}) => {
  await setup(page, { wallet: false });
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("127.0.0.1:4174") && response.status() !== 200)
      failures.push(response.url());
  });
  await page.goto("http://127.0.0.1:4174/ipfs/test-cid/");
  await expect(
    page.getByText("RPC chain and contract code verified", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fire the Dev" }).click();
  await expect(
    page.getByText(
      "ACCESS DENIED: DEV HAS UPLOADED CONSCIOUSNESS TO THE BLOCKCHAIN.",
    ),
  ).toBeVisible();
  expect(failures).toEqual([]);
});
test("unconfirmed submission remains locked until receipt recovery succeeds", async ({
  page,
}) => {
  const fixture = await setup(page, { receiptUnavailable: true });
  await page.clock.install();
  await page.goto("/");
  await connect(page);
  await quote(page);
  await page.getByRole("button", { name: "Swap ETH for NODEV" }).click();
  await expect(
    page.getByText("Submitted. Waiting for on-chain confirmation…"),
  ).toBeVisible();
  await page.clock.fastForward(181000);
  await expect(
    page.getByRole("button", { name: "Retry confirmation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get quote →" }),
  ).toBeDisabled();
  fixture.options.receiptUnavailable = false;
  await page.getByRole("button", { name: "Retry confirmation" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  expect(fixture.sends).toHaveLength(1);
});
test("amount parsing and extended router encoding preserve limits and handoff key", () => {
  expect(() => amount("1e18")).toThrow();
  expect(() => amount("-1")).toThrow();
  expect(amount("0", 18, true)).toBe(0n);
  const runtime = {
    token: handoff.contracts[0].address,
    config: {
      poolKey: handoff.poolKey,
      network: {
        ...network.network,
        uniswapV4: { ...network.network.uniswapV4, extendedSwapParams: true },
      },
    },
  } as any;
  const encoded = encodeSwap(runtime, true, 100n, 90n);
  expect(encoded.value).toBe(0n);
  const [, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    encoded.inputs[0],
  );
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      `(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`,
    ),
    params[0],
  ) as any;
  expect(swap.minHopPriceX36).toBe(0n);
  expect(swap.zeroForOne).toBe(false);
  expect(swap.hookData).toBe("0x");
});

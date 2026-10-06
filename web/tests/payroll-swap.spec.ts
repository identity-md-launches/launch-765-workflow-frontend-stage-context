import { test, expect } from "@playwright/test";
import { setup } from "./fixtures";
import { encodeErrorResult, parseAbi, parseUnits } from "viem";
import { distributor, protocolAbi } from "../src/config";

const illiquid = encodeErrorResult({
  abi: protocolAbi.quoter,
  errorName: "NotEnoughLiquidity",
  args: [`0x${"ab".repeat(32)}`],
});
const wrap = (data: `0x${string}`) =>
  encodeErrorResult({
    abi: protocolAbi.quoter,
    errorName: "UnexpectedRevertBytes",
    args: [data],
  });

test("zero active liquidity still permits a quoted buy and simulated swap", async ({
  page,
}) => {
  const fixture = await setup(page, { noLiquidity: true });
  await page.goto("/");
  await expect(
    page.getByText("RPC chain and contract code verified", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await expect(page.getByRole("button", { name: "Get quote →" })).toBeEnabled();
  await expect(
    page.getByText("No active pool liquidity.", { exact: false }),
  ).toHaveCount(0);
  await page.getByLabel("You pay").fill("0.0001");
  await page.getByRole("button", { name: "Get quote →" }).click();
  await expect(page.locator(".receive strong")).toHaveText("100");
  await page.getByRole("button", { name: "Swap ETH for NODEV" }).click();
  await expect(
    page.getByText("Confirmed on Ethereum.", { exact: false }),
  ).toBeVisible();
  expect(fixture.calls.some((call) => call.functionName === "execute")).toBe(
    true,
  );
  expect(fixture.sends).toHaveLength(1);
});

for (const [name, data, sell, expected] of [
  [
    "direct sell liquidity failure",
    illiquid,
    true,
    "Nobody has bought yet, so the pool has no ETH to pay sellers.",
  ],
  [
    "wrapped sell liquidity failure",
    wrap(illiquid),
    true,
    "Nobody has bought yet, so the pool has no ETH to pay sellers.",
  ],
  [
    "buy liquidity failure retains actual reason",
    wrap(illiquid),
    false,
    "NotEnoughLiquidity",
  ],
  [
    "other custom failure retains reason",
    wrap(encodeErrorResult({ abi: protocolAbi.quoter, errorName: "NotSelf" })),
    true,
    "NotSelf",
  ],
  [
    "string revert retains reason",
    wrap(
      encodeErrorResult({
        abi: parseAbi(["error Error(string reason)"]),
        errorName: "Error",
        args: ["Pool swap denied by guard"],
      }),
    ),
    true,
    "Pool swap denied by guard",
  ],
  [
    "empty string revert still reports failure",
    wrap(
      encodeErrorResult({
        abi: parseAbi(["error Error(string reason)"]),
        errorName: "Error",
        args: [""],
      }),
    ),
    true,
    "reverted",
  ],
  ["unknown revert retains selector", wrap("0x12345678"), true, "0x12345678"],
] as const) {
  test(name, async ({ page }) => {
    const fixture = await setup(page, { noLiquidity: true, quoteRevert: data });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect wallet" }).first().click();
    await expect(
      page.getByRole("button", { name: "Get quote →" }),
    ).toBeEnabled();
    if (sell)
      await page
        .getByRole("button", { name: "Sell NODEV", exact: true })
        .click();
    await page.getByLabel("You pay").fill("0.0001");
    await page.getByRole("button", { name: "Get quote →" }).click();
    await expect(page.locator("#swap-error")).toContainText(expected);
    if (!sell || !expected.startsWith("Nobody"))
      await expect(page.locator("#swap-error")).not.toContainText(
        "Nobody has bought yet",
      );
    expect(fixture.sends).toHaveLength(0);
    await expect(
      page.getByRole("button", { name: "Get quote →" }),
    ).toBeEnabled();
  });
}

test("zero output from Quoter cannot enable a swap", async ({ page }) => {
  await setup(page, { zeroQuote: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await expect(page.getByRole("button", { name: "Get quote →" })).toBeEnabled();
  await page.getByLabel("You pay").fill("0.0001");
  await page.getByRole("button", { name: "Get quote →" }).click();
  await expect(page.locator("#swap-error")).toContainText("No usable quote");
  await expect(
    page.getByRole("button", { name: "Swap ETH for NODEV" }),
  ).toHaveCount(0);
});

test("payroll reads distributor while disconnected, refreshes exactly and recovers after RPC failure", async ({
  page,
}) => {
  const fixture = await setup(page, { wallet: false });
  await page.clock.install();
  await page.goto("/");
  const payroll = page.getByRole("region", { name: "Dev Payroll" });
  const collected = payroll
    .locator("dl > div")
    .filter({ hasText: "Collected:" });
  const unclaimed = payroll
    .locator("dl > div")
    .filter({ hasText: "Still unclaimed:" });
  await expect(payroll).toContainText("100,000,000 NODEV");
  await expect(collected).toContainText("0 NODEV");
  await expect(unclaimed).toContainText("100,000,000 NODEV");
  expect(
    fixture.calls.some(
      (call) =>
        call.functionName === "balanceOf" &&
        call.args[0].toLowerCase() === distributor,
    ),
  ).toBe(true);
  fixture.distributorBalance = parseUnits("98765432.123456789012345678", 18);
  await page.clock.fastForward(16000);
  await expect(collected).toContainText("1,234,567.876543210987654322 NODEV");
  await expect(unclaimed).toContainText("98,765,432.123456789012345678 NODEV");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  fixture.options.failRpc = true;
  await page.clock.fastForward(16000);
  await expect(payroll.getByText("Awaiting RPC")).toHaveCount(2);
  fixture.options.failRpc = false;
  fixture.distributorBalance = 0n;
  await page.getByRole("button", { name: "Retry live reads" }).click();
  await expect(collected).toContainText("100,000,000 NODEV");
  await expect(unclaimed).toContainText("0 NODEV");
});

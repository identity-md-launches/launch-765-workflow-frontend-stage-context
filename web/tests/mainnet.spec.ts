// Opt-in read-only mainnet check; never asks a wallet to sign or broadcasts.
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  formatUnits,
  parseEther,
  encodeFunctionData,
  type Abi,
} from "viem";
import {
  distributor,
  devSalary,
  protocolAbi,
  type Runtime,
} from "../src/config";
import { encodeSwap, poolId, quoteErrorText } from "../src/chain";

if (process.env.NODEV_MAINNET === "1") {
  test("mainnet: positive 0.0001 ETH buy and successful production router simulation", async () => {
    test.setTimeout(120000);
    const config = JSON.parse(
      await readFile("../dist/imd-deployment.json", "utf8"),
    );
    const token = config.contracts.find(
      (contract: any) => contract.name === "LaunchToken",
    );
    const abi: Abi = JSON.parse(
      await readFile(`../dist/${token.abiPath}`, "utf8"),
    );
    const results: any[] = [];
    for (const url of config.network.rpcUrls) {
      const entry: any = { url, pass: false };
      results.push(entry);
      try {
        const client = createPublicClient({
          transport: http(url, { timeout: 15000, retryCount: 0 }),
        });
        const r = {
          config,
          token: token.address,
          abi,
          client,
        } as unknown as Runtime;
        const chainId = await client.getChainId();
        expect(chainId).toBe(1);
        const block = await client.getBlock();
        const blockNumber = block.number;
        // Use the observed block fee recipient as a funded eth_call sender.
        // No balance, storage or code overrides are used.
        const account = block.miner;
        const n = parseEther("0.0001");
        const balance = await client.getBalance({
          address: account,
          blockNumber,
        });
        expect(balance).toBeGreaterThanOrEqual(n);
        Object.assign(entry, {
          chainId,
          blockNumber,
          blockHash: block.hash,
          account,
          senderBalanceWei: balance,
          poolId: poolId(r),
        });
        const [liquidity, distributorBalance] = await Promise.all([
          client.readContract({
            address: config.network.uniswapV4.stateView,
            abi: protocolAbi.state,
            functionName: "getLiquidity",
            args: [poolId(r)],
            blockNumber,
          }),
          client.readContract({
            address: token.address,
            abi,
            functionName: "balanceOf",
            args: [distributor],
            blockNumber,
          }),
        ]);
        Object.assign(entry, {
          liquidity,
          distributor,
          distributorBalance,
          collected: devSalary - (distributorBalance as bigint),
        });
        const { result } = await client.simulateContract({
          address: config.network.uniswapV4.quoter,
          abi: protocolAbi.quoter,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey: config.poolKey,
              zeroForOne: true,
              exactAmount: n,
              hookData: "0x",
            },
          ],
          account,
          blockNumber,
        });
        const out = result[0];
        expect(out).toBeGreaterThan(0n);
        const minimum = (out * 9950n) / 10000n;
        const encoded = encodeSwap(r, false, n, minimum);
        const args = [
          encoded.commands,
          encoded.inputs,
          block.timestamp + 120n,
        ] as const;
        Object.assign(entry, {
          inputETH: "0.0001",
          outputBaseUnits: out,
          outputNODEV: formatUnits(out, 18),
          minimumBaseUnits: minimum,
          quoteGasEstimate: result[1],
          router: config.network.uniswapV4.universalRouter,
          calldata: encodeFunctionData({
            abi: protocolAbi.router,
            functionName: "execute",
            args,
          }),
          value: encoded.value,
        });
        await client.simulateContract({
          address: config.network.uniswapV4.universalRouter,
          abi: protocolAbi.router,
          functionName: "execute",
          args,
          value: encoded.value,
          account,
          blockNumber,
        });
        entry.swapSimulation = "success";
        try {
          const sell = await client.simulateContract({
            address: config.network.uniswapV4.quoter,
            abi: protocolAbi.quoter,
            functionName: "quoteExactInputSingle",
            args: [
              {
                poolKey: config.poolKey,
                zeroForOne: false,
                exactAmount: parseEther("1"),
                hookData: "0x",
              },
            ],
            account,
            blockNumber,
          });
          entry.sellQuote = { result: sell.result };
        } catch (error) {
          entry.sellQuote = {
            error: quoteErrorText(error, true),
            raw: String(error),
          };
        }
        entry.pass = true;
      } catch (error) {
        entry.error = String(error);
      }
    }
    const evidence = {
      checkedAt: new Date().toISOString(),
      mode: "Mainnet eth_call at recorded blocks; no state overrides, signatures or broadcasts",
      results,
    };
    await writeFile(
      "../docs/evidence/mainnet-swap.json",
      JSON.stringify(
        evidence,
        (_, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify(evidence, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
    expect(results.every((entry) => entry.pass)).toBe(true);
  });
}

// Read-only verification. This script never accesses a signer or broadcasts.
import { readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
} from "viem";
const manifest = JSON.parse(
  await readFile(new URL("../../dist/imd-deployment.json", import.meta.url)),
);
const token = manifest.contracts.find((c) => c.name === "LaunchToken");
const abi = JSON.parse(
  await readFile(new URL(`../../dist/${token.abiPath}`, import.meta.url)),
);
const id = keccak256(
  encodeAbiParameters(
    parseAbiParameters(
      "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
    ),
    [manifest.poolKey],
  ),
);
const stateAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
]);
const results = [];
for (const url of manifest.network.rpcUrls) {
  const client = createPublicClient({
    transport: http(url, { timeout: 10000, retryCount: 0 }),
  });
  try {
    const chainId = await client.getChainId();
    const blockNumber = await client.getBlockNumber();
    const addresses = [
      token.address,
      ...Object.entries(manifest.network.uniswapV4)
        .filter(([k]) => k !== "extendedSwapParams")
        .map(([, v]) => v),
      manifest.poolKey.hooks,
    ];
    const code = await Promise.all(
      addresses.map(async (address) => {
        const bytes = await client.getCode({ address, blockNumber });
        return {
          address,
          codeBytes: (bytes?.length - 2) / 2,
          codeHash: bytes ? keccak256(bytes) : null,
        };
      }),
    );
    const [name, symbol, decimals, totalSupply, slot0, liquidity] =
      await Promise.all([
        ...["name", "symbol", "decimals", "totalSupply"].map((functionName) =>
          client.readContract({
            address: token.address,
            abi,
            functionName,
            blockNumber,
          }),
        ),
        client.readContract({
          address: manifest.network.uniswapV4.stateView,
          abi: stateAbi,
          functionName: "getSlot0",
          args: [id],
          blockNumber,
        }),
        client.readContract({
          address: manifest.network.uniswapV4.stateView,
          abi: stateAbi,
          functionName: "getLiquidity",
          args: [id],
          blockNumber,
        }),
      ]);
    results.push({
      url,
      chainId,
      blockNumber,
      code,
      name,
      symbol,
      decimals,
      totalSupply,
      poolId: id,
      slot0,
      liquidity,
      pass: chainId === manifest.chainId && code.every((x) => x.codeBytes > 0),
    });
  } catch (e) {
    results.push({ url, pass: false, error: e.message });
  }
}
const output = JSON.stringify(
  {
    checkedAt: new Date().toISOString(),
    mode: "read-only; no transactions broadcast",
    results,
  },
  (_, v) => (typeof v === "bigint" ? v.toString() : v),
  2,
);
await writeFile(
  new URL("../../docs/evidence/live-chain.json", import.meta.url),
  output + "\n",
);
console.log(output);
if (results.some((r) => !r.pass)) process.exitCode = 1;

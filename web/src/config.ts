import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  fallback,
  http,
  isAddress,
  keccak256,
  parseAbi,
  toBytes,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
  };
  walletAddChain?: Record<string, unknown>;
};
export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (...args: any[]) => void) => void;
  removeListener?: (event: string, fn: (...args: any[]) => void) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export const poolType =
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export const protocolAbi = {
  state: parseAbi([
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
    "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
  ]),
  quoter: parseAbi([
    `function quoteExactInputSingle((${poolType} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
  ]),
  router: parseAbi([
    "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
    "error ExecutionFailed(uint256 commandIndex,bytes message)",
    "error V4TooLittleReceived(uint256 minAmountOutReceived,uint256 amountReceived)",
    "error V4TooMuchRequested(uint256 maxAmountInRequested,uint256 amountRequested)",
    "error TransactionDeadlinePassed()",
  ]),
  permit2: parseAbi([
    "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
    "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  ]),
};
export function canonical(v: unknown): string {
  const sort = (x: any): any =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, sort(x[k])]),
          )
        : x;
  return JSON.stringify(sort(v));
}
export async function loadDeployment() {
  const response = await fetch(
    new URL("./imd-deployment.json", document.baseURI),
    { cache: "no-cache" },
  );
  if (!response.ok)
    throw new Error(
      "Deployment configuration could not be loaded. Reload to retry.",
    );
  const config: Deployment = await response.json();
  const c = config.contracts?.find((c) => c.name === "LaunchToken");
  if (
    config.version !== 1 ||
    !c ||
    !isAddress(c.address) ||
    config.network?.chainId !== config.chainId ||
    !config.network.rpcUrls.length ||
    !config.poolKey ||
    ![config.poolKey.currency0, config.poolKey.currency1].includes(c.address)
  )
    throw new Error(
      "Deployment configuration is invalid. Transactions are disabled.",
    );
  const abis = new Map<string, Abi>();
  for (const contract of config.contracts) {
    if (!/^abi\/[A-Za-z0-9_]+\.json$/.test(contract.abiPath))
      throw new Error("Invalid ABI path.");
    const res = await fetch(new URL(contract.abiPath, document.baseURI));
    if (!res.ok)
      throw new Error("Contract ABI is unavailable. Reload to retry.");
    const abi: Abi = await res.json();
    if (
      !Array.isArray(abi) ||
      keccak256(toBytes(canonical(abi))).slice(2) !== contract.abiHash
    )
      throw new Error(
        "Contract ABI verification failed. Transactions are disabled.",
      );
    abis.set(contract.name, abi);
  }
  const chain = defineChain({
    id: config.chainId,
    name: config.network.name,
    nativeCurrency: config.network.nativeCurrency,
    rpcUrls: { default: { http: config.network.rpcUrls } },
  });
  const client = createPublicClient({
    chain,
    transport: fallback(
      config.network.rpcUrls.map((url) =>
        http(url, { timeout: 7000, retryCount: 0 }),
      ),
    ),
    pollingInterval: 4000,
  });
  return {
    config,
    token: c.address,
    abi: abis.get("LaunchToken")!,
    client,
    wallet: (p: Provider) =>
      createWalletClient({ chain, transport: custom(p) }),
  };
}
export type Runtime = Awaited<ReturnType<typeof loadDeployment>>;

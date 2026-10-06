import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseAbiParameters,
  parseUnits,
  toHex,
  zeroAddress,
  type Address,
} from "viem";
import { poolType, protocolAbi, type Provider, type Runtime } from "./config";
export const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;
export function amount(value: string, decimals = 18, allowZero = false) {
  if (
    !new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(value) ||
    value.length > 100
  )
    throw new Error(`Enter an amount with at most ${decimals} decimal places.`);
  const n = parseUnits(value, decimals);
  if (n < 0n || (!allowZero && n === 0n) || n >= 2n ** 128n)
    throw new Error("Enter a positive amount below the pool limit.");
  return n;
}
export function display(n: bigint, decimals = 18) {
  return Number(formatUnits(n, decimals)).toLocaleString("en-US", {
    maximumSignificantDigits: 8,
  });
}
export function errorText(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  if (/reject|denied|4001/i.test(raw))
    return "Request rejected in your wallet. You can try again.";
  if (/insufficient funds/i.test(raw))
    return "Insufficient ETH for this action and network fees.";
  if (e instanceof BaseError) {
    const revert = e.walk(
      (x) => x instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    const name = revert?.data?.errorName;
    const known: Record<string, string> = {
      ERC20InsufficientBalance: "The sending account has insufficient NODEV.",
      ERC20InsufficientAllowance:
        "The owner must approve enough NODEV for this wallet.",
      ERC20InvalidReceiver: "Use a valid, nonzero recipient address.",
      ERC20InvalidSpender: "Use a valid, nonzero spender address.",
      V4TooLittleReceived:
        "The price moved beyond your minimum. Request a new quote.",
      TransactionDeadlinePassed:
        "The transaction deadline passed. Request a new quote.",
    };
    if (name)
      return (
        known[name] ??
        `Simulation reverted: ${name}. Check balances, allowances and pool liquidity before retrying.`
      );
    return e.shortMessage;
  }
  return raw.slice(0, 300);
}
export async function switchChain(provider: Provider, runtime: Runtime) {
  const chainId = toHex(runtime.config.chainId);
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (e: any) {
    if (
      !(
        e.code === 4902 ||
        e.cause?.code === 4902 ||
        /unknown chain|unrecognized chain|not added/i.test(e.message ?? "")
      ) ||
      !runtime.config.walletAddChain
    )
      throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [runtime.config.walletAddChain as any],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}
export async function assertWallet(
  r: Runtime,
  provider: Provider,
  account: Address,
) {
  const [chain, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  if (
    Number(chain) !== r.config.chainId ||
    accounts[0]?.toLowerCase() !== account.toLowerCase()
  )
    throw new Error(
      "Your wallet account or network changed. Reconnect and review the action.",
    );
}
export async function verifyChain(r: Runtime) {
  if ((await r.client.getChainId()) !== r.config.chainId)
    throw new Error(
      "RPC network verification failed. Transactions are disabled.",
    );
  const addresses = [
    ...r.config.contracts.map((c) => c.address),
    ...Object.entries(r.config.network.uniswapV4)
      .filter(([k]) => k !== "extendedSwapParams")
      .map(([, v]) => v as Address),
    r.config.poolKey.hooks,
  ].filter((a) => a !== zeroAddress);
  const codes = await Promise.all(
    addresses.map((address) => r.client.getCode({ address })),
  );
  if (codes.some((code) => !code || code === "0x"))
    throw new Error(
      "Deployed contract code could not be verified. Transactions are disabled.",
    );
}
export const poolId = (r: Runtime) =>
  keccak256(
    encodeAbiParameters(parseAbiParameters(poolType), [r.config.poolKey]),
  );
export async function readState(r: Runtime, account?: Address) {
  const read = (functionName: string, args: unknown[] = []) =>
    r.client.readContract({ address: r.token, abi: r.abi, functionName, args });
  const [
    name,
    symbol,
    decimals,
    supply,
    slot,
    liquidity,
    balance,
    nativeBalance,
    block,
  ] = await Promise.all([
    read("name"),
    read("symbol"),
    read("decimals"),
    read("totalSupply"),
    r.client.readContract({
      address: r.config.network.uniswapV4.stateView,
      abi: protocolAbi.state,
      functionName: "getSlot0",
      args: [poolId(r)],
    }),
    r.client.readContract({
      address: r.config.network.uniswapV4.stateView,
      abi: protocolAbi.state,
      functionName: "getLiquidity",
      args: [poolId(r)],
    }),
    account ? read("balanceOf", [account]) : 0n,
    account ? r.client.getBalance({ address: account }) : 0n,
    r.client.getBlockNumber(),
  ]);
  if (Number(decimals) !== 18 || symbol !== "NODEV")
    throw new Error(
      "The token metadata does not match this application. Transactions are disabled.",
    );
  if (slot[0] === 0n)
    throw new Error(
      "The attested pool is not initialized. Retry when it is available.",
    );
  const q192 = 2n ** 192n,
    squared = slot[0] * slot[0];
  const tokenIs1 =
    r.token.toLowerCase() === r.config.poolKey.currency1.toLowerCase();
  const price = tokenIs1
    ? (q192 * 10n ** 18n) / squared
    : (squared * 10n ** 18n) / q192;
  return {
    name: String(name),
    symbol: String(symbol),
    decimals: Number(decimals),
    supply: supply as bigint,
    balance: balance as bigint,
    nativeBalance,
    price,
    liquidity,
    block,
    lpFee: slot[3],
    timestamp: Date.now(),
  };
}
export type ChainState = Awaited<ReturnType<typeof readState>>;
export async function resolveAddress(r: Runtime, text: string) {
  const value = text.trim();
  const address = isAddress(value)
    ? getAddress(value)
    : value.endsWith(".eth")
      ? await r.client.getEnsAddress({ name: value })
      : null;
  if (!address || address === zeroAddress)
    throw new Error("Enter a valid nonzero address or a resolvable .eth name.");
  return address;
}
export function swapInput(r: Runtime, sell: boolean) {
  const input = sell
    ? r.token
    : r.config.poolKey.currency0.toLowerCase() === r.token.toLowerCase()
      ? r.config.poolKey.currency1
      : r.config.poolKey.currency0;
  return {
    input,
    output:
      input.toLowerCase() === r.config.poolKey.currency0.toLowerCase()
        ? r.config.poolKey.currency1
        : r.config.poolKey.currency0,
    zeroForOne:
      input.toLowerCase() === r.config.poolKey.currency0.toLowerCase(),
  };
}
export async function allowances(
  r: Runtime,
  account: Address,
  input: Address,
  n: bigint,
) {
  if (input === zeroAddress) return "swap" as const;
  const net = r.config.network.uniswapV4;
  const tokenAllowance = (await r.client.readContract({
    address: input,
    abi: r.abi,
    functionName: "allowance",
    args: [account, net.permit2],
  })) as bigint;
  if (tokenAllowance < n) return "token" as const;
  const [allowed, expiration] = await r.client.readContract({
    address: net.permit2,
    abi: protocolAbi.permit2,
    functionName: "allowance",
    args: [account, input, net.universalRouter],
  });
  return allowed < n || expiration < Math.floor(Date.now() / 1000) + 300
    ? ("permit" as const)
    : ("swap" as const);
}
export function encodeSwap(
  r: Runtime,
  sell: boolean,
  n: bigint,
  minimum: bigint,
) {
  const { input, output, zeroForOne } = swapInput(r, sell);
  const extra = r.config.network.uniswapV4.extendedSwapParams;
  const tuple = `(${poolType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extra ? "uint256 minHopPriceX36," : ""}bytes hookData)`;
  const params = [
    encodeAbiParameters(parseAbiParameters(tuple), [
      {
        poolKey: r.config.poolKey,
        zeroForOne,
        amountIn: n,
        amountOutMinimum: minimum,
        ...(extra ? { minHopPriceX36: 0n } : {}),
        hookData: "0x",
      },
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [input, n]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      output,
      minimum,
    ]),
  ];
  return {
    commands: "0x10" as const,
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
        "0x060c0f",
        params,
      ]),
    ],
    value: input === zeroAddress ? n : 0n,
  };
}

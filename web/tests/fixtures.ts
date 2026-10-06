import { type Page } from "@playwright/test";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  parseUnits,
  toHex,
  type Abi,
} from "viem";
import handoff from "../config/handoff.json" with { type: "json" };
import network from "../config/network.json" with { type: "json" };
import tokenAbi from "../../docs/abi/LaunchToken.json" with { type: "json" };
import { distributor, protocolAbi } from "../src/config";
export const account = "0x1111111111111111111111111111111111111111";
export const other = "0x2222222222222222222222222222222222222222";
const token = handoff.contracts[0].address.toLowerCase();
const addresses = network.network.uniswapV4;
export type FixtureOptions = {
  wallet?: boolean;
  wrongChain?: boolean;
  rejectConnect?: boolean;
  failRpc?: boolean;
  noCode?: boolean;
  noLiquidity?: boolean;
  revertSwap?: boolean;
  rejectSend?: boolean;
  receiptDelay?: number;
  quoteDelay?: number;
  failFirstRpc?: boolean;
  receiptUnavailable?: boolean;
  quoteRevert?: `0x${string}`;
  zeroQuote?: boolean;
};
export async function setup(page: Page, options: FixtureOptions = {}) {
  const state = {
    tokenAllowance: 0n,
    permitAllowance: 0n,
    permitExpiration: 0,
    distributorBalance: parseUnits("100000000", 18),
    sends: [] as any[],
    calls: [] as any[],
    receipts: 0,
    requests: [] as string[],
    options,
  };
  const hash = `0x${"ab".repeat(32)}`;
  if (options.wallet !== false)
    await page.addInitScript(
      ({ account, wrongChain, rejectConnect, rejectSend }) => {
        const listeners: Record<string, Function[]> = {};
        const w = window as any;
        w.walletCalls = [];
        w.mockAccount = account;
        w.mockChain = wrongChain ? "0x2" : "0x1";
        w.chainAdded = !wrongChain;
        w.emitWallet = (event: string, value: any) => {
          if (event === "accountsChanged") w.mockAccount = value[0];
          if (event === "chainChanged") w.mockChain = value;
          for (const fn of listeners[event] ?? []) fn(value);
        };
        w.ethereum = {
          on: (event: string, fn: Function) => {
            (listeners[event] ??= []).push(fn);
          },
          removeListener: (event: string, fn: Function) => {
            listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
          },
          request: async ({ method, params }: any) => {
            w.walletCalls.push({ method, params });
            if (method === "eth_requestAccounts" && rejectConnect)
              throw Object.assign(new Error("User rejected connection"), {
                code: 4001,
              });
            if (method === "eth_requestAccounts" || method === "eth_accounts")
              return w.mockAccount ? [w.mockAccount] : [];
            if (method === "eth_chainId") return w.mockChain;
            if (method === "wallet_switchEthereumChain") {
              if (!w.chainAdded)
                throw Object.assign(new Error("Unknown chain"), { code: 4902 });
              w.emitWallet("chainChanged", params[0].chainId);
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              w.chainAdded = true;
              return null;
            }
            if (method === "eth_sendTransaction") {
              if (rejectSend)
                throw Object.assign(new Error("User rejected request"), {
                  code: 4001,
                });
              return (
                await fetch("/mock-wallet", {
                  method: "POST",
                  body: JSON.stringify(params[0]),
                })
              ).json();
            }
            throw new Error(`Unhandled mock wallet method ${method}`);
          },
        };
      },
      {
        account,
        wrongChain: options.wrongChain,
        rejectConnect: options.rejectConnect,
        rejectSend: options.rejectSend,
      },
    );
  const abiFor = (to: string): Abi =>
    to.toLowerCase() === token
      ? (tokenAbi as Abi)
      : to.toLowerCase() === addresses.stateView
        ? protocolAbi.state
        : to.toLowerCase() === addresses.quoter
          ? protocolAbi.quoter
          : to.toLowerCase() === addresses.permit2
            ? protocolAbi.permit2
            : protocolAbi.router;
  await page.route("**/mock-wallet", async (route) => {
    const tx = route.request().postDataJSON();
    const decoded = decodeFunctionData({ abi: abiFor(tx.to), data: tx.data });
    state.sends.push({ ...tx, ...decoded });
    if (decoded.functionName === "approve") {
      if (tx.to.toLowerCase() === token)
        state.tokenAllowance = decoded.args![1] as bigint;
      else {
        state.permitAllowance = decoded.args![2] as bigint;
        state.permitExpiration = Number(decoded.args![3]);
      }
    }
    await route.fulfill({ json: hash });
  });
  async function rpc(body: any) {
    state.requests.push(body.method);
    const ok = (result: any) => ({ jsonrpc: "2.0", id: body.id, result });
    switch (body.method) {
      case "eth_chainId":
        return ok("0x1");
      case "eth_getCode":
        return ok(options.noCode ? "0x" : "0x6001600055");
      case "eth_blockNumber":
        return ok("0x100");
      case "eth_getBalance":
        return ok(toHex(parseUnits("10", 18)));
      case "eth_call": {
        const tx = body.params[0],
          abi = abiFor(tx.to),
          decoded = decodeFunctionData({ abi, data: tx.data });
        state.calls.push({ to: tx.to, value: tx.value, ...decoded });
        let result: any;
        switch (decoded.functionName) {
          case "name":
            result = "Dev Is A Robot";
            break;
          case "symbol":
            result = "NODEV";
            break;
          case "decimals":
            result = 18;
            break;
          case "totalSupply":
            result = parseUnits("1000000000", 18);
            break;
          case "balanceOf":
            result =
              String(decoded.args![0]).toLowerCase() === distributor
                ? state.distributorBalance
                : parseUnits("1000", 18);
            break;
          case "getSlot0":
            result = [2n ** 96n * 10000n, 184216, 0, 12500];
            break;
          case "getLiquidity":
            result = options.noLiquidity ? 0n : 10n ** 20n;
            break;
          case "allowance":
            result =
              tx.to.toLowerCase() === token
                ? state.tokenAllowance
                : [state.permitAllowance, state.permitExpiration, 0];
            break;
          case "quoteExactInputSingle":
            if (options.quoteRevert)
              return {
                jsonrpc: "2.0",
                id: body.id,
                error: {
                  code: 3,
                  message: "execution reverted",
                  data: options.quoteRevert,
                },
              };
            if (options.quoteDelay)
              await new Promise((resolve) =>
                setTimeout(resolve, options.quoteDelay),
              );
            result = [
              options.zeroQuote
                ? 0n
                : (decoded.args![0] as any).zeroForOne
                  ? parseUnits("100", 18)
                  : parseUnits("0.00000001", 18),
              160000n,
            ];
            break;
          case "execute":
            if (options.revertSwap)
              return {
                jsonrpc: "2.0",
                id: body.id,
                error: {
                  code: 3,
                  message: "execution reverted",
                  data: encodeErrorResult({
                    abi: protocolAbi.router,
                    errorName: "V4TooLittleReceived",
                    args: [100n, 0n],
                  }),
                },
              };
            result = undefined;
            break;
          case "approve":
            result = tx.to.toLowerCase() === token ? true : undefined;
            break;
          case "transfer":
          case "transferFrom":
            result = true;
            break;
          default:
            throw new Error(`Unhandled mock read ${decoded.functionName}`);
        }
        return ok(
          encodeFunctionResult({
            abi,
            functionName: decoded.functionName,
            result,
          }),
        );
      }
      case "eth_getTransactionReceipt": {
        state.receipts++;
        if (options.receiptUnavailable) return ok(null);
        if (options.receiptDelay && state.receipts === 1)
          await new Promise((resolve) =>
            setTimeout(resolve, options.receiptDelay),
          );
        return ok({
          transactionHash: hash,
          transactionIndex: "0x0",
          blockHash: `0x${"cd".repeat(32)}`,
          blockNumber: "0x100",
          from: account,
          to: addresses.universalRouter,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          contractAddress: null,
          logs: [],
          logsBloom: `0x${"00".repeat(256)}`,
          status: "0x1",
          effectiveGasPrice: "0x1",
          type: "0x2",
        });
      }
      case "eth_getTransactionByHash":
        return ok({
          hash,
          from: account,
          to: addresses.universalRouter,
          nonce: "0x0",
          gas: "0x5208",
          value: "0x0",
          input: "0x",
          blockNumber: null,
          blockHash: null,
          transactionIndex: null,
          type: "0x2",
          maxFeePerGas: "0x1",
          maxPriorityFeePerGas: "0x1",
          chainId: "0x1",
        });
      case "eth_getBlockByNumber":
        return ok({
          number: "0x100",
          hash: `0x${"cd".repeat(32)}`,
          parentHash: `0x${"ef".repeat(32)}`,
          timestamp: "0x123456",
          transactions: [],
          gasLimit: "0x1000000",
          gasUsed: "0x5208",
          size: "0x100",
          difficulty: "0x0",
          extraData: "0x",
          nonce: "0x0000000000000000",
          miner: account,
        });
      default:
        throw new Error(`Unhandled mock RPC ${body.method}`);
    }
  }
  for (const url of network.network.rpcUrls)
    await page.route(url, async (route) => {
      if (
        options.failRpc ||
        (options.failFirstRpc && url === network.network.rpcUrls[0])
      )
        return route.fulfill({ status: 503, body: "Offline fixture" });
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: Array.isArray(body)
          ? await Promise.all(body.map(rpc))
          : await rpc(body),
      });
    });
  return state;
}

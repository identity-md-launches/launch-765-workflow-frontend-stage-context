import { useEffect, useRef, useState, type ReactNode } from "react";
import { zeroAddress } from "viem";
import {
  allowances,
  amount,
  display,
  encodeSwap,
  quoteErrorText,
  swapInput,
} from "./chain";
import { protocolAbi } from "./config";
import type { ActionProps } from "./App";
type Quote = {
  n: bigint;
  out: bigint;
  minimum: bigint;
  expires: number;
  step: "token" | "permit" | "swap";
};
export function Swap({
  r,
  account,
  state,
  ready,
  busy,
  transact,
  connectControl,
}: ActionProps & { connectControl: ReactNode }) {
  const [sell, setSell] = useState(false),
    [value, setValue] = useState(""),
    [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<Quote>(),
    [quoting, setQuoting] = useState(false),
    [error, setError] = useState(""),
    [clock, setClock] = useState(Date.now());
  const [invalid, setInvalid] = useState("");
  const generation = useRef(0);
  const inputSymbol = sell ? "NODEV" : "ETH",
    outputSymbol = sell ? "ETH" : "NODEV";
  const inputCurrency = swapInput(r, sell).input;
  const supportedPair = [
    r.config.poolKey.currency0,
    r.config.poolKey.currency1,
  ].includes(zeroAddress);
  useEffect(() => {
    generation.current++;
    setQuote(undefined);
    setError("");
    setInvalid("");
  }, [value, slippage, sell, account, ready]);
  useEffect(() => {
    if (invalid && !quoting) document.getElementById(invalid)?.focus();
  }, [invalid, quoting]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = !!quote && clock >= quote.expires;
  async function getQuote() {
    if (!ready || !account || !state) return;
    setQuoting(true);
    setError("");
    setInvalid("");
    setQuote(undefined);
    const started = generation.current;
    let invalidField = "swap-amount";
    try {
      const n = amount(value);
      if (n > (sell ? state.balance : state.nativeBalance))
        throw new Error(
          `Insufficient ${inputSymbol} balance. Enter a smaller amount.`,
        );
      const basisPoints = Number(slippage) * 100;
      invalidField = "slippage";
      if (
        !Number.isInteger(basisPoints) ||
        basisPoints < 10 ||
        basisPoints > 500
      )
        throw new Error(
          "Choose slippage between 0.1% and 5%, with up to two decimal places.",
        );
      invalidField = "";
      const { result } = await r.client.simulateContract({
        account,
        address: r.config.network.uniswapV4.quoter,
        abi: protocolAbi.quoter,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: r.config.poolKey,
            zeroForOne: swapInput(r, sell).zeroForOne,
            exactAmount: n,
            hookData: "0x",
          },
        ],
      });
      const out = result[0],
        minimum = (out * BigInt(10000 - basisPoints)) / 10000n;
      if (minimum === 0n || minimum >= 2n ** 128n)
        throw new Error(
          "No usable quote for this amount. Check liquidity or change the amount.",
        );
      const step = await allowances(r, account, inputCurrency, n);
      if (generation.current === started)
        setQuote({ n, out, minimum, expires: Date.now() + 30000, step });
    } catch (e) {
      if (generation.current === started) {
        setError(quoteErrorText(e, sell));
        setInvalid(invalidField);
      }
    } finally {
      setQuoting(false);
    }
  }
  async function execute() {
    if (!quote || !account || expired) return;
    const q = quote,
      net = r.config.network.uniswapV4;
    const id =
      q.step === "swap"
        ? "swap"
        : q.step === "token"
          ? "approve-token"
          : "approve-permit";
    await transact(
      id,
      async () => {
        const step = await allowances(r, account, inputCurrency, q.n);
        if (step !== q.step)
          throw new Error(
            "Allowance changed. Request a new quote to review the next step.",
          );
        if (step === "token")
          return (
            await r.client.simulateContract({
              address: inputCurrency,
              abi: r.abi,
              functionName: "approve",
              args: [net.permit2, q.n],
              account,
            })
          ).request;
        if (step === "permit")
          return (
            await r.client.simulateContract({
              address: net.permit2,
              abi: protocolAbi.permit2,
              functionName: "approve",
              args: [
                inputCurrency,
                net.universalRouter,
                q.n,
                Math.floor(Date.now() / 1000) + 3600,
              ],
              account,
            })
          ).request;
        const encoded = encodeSwap(r, sell, q.n, q.minimum);
        return (
          await r.client.simulateContract({
            address: net.universalRouter,
            abi: protocolAbi.router,
            functionName: "execute",
            args: [
              encoded.commands,
              encoded.inputs,
              BigInt(Math.floor(q.expires / 1000) + 90),
            ],
            value: encoded.value,
            account,
          })
        ).request;
      },
      () => {
        if (Date.now() >= q.expires)
          throw new Error(
            "Quote expired during simulation. Request a new quote.",
          );
      },
    );
    setQuote(undefined);
  }
  const action =
    quote?.step === "token"
      ? "Approve NODEV to Permit2"
      : quote?.step === "permit"
        ? "Approve router in Permit2"
        : `Swap ${inputSymbol} for ${outputSymbol}`;
  return (
    <section className="panel swap" aria-labelledby="swap-title">
      <div className="panel-title">
        <h2 id="swap-title">Trade with the machines</h2>
        <span aria-hidden="true">↗</span>
      </div>
      <p className="caption">
        UNISWAP V4 / {r.config.network.name.toUpperCase()}
      </p>
      <fieldset disabled={!!busy || quoting}>
        <legend className="sr-only">Swap direction</legend>
        <div className="segmented">
          <button aria-pressed={!sell} onClick={() => setSell(false)}>
            Buy NODEV
          </button>
          <button aria-pressed={sell} onClick={() => setSell(true)}>
            Sell NODEV
          </button>
        </div>
        <div className="amount-field">
          <label htmlFor="swap-amount">
            You pay <span>{inputSymbol}</span>
          </label>
          <input
            id="swap-amount"
            name="swap-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={invalid === "swap-amount"}
            aria-describedby="swap-error swap-balance"
          />
          <small id="swap-balance">
            Balance:{" "}
            {account && state
              ? display(sell ? state.balance : state.nativeBalance)
              : "—"}{" "}
            {inputSymbol}
          </small>
        </div>
        <div className="swap-arrow" aria-hidden="true">
          ↓
        </div>
        <div className="receive">
          <span>
            You receive <b>{outputSymbol}</b>
          </span>
          <strong>{quote ? display(quote.out) : "—"}</strong>
          <small>
            {quote
              ? "Estimated from a simulated pool quote"
              : "Request a quote to see your output"}
          </small>
        </div>
        <div className="slippage">
          <label htmlFor="slippage">Slippage tolerance</label>
          <div>
            <input
              id="slippage"
              aria-invalid={invalid === "slippage"}
              aria-describedby="swap-error"
              name="slippage"
              type="number"
              min="0.1"
              max="5"
              step="0.1"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
            <span>%</span>
          </div>
        </div>
      </fieldset>
      <p className="caption swap-note">
        USD context unavailable. Network fees are paid in ETH.
      </p>
      {quote && (
        <div className="quote-details">
          <p>
            Rate: 1 {inputSymbol} ≈{" "}
            {display((quote.out * 10n ** 18n) / quote.n)} {outputSymbol}
          </p>
          <p>
            Minimum received:{" "}
            <strong>
              {display(quote.minimum)} {outputSymbol}
            </strong>
          </p>
          <p className={expired ? "warning" : "muted"}>
            {expired
              ? "Quote expired. Request a fresh quote."
              : `Quote expires in ${Math.max(0, Math.ceil((quote.expires - clock) / 1000))}s.`}
          </p>
          {quote.step !== "swap" && (
            <p>
              {quote.step === "token"
                ? `Step 1 of 3: allow Permit2 to spend exactly ${display(quote.n)} NODEV.`
                : `Step 2 of 3: allow the configured router to spend ${display(quote.n)} NODEV through Permit2 for one hour.`}{" "}
              This approval does not swap your tokens. Request a fresh quote
              after confirmation.
            </p>
          )}
          {quote.step === "swap" && (
            <p>
              Send {display(quote.n)} {inputSymbol}; receive at least{" "}
              {display(quote.minimum)} {outputSymbol}. A network fee also
              applies.
            </p>
          )}
        </div>
      )}
      <p id="swap-error" className="error" role="alert">
        {error}
      </p>
      {!supportedPair && (
        <p className="warning">
          This release supports the attested ETH pair only.
        </p>
      )}
      {connectControl ? (
        <div className="full-action">{connectControl}</div>
      ) : quote && !expired ? (
        <button
          className="primary full"
          disabled={!ready || !!busy || !supportedPair}
          onClick={execute}
        >
          {busy.startsWith("approve") || busy === "swap"
            ? "Waiting for confirmation…"
            : action}
        </button>
      ) : (
        <button
          className="primary full"
          disabled={!ready || !!busy || quoting || !supportedPair}
          onClick={getQuote}
        >
          {quoting ? "Simulating quote…" : "Get quote →"}
        </button>
      )}
      {!connectControl && !ready && (
        <p className="caption">Waiting for verified live contract state.</p>
      )}
      <p className="swap-footnote">
        Quotes use the launch pool. Every transaction is simulated before your
        wallet opens.
      </p>
    </section>
  );
}

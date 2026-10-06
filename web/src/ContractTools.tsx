import { useEffect, useRef, useState } from "react";
import { formatUnits, type Address } from "viem";
import { amount, display, errorText, resolveAddress } from "./chain";
import type { ActionProps } from "./App";
type Review = {
  args: unknown[];
  description: string;
  balance: bigint;
  allowance?: bigint;
  destination: Address;
};
export function ContractTools({
  r,
  account,
  ready,
  busy,
  transact,
}: ActionProps) {
  const [mode, setMode] = useState("transfer"),
    [to, setTo] = useState(""),
    [from, setFrom] = useState(""),
    [value, setValue] = useState("");
  const [review, setReview] = useState<Review>(),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const [invalid, setInvalid] = useState("");
  useEffect(() => {
    generation.current++;
    setReview(undefined);
    setError("");
    setInvalid("");
  }, [mode, to, from, value, account, ready]);
  useEffect(() => {
    if (invalid && !checking) document.getElementById(invalid)?.focus();
  }, [invalid, checking]);
  async function inspect() {
    if (!account || !ready) return;
    setChecking(true);
    setError("");
    setReview(undefined);
    const started = generation.current;
    let invalidField = "tool-to";
    try {
      const destination = await resolveAddress(r, to);
      invalidField = "tool-amount";
      const n = amount(value, 18, mode === "approve");
      invalidField = "tool-from";
      const owner =
        mode === "transferFrom" ? await resolveAddress(r, from) : account;
      invalidField = "tool-amount";
      const balance = (await r.client.readContract({
        address: r.token,
        abi: r.abi,
        functionName: "balanceOf",
        args: [owner],
      })) as bigint;
      const allowed =
        mode !== "transfer"
          ? ((await r.client.readContract({
              address: r.token,
              abi: r.abi,
              functionName: "allowance",
              args: [owner, mode === "approve" ? destination : account],
            })) as bigint)
          : undefined;
      if (mode !== "approve" && n > balance)
        throw new Error(
          "The sending account has insufficient NODEV. Enter a smaller amount.",
        );
      if (mode === "transferFrom" && allowed! < n)
        throw new Error(
          "The owner must approve enough NODEV for your connected wallet first.",
        );
      if (generation.current !== started) return;
      setReview({
        args:
          mode === "transferFrom" ? [owner, destination, n] : [destination, n],
        balance,
        allowance: allowed,
        destination,
        description:
          mode === "approve"
            ? n === 0n
              ? "Revoke this spender’s NODEV allowance."
              : `Set this spender’s allowance to ${formatUnits(n, 18)} NODEV. They can transfer those tokens without another signature.`
            : `Transfer ${formatUnits(n, 18)} NODEV ${mode === "transferFrom" ? `from ${owner}` : "from your wallet"} to the recipient below.`,
      });
    } catch (e) {
      if (generation.current === started) {
        setError(errorText(e));
        setInvalid(invalidField);
      }
    } finally {
      setChecking(false);
    }
  }
  async function send() {
    if (!review || !account) return;
    await transact(
      `tool-${mode}`,
      async () =>
        (
          await r.client.simulateContract({
            address: r.token,
            abi: r.abi,
            functionName: mode,
            args: review.args,
            account,
          })
        ).request,
    );
    setReview(undefined);
  }
  return (
    <details className="tools panel">
      <summary>
        ERC-20 contract tools <span>Transfer · approve · transferFrom</span>
      </summary>
      <div className="tool-content">
        <h2>Use the token directly</h2>
        <p className="muted">
          Transfer NODEV, manage an allowance, or spend an allowance granted to
          your wallet. Amounts are in NODEV; network fees are in ETH.
        </p>
        <fieldset disabled={!!busy || checking}>
          <div className="tool-grid">
            <div>
              <label htmlFor="tool-action">Action</label>
              <select
                id="tool-action"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="transfer">Transfer NODEV</option>
                <option value="approve">Approve / revoke spender</option>
                <option value="transferFrom">
                  Transfer from an approved owner
                </option>
              </select>
            </div>
            {mode === "transferFrom" && (
              <label htmlFor="tool-from">
                Owner address or .eth name
                <input
                  id="tool-from"
                  aria-invalid={invalid === "tool-from"}
                  aria-describedby="tool-error"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x… or name.eth"
                />
              </label>
            )}
            <label htmlFor="tool-to">
              {mode === "approve" ? "Spender" : "Recipient"} address or .eth
              name
              <input
                id="tool-to"
                aria-invalid={invalid === "tool-to"}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="0x… or name.eth"
                aria-describedby="tool-error"
              />
            </label>
            <label htmlFor="tool-amount">
              Amount (NODEV)
              {mode === "approve" && (
                <span className="caption"> — 0 revokes</span>
              )}
              <input
                id="tool-amount"
                aria-invalid={invalid === "tool-amount"}
                aria-describedby="tool-error"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
        </fieldset>
        <p id="tool-error" className="error" role="alert">
          {error}
        </p>
        {review && (
          <div className="review">
            <p>{review.description}</p>
            <p className="address-text">{review.destination}</p>
            <p>
              Owner balance: {display(review.balance)} NODEV
              {review.allowance !== undefined &&
                ` · Current allowance: ${display(review.allowance)} NODEV`}
            </p>
            <p className="caption">
              USD context unavailable. Review the destination in your wallet.
            </p>
          </div>
        )}
        <button
          disabled={!ready || !!busy || checking}
          onClick={review ? send : inspect}
        >
          {busy === `tool-${mode}`
            ? "Waiting for confirmation…"
            : checking
              ? "Reading contract state…"
              : review
                ? mode === "approve"
                  ? "Confirm allowance"
                  : "Confirm transfer"
                : "Review action"}
        </button>
        {!ready && (
          <p className="caption">
            Connect on the configured network and wait for verified reads to use
            these tools.
          </p>
        )}
      </div>
    </details>
  );
}

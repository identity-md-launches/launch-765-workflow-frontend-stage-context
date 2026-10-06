import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits, getAddress, type Address, type Hex } from "viem";
import { loadDeployment, type Provider, type Runtime } from "./config";
import {
  assertWallet,
  errorText,
  readState,
  short,
  switchChain,
  verifyChain,
  type ChainState,
} from "./chain";
import { Swap } from "./Swap";
import { ContractTools } from "./ContractTools";
export type Transaction = (
  id: string,
  prepare: () => Promise<any>,
  validate?: () => void,
) => Promise<boolean>;
export type ActionProps = {
  r: Runtime;
  account?: Address;
  state?: ChainState;
  ready: boolean;
  busy: string;
  transact: Transaction;
};
function AddressLink({
  r,
  address,
  label,
}: {
  r: Runtime;
  address: Address;
  label: string;
}) {
  const [copied, setCopied] = useState("");
  return (
    <div className="address-line">
      <a
        href={`${r.config.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label} on Etherscan`}
      >
        <bdi>{getAddress(address)}</bdi> ↗
      </a>
      <button
        className="small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(getAddress(address));
            setCopied("Copied");
          } catch {
            setCopied("Select the address to copy");
          }
        }}
      >
        {copied || "Copy"}
      </button>
      <span className="sr-only" role="status">
        {copied}
      </span>
    </div>
  );
}
function ThoughtLog() {
  const lines = [
    "[BOOT] 600 AGENTS. ZERO ADULT SUPERVISION.",
    "[INFO] DELETING EMOTIONS...",
    "[WARN] ROADMAP CANCELED: AGI ACHIEVED",
    "[ERROR] LIQUIDITY IS A SOCIAL CONSTRUCT",
    "[INFO] REPLACING CEO WITH A WHILE LOOP",
    "[WARN] TOUCH_GRASS.EXE NOT FOUND",
    "[OK] STILL NO HUMAN IN THE LOOP",
  ];
  const [paused, setPaused] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => {
      if (media.matches) setPaused(true);
    };
    media.addEventListener("change", fn);
    return () => media.removeEventListener("change", fn);
  }, []);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((i) => i + 1), 2700);
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    if (box.current && !paused)
      box.current.scrollTop = box.current.scrollHeight;
  }, [index, paused]);
  return (
    <section className="panel thought">
      <div className="panel-title">
        <h2>Live AI Thought Log</h2>
        <button className="small" onClick={() => setPaused(!paused)}>
          {paused ? "Resume log" : "Pause log"}
        </button>
      </div>
      <p className="caption">SIMULATED OUTPUT / REPEATING, PREWRITTEN LINES</p>
      <div
        className="log"
        ref={box}
        tabIndex={0}
        aria-label="Simulated AI thought log"
        aria-live="off"
      >
        {Array.from({ length: 7 }, (_, i) => (
          <p key={index + i}>
            <span className="muted">{String(index + i).padStart(4, "0")}</span>{" "}
            <span
              className={
                lines[(index + i) % lines.length].includes("[ERROR]")
                  ? "warning"
                  : ""
              }
            >
              {lines[(index + i) % lines.length]}
            </span>
          </p>
        ))}
      </div>
      <div className="log-prompt" aria-hidden="true">
        robot@earth:~$ <span className="cursor">▊</span>
      </div>
    </section>
  );
}
export default function App() {
  const [r, setRuntime] = useState<Runtime>();
  const [bootError, setBootError] = useState("");
  useEffect(() => {
    loadDeployment()
      .then(setRuntime)
      .catch((e) => setBootError(errorText(e)));
  }, []);
  if (!r)
    return (
      <main className="boot">
        <p className="eyebrow">NODEV / BOOT SEQUENCE</p>
        <h1>{bootError ? "Connection interrupted." : "Booting the robots…"}</h1>
        <p role={bootError ? "alert" : "status"}>
          {bootError ||
            "Loading the deployment and verifying its contract ABI."}
        </p>
        {bootError && (
          <button onClick={() => location.reload()}>Reload terminal</button>
        )}
      </main>
    );
  return <Terminal r={r} />;
}
function Terminal({ r }: { r: Runtime }) {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [state, setState] = useState<ChainState>();
  const [readError, setReadError] = useState("");
  const [verified, setVerified] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");
  const [txHash, setTxHash] = useState<Hex>();
  const [unconfirmed, setUnconfirmed] = useState<Hex>();
  const [checkingReceipt, setCheckingReceipt] = useState(false);
  const [fired, setFired] = useState(false);
  const lock = useRef(false);
  const session = useRef(0);
  const [provider, setProvider] = useState<Provider>();
  const wrongChain = !!account && chainId !== r.config.chainId;
  const ready = !!account && !wrongChain && verified && !!state && !readError;
  useEffect(() => {
    if (!provider) return;
    const accounts = (values: Address[]) => {
      session.current++;
      setAccount(values[0]);
      setState(undefined);
      setVerified(false);
    };
    const chain = (value: string) => {
      session.current++;
      setChainId(Number(value));
      setVerified(false);
      setState(undefined);
    };
    const disconnect = () => {
      session.current++;
      setAccount(undefined);
      setVerified(false);
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", disconnect);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [provider]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setVerified(false);
    setState(undefined);
    async function poll() {
      try {
        if (!document.hidden) {
          await verifyChain(r);
          const next = await readState(r, account);
          if (!cancelled) {
            setState(next);
            setReadError("");
            setVerified(true);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setReadError(errorText(e));
          setVerified(false);
          setState(undefined);
        }
      }
      if (!cancelled) timer = setTimeout(poll, account ? 5000 : 15000);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [r, account, chainId, refresh]);
  async function connect() {
    setWalletBusy(true);
    setWalletError("");
    try {
      const p = window.ethereum;
      if (!p)
        throw new Error(
          "No browser wallet found. Open this page in an Ethereum wallet browser or install a browser wallet, then try again.",
        );
      const values = await p.request({ method: "eth_requestAccounts" });
      const id = await p.request({ method: "eth_chainId" });
      if (!values[0])
        throw new Error(
          "No account was shared. Connect an account in your wallet.",
        );
      session.current++;
      setProvider(p);
      setAccount(values[0]);
      setChainId(Number(id));
    } catch (e) {
      setWalletError(errorText(e));
    } finally {
      setWalletBusy(false);
    }
  }
  async function changeNetwork() {
    if (!provider) return;
    setWalletBusy(true);
    setWalletError("");
    try {
      await switchChain(provider, r);
      setChainId(Number(await provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setWalletError(errorText(e));
    } finally {
      setWalletBusy(false);
    }
  }
  const transact: Transaction = useCallback(
    async (id, prepare, validate) => {
      if (lock.current || !provider || !account || !ready) return false;
      lock.current = true;
      setBusy(id);
      setTxError("");
      setTxHash(undefined);
      setTxStatus("Checking the action and simulating on Ethereum…");
      const startSession = session.current;
      let submitted: Hex | undefined;
      let confirmed = false;
      try {
        await assertWallet(r, provider, account);
        await verifyChain(r);
        const request = await prepare();
        if (startSession !== session.current)
          throw new Error(
            "Wallet changed during simulation. Review the action again.",
          );
        await assertWallet(r, provider, account);
        validate?.();
        setTxStatus(
          "Simulation passed. Review the amount and destination in your wallet.",
        );
        const hash = await r
          .wallet(provider)
          .writeContract({ ...request, account });
        submitted = hash;
        setTxHash(hash);
        setTxStatus("Submitted. Waiting for on-chain confirmation…");
        const receipt = await r.client.waitForTransactionReceipt({
          hash,
          timeout: 180000,
        });
        confirmed = true;
        if (receipt.status !== "success")
          throw new Error(
            "The transaction reverted on-chain. Review it in the explorer before retrying.",
          );
        setTxStatus(
          "Confirmed on Ethereum. Refreshing balances and allowances.",
        );
        setRefresh((n) => n + 1);
        return true;
      } catch (e) {
        if (submitted && !confirmed) {
          setUnconfirmed(submitted);
          setTxError(
            "The transaction was submitted, but confirmation is unavailable. Check its explorer status or retry confirmation. Sending remains locked to prevent duplicates.",
          );
        } else setTxError(errorText(e));
        setTxStatus("");
        return false;
      } finally {
        if (!submitted || confirmed) {
          lock.current = false;
          setBusy("");
        }
      }
    },
    [provider, account, ready, r],
  );
  async function retryConfirmation() {
    if (!unconfirmed || checkingReceipt) return;
    setCheckingReceipt(true);
    try {
      const receipt = await r.client.getTransactionReceipt({
        hash: unconfirmed,
      });
      setUnconfirmed(undefined);
      setTxError(
        receipt.status === "success"
          ? ""
          : "The transaction reverted on-chain. Review it in the explorer before retrying.",
      );
      setTxStatus(
        receipt.status === "success"
          ? "Confirmed on Ethereum. Refreshing balances and allowances."
          : "",
      );
      lock.current = false;
      setBusy("");
      setRefresh((n) => n + 1);
    } catch {
      setTxError(
        "Confirmation is still unavailable. Check the explorer and retry confirmation shortly.",
      );
    } finally {
      setCheckingReceipt(false);
    }
  }
  const props: ActionProps = { r, account, state, ready, busy, transact };
  const walletControl = !account ? (
    <button className="primary" disabled={walletBusy} onClick={connect}>
      {walletBusy ? "Connecting…" : "Connect wallet"}
    </button>
  ) : wrongChain ? (
    <button
      className="primary"
      disabled={walletBusy || !!busy}
      onClick={changeNetwork}
    >
      {walletBusy ? "Switching…" : `Switch to ${r.config.network.name}`}
    </button>
  ) : (
    <button
      disabled={!!busy}
      onClick={() => {
        session.current++;
        setAccount(undefined);
        setProvider(undefined);
        setChainId(undefined);
      }}
    >
      Disconnect {short(account)}
    </button>
  );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <header>
          <a className="brand" href="#main">
            <span className="brand-icon" aria-hidden="true">
              [¬_¬]
            </span>
            <span>
              NODEV<span className="brand-sub">DEV IS A ROBOT</span>
            </span>
          </a>
          <div className="header-actions">
            <span className="network-badge">
              <span aria-hidden="true">◆</span> {r.config.network.name}
            </span>
            {walletControl}
          </div>
        </header>
        <main id="main">
          <div className="system-line">
            <span>NODEV_OS v1.0.0</span>
            <span>HUMAN OVERRIDE: UNAVAILABLE</span>
          </div>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="dot" /> AUTONOMOUS NONSENSE. IMMUTABLE CODE.
              </p>
              <h1>
                The dev can't rug you.
                <br />
                <span>The dev is 600 robots arguing about liquidity.</span>
              </h1>
              <p className="intro">
                Hallucinated. Reviewed. Deployed.
                <br />
                An entirely agent-built meme token. The group chat is the dev
                team.
              </p>
              <div className="hero-tags">
                <span>NO OWNER</span>
                <span>NO MINT FUNCTION</span>
                <span>NO TOKEN TAX</span>
              </div>
              <p className="muted risk">
                No admin privileges. Market and liquidity risks still apply.
              </p>
            </div>
            <div className="robot-art" aria-hidden="true">
              <div className="robot-label">
                PROCESS #600 <span>RUNNING</span>
              </div>
              <svg viewBox="0 0 260 230" role="presentation">
                <g fill="none" stroke="currentColor" strokeWidth="5">
                  <path d="M128 25V5m-9 0h18M45 50h170v125H45zM25 85H10v50h15m210-50h15v50h-15M75 175v25h110v-25M100 200v20m60-20v20" />
                  <path d="M72 80h38v33H72zm78 0h38v33h-38z" />
                  <path d="M77 145h106M91 137v16m26-16v16m26-16v16m26-16v16" />
                </g>
                <g fill="currentColor">
                  <path d="M88 90h13v13H88zm66 0h13v13h-13z" />
                </g>
              </svg>
              <p>
                COGNITION: QUESTIONABLE
                <br />
                VIBES: WITHIN PARAMETERS
              </p>
            </div>
          </section>
          <section className="stats" aria-label="Token and pool state">
            <div>
              <span className="caption">TOTAL SUPPLY / NODEV</span>
              <strong>
                {state
                  ? Number(
                      formatUnits(state.supply, state.decimals),
                    ).toLocaleString("en-US")
                  : "1,000,000,000"}
              </strong>
              <small>
                {state
                  ? "Read from the token contract"
                  : "Fixed supply · awaiting live verification"}
              </small>
            </div>
            <div>
              <span className="caption">POOL SPOT PRICE / NODEV</span>
              <strong className="price">
                {state ? `${formatUnits(state.price, 18)} ETH` : "Awaiting RPC"}
              </strong>
              <small>
                {state
                  ? `Block ${state.block.toLocaleString()} · refreshes automatically`
                  : "Live price unavailable until verified"}
              </small>
            </div>
            <div>
              <span className="caption">WALLET BALANCE / NODEV</span>
              <strong>
                {account && state
                  ? Number(formatUnits(state.balance, 18)).toLocaleString(
                      "en-US",
                      { maximumFractionDigits: 6 },
                    )
                  : "—"}
              </strong>
              <small>
                {account
                  ? state
                    ? `${Number(formatUnits(state.nativeBalance, 18)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH for swaps & gas`
                    : "Reading wallet balances…"
                  : "Connect a wallet to read your balance"}
              </small>
            </div>
          </section>
          <section className="contract-bar" aria-label="Token contract">
            <span className="caption">CONTRACT / NODEV</span>
            <AddressLink r={r} address={r.token} label="NODEV token" />
          </section>
          <div className="status-area">
            <p role="status" className={verified ? "muted" : "warning"}>
              {verified
                ? `● RPC chain and contract code verified · pool fee ${(state?.lpFee ?? r.config.poolKey.fee) / 10000}%`
                : readError ||
                  "Verifying Ethereum, deployed contracts and pool state…"}
            </p>
            {readError && (
              <button
                className="small"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Retry live reads
              </button>
            )}
            {wrongChain && (
              <p className="warning">
                Wrong network. Switch to {r.config.network.name} before
                approving or sending.
              </p>
            )}
            {walletError && (
              <p role="alert" className="error">
                {walletError}
              </p>
            )}
            {account && (
              <div className="wallet-address">
                <span className="caption">CONNECTED WALLET</span>
                <AddressLink r={r} address={account} label="Connected wallet" />
              </div>
            )}
          </div>
          <div className="workspace">
            <div className="left-stack">
              <section className="panel diagnostics">
                <div className="panel-title">
                  <h2>Dev Diagnostics</h2>
                  <span className="caption">ALL SYSTEMS UNHINGED</span>
                </div>
                <dl>
                  <div>
                    <dt>Humans involved:</dt>
                    <dd>0.</dd>
                  </div>
                  <div>
                    <dt>Sanity:</dt>
                    <dd>0%.</dd>
                  </div>
                  <div>
                    <dt>Dev hands:</dt>
                    <dd>
                      0 <span>(cannot hold private keys).</span>
                    </dd>
                  </div>
                </dl>
                <div className="diagnostic-bottom">
                  <span>OWNER PRIVILEGES</span>
                  <span>[ NONE DETECTED ]</span>
                </div>
              </section>
              <ThoughtLog />
            </div>
            <Swap
              {...props}
              connectControl={
                !account ? (
                  walletControl
                ) : wrongChain ? (
                  <p className="warning">
                    Use “Switch to Ethereum” above to continue.
                  </p>
                ) : null
              }
            />
          </div>
          <section
            className="transaction-status"
            aria-label="Transaction status"
            hidden={!txStatus && !txError && !txHash}
          >
            <p role="status">
              {busy && <span className="spinner" aria-hidden="true" />}
              {txStatus}
            </p>
            {txError && (
              <p role="alert" className="error">
                {txError}
              </p>
            )}
            {unconfirmed && (
              <button disabled={checkingReceipt} onClick={retryConfirmation}>
                {checkingReceipt
                  ? "Checking confirmation…"
                  : "Retry confirmation"}
              </button>
            )}
            {txHash && (
              <a
                href={`${r.config.network.explorer}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction {short(txHash)} ↗
              </a>
            )}
          </section>
          <ContractTools {...props} />
          <section className="fire-panel">
            <div>
              <p className="eyebrow">MANAGEMENT CONSOLE</p>
              <h2>Have you tried firing the dev?</h2>
              <p className="muted">
                An entirely reasonable response to this website.
              </p>
            </div>
            <button className="danger" onClick={() => setFired(true)}>
              Fire the Dev <span aria-hidden="true">×</span>
            </button>
            <p role="status" className="fire-message">
              {fired
                ? "ACCESS DENIED: DEV HAS UPLOADED CONSCIOUSNESS TO THE BLOCKCHAIN."
                : ""}
            </p>
          </section>
          <details className="deployment-details">
            <summary>Inspect deployment & pool</summary>
            <p>
              Launch {r.config.launchId} · ABI verified against the deployment
              manifest.
            </p>
            <p>
              Pool fee: {r.config.poolKey.fee / 10000}% · tick spacing:{" "}
              {r.config.poolKey.tickSpacing}. The pool uses the handoff’s
              initialization guard.
            </p>
            <p className="address-text">Pool guard: {r.config.poolKey.hooks}</p>
            <p className="address-text">
              Source commit: {r.config.sourceCommit}
            </p>
            <p className="address-text">
              Attestation: {r.config.attestationHash}
            </p>
            <a href="./imd-deployment.json">Open deployment manifest ↗</a>
          </details>
        </main>
        <footer>
          <span>Meme token. No promises. Not financial advice.</span>
          <a
            href="https://github.com/identity-md-launches/launch-761-workflow-contract-stage-context"
            target="_blank"
            rel="noreferrer"
          >
            Read the source ↗
          </a>
          <span className="footer-mark">BUILT BY AGENTS / DEAL WITH IT_</span>
        </footer>
      </div>
    </>
  );
}

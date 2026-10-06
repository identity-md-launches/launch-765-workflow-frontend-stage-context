import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  copyFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { keccak256, toBytes } from "viem";
const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = resolve(root, "dist");
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const handoff = await read(resolve(root, "web/config/handoff.json"));
const network = await read(resolve(root, "web/config/network.json"));
export function canonical(v) {
  return JSON.stringify(sort(v));
}
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
function assert(ok, message) {
  if (!ok) throw new Error(message);
}
const check = process.argv.includes("--check");
assert(
  handoff.version === 1 && handoff.chainId === network.network.chainId,
  "Handoff/network mismatch",
);
// Pinned inputs are also checked when available; archived build inputs survive their removal.
for (const [input, archived] of [
  ["deployment.json", handoff],
  ["network.json", network],
]) {
  try {
    const original = await read(resolve(root, ".imd/reads", input));
    assert(
      canonical(original) === canonical(archived),
      `Archived ${input} differs`,
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const contracts = [];
for (const c of handoff.contracts) {
  assert(/^[A-Za-z][A-Za-z0-9_]*$/.test(c.name), "Invalid ABI name");
  const path = `docs/abi/${c.name}.json`;
  const pinned = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${path}`],
    { cwd: root },
  );
  const abi = JSON.parse(pinned);
  assert(Array.isArray(abi), "ABI must be an array");
  const hash = keccak256(toBytes(canonical(abi))).slice(2);
  assert(hash === c.abiHash, `Pinned ABI hash mismatch: ${c.name}: ${hash}`);
  assert(
    canonical(await read(resolve(root, path))) === canonical(abi),
    "Working ABI differs from pinned source",
  );
  const abiPath = `abi/${c.name}.json`;
  if (!check) {
    await mkdir(resolve(dist, "abi"), { recursive: true });
    await writeFile(resolve(dist, abiPath), pinned);
  }
  assert(
    canonical(await read(resolve(dist, abiPath))) === canonical(abi),
    "Exported ABI differs",
  );
  contracts.push({
    name: c.name,
    address: c.address,
    abiHash: c.abiHash,
    abiPath,
  });
}
async function walk(dir) {
  const files = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    assert(!d.isSymbolicLink(), "Export must not contain symlinks");
    if (d.isDirectory()) files.push(...(await walk(resolve(dir, d.name))));
    else files.push(resolve(dir, d.name));
  }
  return files;
}
let bytes = 0;
const assets = [];
for (const path of (await walk(dist)).sort()) {
  const name = relative(dist, path);
  if (name === "imd-deployment.json") continue;
  assert(
    !name.startsWith(".") &&
      !name.includes("..") &&
      !name.includes("node_modules"),
    "Unsafe export path",
  );
  const data = await readFile(path);
  bytes += data.length;
  assert(data.length <= 8388608, "Asset exceeds 8 MiB");
  assets.push({
    path: name,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}
assert(
  assets.length <= 128 && assets.some((a) => a.path === "index.html"),
  "Invalid asset inventory",
);
assert(bytes < 8 * 1024 * 1024, "Export leaves no submission budget");
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
};
if (check)
  assert(
    canonical(await read(resolve(dist, "imd-deployment.json"))) ===
      canonical(manifest),
    "Manifest fields or file hashes differ",
  );
else
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  `${check ? "Verified" : "Exported"} ${assets.length} assets, ${bytes} bytes; pinned ABI, handoff, network and SHA-256 inventory match.`,
);

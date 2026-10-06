// A plain-file server used to verify hosting under a gateway-like subpath.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const base = new URL("../../dist/", import.meta.url);
const prefix = "/ipfs/test-cid/";
const types = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
};
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith(prefix)) throw new Error("Not found");
    const name = path.slice(prefix.length) || "index.html";
    if (name.includes("..") || name.startsWith("/"))
      throw new Error("Invalid path");
    const bytes = await readFile(new URL(name, base));
    res.writeHead(200, {
      "Content-Type":
        types[name.split(".").pop()] ?? "application/octet-stream",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4174, "127.0.0.1", () =>
  console.log("Static subpath: http://127.0.0.1:4174/ipfs/test-cid/"),
);

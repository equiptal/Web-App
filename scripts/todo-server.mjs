#!/usr/bin/env node
// The to-do board. Start it, tick and type in the browser, everything saves to docs/todo.json
// (and mirrors into docs/TODO.md) the moment you change it.
//
//   node scripts/todo-server.mjs          starts on 8099 and opens the browser
//   node scripts/todo-server.mjs 8123     another port
//   node scripts/todo-server.mjs --lan    also reachable from the phone on the same Wi-Fi
//
// Without --lan it listens on 127.0.0.1 only, so nothing outside this machine can reach it.
// With --lan it listens on every interface: the board has NO password, so use it on a network
// you trust and stop the server when you are done.
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, extname, normalize } from "node:path";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { ROOT, readList, writeList, clean, newId } from "./todo-lib.mjs";

const args = process.argv.slice(2);
const LAN = args.includes("--lan");
const PORT = Number(args.find((a) => /^\d+$/.test(a)) ?? 8099);
const HOST = LAN ? "0.0.0.0" : "127.0.0.1";

function lanAddress() {
  for (const cards of Object.values(networkInterfaces())) {
    for (const card of cards ?? []) {
      if (card.family === "IPv4" && !card.internal) return card.address;
    }
  }
  return null;
}
const DOCS = resolve(ROOT, "docs");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function serveFile(res, rel) {
  const path = resolve(DOCS, normalize(rel).replace(/^([/\\])+/, ""));
  if (!path.startsWith(DOCS) || !existsSync(path)) return send(res, 404, "not found");
  send(res, 200, readFileSync(path), TYPES[extname(path).toLowerCase()] ?? "application/octet-stream");
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/api/todo") {
    if (req.method === "GET") {
      return send(res, 200, JSON.stringify(readList()), TYPES[".json"]);
    }
    if (req.method === "PUT") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 4e6) req.destroy(); });
      req.on("end", () => {
        try {
          const sent = JSON.parse(raw);
          const items = (Array.isArray(sent.items) ? sent.items : []).map((it) =>
            clean({ ...it, id: it.id || newId() })
          );
          const saved = writeList({ items });
          console.log(`saved ${items.filter((i) => !i.done).length} open, ${items.filter((i) => i.done).length} done`);
          send(res, 200, JSON.stringify(saved), TYPES[".json"]);
        } catch (err) {
          send(res, 400, String(err && err.message ? err.message : err));
        }
      });
      return;
    }
    return send(res, 405, "method not allowed");
  }

  // A picture dragged onto a task lands in docs/todo-images/ and is attached by its relative path.
  if (url.pathname === "/api/image" && req.method === "POST") {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size > 12e6) req.destroy(); chunks.push(c); });
    req.on("end", () => {
      const type = String(req.headers["content-type"] ?? "");
      const ext = type === "image/png" ? ".png" : type === "image/webp" ? ".webp"
        : type === "image/gif" ? ".gif" : ".jpeg";
      const given = (url.searchParams.get("name") ?? "shot").toLowerCase();
      const stem = given.replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shot";
      const file = `${stem}-${Date.now().toString(36)}${ext}`;
      mkdirSync(resolve(DOCS, "todo-images"), { recursive: true });
      writeFileSync(resolve(DOCS, "todo-images", file), Buffer.concat(chunks));
      console.log(`picture saved: todo-images/${file}`);
      send(res, 200, JSON.stringify({ path: `todo-images/${file}` }), TYPES[".json"]);
    });
    return;
  }

  if (url.pathname === "/" || url.pathname === "/todo") return serveFile(res, "todo.html");
  return serveFile(res, url.pathname);
});

server.listen(PORT, HOST, () => {
  const at = `http://127.0.0.1:${PORT}/`;
  console.log(`to-do board on ${at}   (ctrl+c stops it)`);
  if (LAN) {
    const ip = lanAddress();
    console.log(ip
      ? `on your phone, same Wi-Fi:  http://${ip}:${PORT}/   (no password, so trust the network)`
      : "no network address found: is the Wi-Fi on?");
  }
  const open = process.platform === "win32" ? ["cmd", ["/c", "start", "", at]]
    : process.platform === "darwin" ? ["open", [at]]
    : ["xdg-open", [at]];
  try { spawn(open[0], open[1], { detached: true, stdio: "ignore" }).unref(); } catch { /* open it yourself */ }
});

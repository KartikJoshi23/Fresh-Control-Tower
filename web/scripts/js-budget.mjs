/**
 * JS budget check (plan §6.6, P9-03): gzip size of the JavaScript each route's HTML references (the initial load).
 * Lazy chunks (the Route Globe's three.js) are reported separately. Run after `npm run build`:
 *   node scripts/js-budget.mjs        # exits 1 if any route is over the 300 KB hard limit
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const OUT = new URL("../out/", import.meta.url).pathname;
const TARGET = 250 * 1024;
const LIMIT = 300 * 1024;
const routes = ["", ...readdirSync(OUT).filter((d) => !d.startsWith("_") && statSync(join(OUT, d)).isDirectory()
  && (() => { try { statSync(join(OUT, d, "index.html")); return true; } catch { return false; } })())];
const gz = (f) => gzipSync(readFileSync(join(OUT, f))).length;
const all = new Set(readdirSync(join(OUT, "_next/static/chunks")).filter((f) => f.endsWith(".js")).map((f) => `_next/static/chunks/${f}`));
const used = new Set();
let failed = false;
for (const r of routes) {
  const html = readFileSync(join(OUT, r, "index.html"), "utf-8");
  const files = [...new Set([...html.matchAll(/\/?(_next\/static\/chunks\/[\w.-]+\.js)/g)].map((m) => m[1]))];
  files.forEach((f) => used.add(f));
  const total = files.reduce((s, f) => s + gz(f), 0);
  const flag = total > LIMIT ? "OVER LIMIT" : total > TARGET ? "over target" : "ok";
  if (total > LIMIT) failed = true;
  console.log(`/${r}`.padEnd(14), `${(total / 1024).toFixed(1)} KB gzip`.padStart(16), ` ${files.length} files  ${flag}`);
}
const lazy = [...all].filter((f) => !used.has(f)).map((f) => [f, gz(f)]).sort((a, b) => b[1] - a[1]);
console.log(`lazy chunks: ${lazy.length}, largest ${lazy.slice(0, 3).map(([f, s]) => `${f.split("/").pop()} ${(s / 1024).toFixed(1)} KB`).join(", ")}`);
process.exit(failed ? 1 : 0);

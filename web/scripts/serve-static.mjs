/**
 * Minimal static file server for the exported site in web/out.
 *
 * `next start` cannot serve a static export, so `npm start` and the Playwright tests use this
 * instead. It has no dependencies.
 *
 * Usage (from web/, after `npm run build`): node scripts/serve-static.mjs [port]   (default 4173)
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out", import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** Maps a URL path to a file inside `root`, or returns null (also blocks path traversal). */
function resolveFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, "http://localhost").pathname);
  } catch {
    return null;
  }
  const target = normalize(join(root, pathname));
  if (target !== root && !target.startsWith(root + sep)) return null;
  const candidates = [target, join(target, "index.html"), `${target}.html`];
  return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null;
}

if (!existsSync(root)) {
  console.error("web/out was not found. Run `npm run build` first.");
  process.exit(1);
}

createServer((request, response) => {
  const file = resolveFile(request.url ?? "/");
  if (!file) {
    const notFound = join(root, "404.html");
    response.writeHead(404, { "content-type": CONTENT_TYPES[".html"] });
    if (existsSync(notFound)) createReadStream(notFound).pipe(response);
    else response.end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`Serving web/out at http://localhost:${port}`);
});

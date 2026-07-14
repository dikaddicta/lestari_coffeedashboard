import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const port = Number(process.env.PORT || process.argv[2] || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function safeFilePath(requestUrl) {
  const normalizedUrl = String(requestUrl || "/").replace(/^\/{2,}/, "/");
  const url = new URL(normalizedUrl, `http://127.0.0.1:${port}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, `.${pathname}`);
  const insideRoot = candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`);
  return insideRoot ? candidate : null;
}

const server = http.createServer((request, response) => {
  const file = safeFilePath(request.url || "/");
  if (!file) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(file, (statError, stat) => {
    let target = file;
    if (!statError && stat.isDirectory()) target = path.join(file, "index.html");

    fs.readFile(target, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
        return;
      }
      response.writeHead(200, {
        "Content-Type": mime[path.extname(target).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(content);
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Lestari Coffee Dashboard local server: http://127.0.0.1:${port}`);
  console.log("Press Ctrl+C to stop.");
});

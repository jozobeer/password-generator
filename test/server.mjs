import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_ROOT = join(fileURLToPath(new URL("..", import.meta.url)), "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function resolvePublicPath(requestUrl) {
  const rawPath = (requestUrl || "/").split("?")[0];
  const relative = rawPath === "/" ? "index.html" : rawPath.replace(/^\//, "");
  const resolved = normalize(join(PUBLIC_ROOT, relative));
  if (resolved !== PUBLIC_ROOT && !resolved.startsWith(PUBLIC_ROOT + "/")) {
    return null;
  }
  return resolved;
}

/**
 * Serve public/ on an ephemeral port. Returns { url, close }.
 */
export async function startServer() {
  const server = createServer(async (req, res) => {
    const filePath = resolvePublicPath(req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const body = await readFile(filePath);
      const type = CONTENT_TYPES[extname(filePath)] || "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

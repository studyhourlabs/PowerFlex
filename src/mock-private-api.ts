import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sparkFilesDir = path.join(rootDir, "data", "spark-files");

const routeFiles: Record<string, string> = {
  "/company-profile": "company-profile.json",
  "/depot-ops": "depot-ops.json",
  "/bess-assets": "bess-assets.json"
};

const server = http.createServer((request, response) => {
  void handleRequest(request, response);
});

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  const urlPath = request.url ? new URL(request.url, "http://localhost").pathname : "/";
  const fileName = routeFiles[urlPath];

  if (request.method !== "GET" || fileName === undefined) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  try {
    const body = await fs.readFile(path.join(sparkFilesDir, fileName), "utf8");
    const parsed = JSON.parse(body) as unknown;
    sendJson(response, 200, parsed);
  } catch (error) {
    sendJson(response, 500, {
      error: "private_data_read_failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const port = Number.parseInt(process.env.MOCK_PRIVATE_API_PORT ?? "8787", 10);
server.listen(port, () => {
  console.log(`Mock private API listening on http://localhost:${port}`);
  console.log(`Serving private API data from ${sparkFilesDir}`);
});

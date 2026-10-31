import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import config from "../api/config";
import jobs from "../api/jobs";
import control from "../api/control";
import health from "../api/health";
import attestation from "../api/attestation";
import plan from "../api/plan";

const handlers: Record<string, typeof config> = {
  "/api/config": config,
  "/api/jobs": jobs,
  "/api/control": control,
  "/api/health": health,
  "/api/attestation": attestation,
  "/api/plan": plan,
};
const api = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1:5191");
  const handler = handlers[url.pathname];
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!handler) {
    response.writeHead(404);
    response.end(JSON.stringify({ error: "Endpoint not found." }));
    return;
  }
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 45000) {
      response.writeHead(413);
      response.end(JSON.stringify({ error: "Request is too large." }));
      return;
    }
  }
  const req = request as VercelRequest;
  req.query = Object.fromEntries(url.searchParams);
  try {
    req.body = raw ? JSON.parse(raw) : undefined;
  } catch {
    response.writeHead(400);
    response.end(JSON.stringify({ error: "Send valid JSON." }));
    return;
  }
  const res = response as VercelResponse;
  res.status = (code: number) => {
    response.statusCode = code;
    return res;
  };
  res.json = (value: unknown) => {
    response.end(JSON.stringify(value));
    return res;
  };
  await handler(req, res);
});
api.listen(5191, "127.0.0.1");
const vite = await createViteServer();
await vite.listen();
console.log("Sealwork workspace: http://127.0.0.1:5190");
console.log("Local API: http://127.0.0.1:5191");
async function stop() {
  await vite.close();
  api.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

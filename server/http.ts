import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, verifyOrigin } from "./security.js";

export type Handler = (
  req: VercelRequest,
  res: VercelResponse,
) => Promise<unknown>;
export function route(handler: Handler): Handler {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== "GET")
        verifyOrigin(req.headers.origin, req.headers.host);
      return await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError)
        return res
          .status(error.status)
          .json({ error: error.message, ...error.details });
      // Do not log request bodies, secrets, signing objects, or RPC errors.
      console.error(
        "Sealwork request failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
      return res.status(503).json({
        error:
          "NEAR testnet is temporarily unavailable. Refresh the job before retrying; a submitted transaction may still complete.",
      });
    }
  };
}
export function method(req: VercelRequest, expected: string): void {
  if (req.method !== expected)
    throw new HttpError(405, `Use ${expected} for this endpoint.`);
}
export function body(req: VercelRequest): Record<string, unknown> {
  const value = req.body;
  if (Buffer.byteLength(JSON.stringify(value || {})) > 45000)
    throw new HttpError(413, "The encrypted demo input is too large.");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Send a JSON object.");
  return value as Record<string, unknown>;
}

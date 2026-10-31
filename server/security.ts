import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export function requireString(
  value: unknown,
  expression: RegExp,
  message: string,
): string {
  if (typeof value !== "string" || !expression.test(value))
    throw new HttpError(400, message);
  return value;
}
export function validJobId(value: unknown): string {
  return requireString(
    value,
    /^sw_[a-f0-9]{32}$/,
    "Choose a valid Sealwork job.",
  );
}

function secret(): string {
  const value = process.env.SEALWORK_CONTROL_SECRET;
  if (!value || value.length < 32)
    throw new HttpError(
      503,
      "Sponsored jobs are not configured on this deployment.",
    );
  return value;
}
function signature(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function issueCapability(jobId: string): string {
  return signature(`sealwork:control:v1:${jobId}`);
}
export function verifyCapability(jobId: string, value: unknown): void {
  if (typeof value !== "string" || !equal(value, issueCapability(jobId)))
    throw new HttpError(
      403,
      "Only the browser that created this job can start it.",
    );
}
export function issueChallenge(): string {
  const payload = `${Date.now()}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signature(`sealwork:create:v1:${payload}`)}`;
}
export function verifyChallenge(value: unknown): void {
  if (typeof value !== "string" || value.length > 160)
    throw new HttpError(403, "Refresh the workspace before creating a job.");
  const parts = value.split(".");
  const timestamp = Number(parts[0]);
  const payload = parts.slice(0, 2).join(".");
  if (
    parts.length !== 3 ||
    !Number.isFinite(timestamp) ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    Date.now() - timestamp > 900000 ||
    timestamp > Date.now() + 10000 ||
    !equal(parts[2], signature(`sealwork:create:v1:${payload}`))
  )
    throw new HttpError(403, "Refresh the workspace before creating a job.");
}
export function verifyOrigin(origin: unknown, host: unknown): void {
  if (origin === undefined) return; // command-line clients must still supply a signed challenge/capability.
  if (typeof origin !== "string" || typeof host !== "string")
    throw new HttpError(
      403,
      "This request must originate from the Sealwork workspace.",
    );
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, "Invalid request origin.");
  }
  if (parsed.host !== host || !["http:", "https:"].includes(parsed.protocol))
    throw new HttpError(
      403,
      "This request must originate from the Sealwork workspace.",
    );
}

const limits = new Map<string, number[]>();
export function limitRequests(address: string): void {
  const now = Date.now();
  const events = (limits.get(address) || []).filter(
    (timestamp) => timestamp > now - 60000,
  );
  if (events.length >= 3)
    throw new HttpError(
      429,
      "Please wait a minute before starting another sponsored job.",
    );
  events.push(now);
  limits.set(address, events);
  if (limits.size > 2000)
    for (const [key, values] of limits)
      if (!values.some((value) => value > now - 60000)) limits.delete(key);
}

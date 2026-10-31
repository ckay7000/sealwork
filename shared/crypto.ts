import { x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { PrivateInput, PrivateResult } from "./types";

const utf8 = new TextEncoder();
const text = new TextDecoder("utf-8", { fatal: true });

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function unhex(value: string): Uint8Array {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value))
    throw new Error("Invalid hexadecimal value.");
  return Uint8Array.from(value.match(/.{2}/g)!, (b) => Number.parseInt(b, 16));
}

export function randomHex(bytes = 32): string {
  return hex(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

export function base64(bytes: Uint8Array): string {
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 8192)
    encoded += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(encoded);
}

export function unbase64(value: string): Uint8Array {
  if (value.length > 200000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("Invalid encrypted payload.");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export function inputCommitment(packet: PrivateInput): string {
  return hex(
    sha256(utf8.encode(`sealwork:input:v1\0${canonicalJson(packet)}`)),
  );
}

export function resultCommitment(result: string, salt: string): string {
  return hex(sha256(utf8.encode(`sealwork:result:v1\0${salt}\0${result}`)));
}

/** OutLayer ECIES v1: X25519, HKDF-SHA256, and ChaCha20-Poly1305.
 * The public key is derived inside OutLayer's keystore for the project and
 * secret owner. Only ciphertext reaches Sealwork's server or the chain.
 * Wire format matches the pinned upstream keystore's decrypt_ecies method.
 */
export function sealToKeystore(
  plaintext: string,
  publicKeyHex: string,
): string {
  const recipient = unhex(publicKeyHex);
  if (recipient.length !== 32)
    throw new Error("The verified keystore public key must be 32 bytes.");
  const ephemeral = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const publicKey = x25519.getPublicKey(ephemeral);
  const shared = x25519.getSharedSecret(ephemeral, recipient);
  const key = hkdf(
    sha256,
    shared,
    undefined,
    utf8.encode("outlayer-keystore-v1"),
    32,
  );
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = chacha20poly1305(key, nonce).encrypt(
    utf8.encode(plaintext),
  );
  const bytes = new Uint8Array(1 + 32 + 12 + ciphertext.length);
  bytes[0] = 1;
  bytes.set(publicKey, 1);
  bytes.set(nonce, 33);
  bytes.set(ciphertext, 45);
  ephemeral.fill(0);
  shared.fill(0);
  key.fill(0);
  return base64(bytes);
}

export function resultAad(jobId: string, commitment: string): Uint8Array {
  return utf8.encode(`sealwork:delivery:v1:${jobId}:${commitment}`);
}

export async function openResult(
  ciphertext: string,
  buyerKey: string,
  jobId: string,
  commitment: string,
): Promise<{ result: PrivateResult; bytes: string }> {
  const bytes = unbase64(ciphertext);
  if (bytes.length < 30 || bytes[0] !== 1)
    throw new Error("Unsupported encrypted delivery.");
  const keyBytes = unhex(buyerKey);
  if (keyBytes.length !== 32)
    throw new Error("The private delivery key is invalid.");
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(1, 13) as BufferSource,
      additionalData: resultAad(jobId, commitment) as BufferSource,
    },
    key,
    bytes.slice(13) as BufferSource,
  );
  const raw = text.decode(plaintext);
  const result = JSON.parse(raw) as PrivateResult;
  if (
    result.schema !== "sealwork.invoice-reconciliation.v1" ||
    !Array.isArray(result.rows) ||
    result.rows.length < 1 ||
    result.rows.length > 16 ||
    !result.rows.every(
      (row) =>
        row &&
        typeof row.invoice_id === "string" &&
        row.invoice_id.length > 0 &&
        row.invoice_id.length <= 80 &&
        typeof row.vendor === "string" &&
        row.vendor.length > 0 &&
        row.vendor.length <= 120 &&
        Number.isSafeInteger(row.amount_minor) &&
        row.amount_minor >= 0 &&
        ["USD", "EUR", "GBP"].includes(row.currency) &&
        ["matched", "unpaid", "mismatch"].includes(row.status),
    )
  )
    throw new Error("The agent returned an unsupported delivery format.");
  return { result, bytes: raw };
}

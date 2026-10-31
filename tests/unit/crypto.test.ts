import { createCipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  base64,
  hex,
  inputCommitment,
  openResult,
  sealToKeystore,
  unbase64,
} from "../../shared/crypto";
import type { PrivateInput } from "../../shared/types";

const utf8 = new TextEncoder();
const job = "sw_" + "1".repeat(32);
const commitment = "2".repeat(64);
const buyerKey = "33".repeat(32);
function deliver(result: unknown) {
  const nonce = Buffer.alloc(12, 9);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(buyerKey, "hex"),
    nonce,
  );
  cipher.setAAD(Buffer.from(`sealwork:delivery:v1:${job}:${commitment}`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(result)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return Buffer.concat([Buffer.from([1]), nonce, encrypted]).toString("base64");
}
const result = {
  schema: "sealwork.invoice-reconciliation.v1",
  rows: [
    {
      invoice_id: "INV-1",
      vendor: "Fern, café",
      amount_minor: 1235,
      currency: "USD",
      status: "matched",
    },
  ],
};
describe("private input and delivery wire protocols", () => {
  it("round-trips the published ECIES packet format with a fresh key and nonce", () => {
    const privateKey = new Uint8Array(32).fill(11);
    const publicKey = hex(x25519.getPublicKey(privateKey));
    const encrypted = sealToKeystore("synthetic private invoice", publicKey);
    const packet = unbase64(encrypted);
    expect(packet[0]).toBe(1);
    const shared = x25519.getSharedSecret(privateKey, packet.slice(1, 33));
    const key = hkdf(
      sha256,
      shared,
      undefined,
      utf8.encode("outlayer-keystore-v1"),
      32,
    );
    const decrypted = chacha20poly1305(key, packet.slice(33, 45)).decrypt(
      packet.slice(45),
    );
    expect(new TextDecoder().decode(decrypted)).toBe(
      "synthetic private invoice",
    );
    expect(encrypted).not.toContain("invoice");
    expect(encrypted).not.toBe(
      sealToKeystore("synthetic private invoice", publicKey),
    );
    packet[packet.length - 1] ^= 1;
    expect(() =>
      chacha20poly1305(key, packet.slice(33, 45)).decrypt(packet.slice(45)),
    ).toThrow();
  });
  it("canonicalizes object order and binds every private-input field", () => {
    const input: PrivateInput = {
      job_id: job,
      source_csv: "source",
      ledger_csv: "ledger",
      buyer_key: buyerKey,
      salt: "44".repeat(32),
    };
    expect(inputCommitment(input)).toBe(
      inputCommitment({
        salt: input.salt,
        buyer_key: buyerKey,
        ledger_csv: "ledger",
        source_csv: "source",
        job_id: job,
      }),
    );
    for (const field of Object.keys(input) as Array<keyof PrivateInput>)
      expect(
        inputCommitment({ ...input, [field]: input[field] + "x" }),
      ).not.toBe(inputCommitment(input));
  });
  it("opens an AES-GCM delivery produced by an independent native cipher", async () => {
    const opened = await openResult(deliver(result), buyerKey, job, commitment);
    expect(opened.result).toEqual(result);
    expect(opened.result.rows[0].amount_minor).toBe(1235);
  });
  it("rejects wrong keys, swapped jobs, swapped input commitments, and modified ciphertext", async () => {
    const encrypted = deliver(result);
    await expect(
      openResult(encrypted, "55".repeat(32), job, commitment),
    ).rejects.toThrow();
    await expect(
      openResult(encrypted, buyerKey, job + "2", commitment),
    ).rejects.toThrow();
    await expect(
      openResult(encrypted, buyerKey, job, "66".repeat(64)),
    ).rejects.toThrow();
    const bytes = unbase64(encrypted);
    bytes[bytes.length - 1] ^= 1;
    await expect(
      openResult(base64(bytes), buyerKey, job, commitment),
    ).rejects.toThrow();
  });
  it.each([NaN, -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid delivered amounts: %s",
    async (amount) => {
      await expect(
        openResult(
          deliver({
            ...result,
            rows: [{ ...result.rows[0], amount_minor: amount }],
          }),
          buyerKey,
          job,
          commitment,
        ),
      ).rejects.toThrow();
    },
  );
  it("rejects unsupported result schemas and oversized delivery row sets", async () => {
    await expect(
      openResult(
        deliver({ ...result, schema: "unknown" }),
        buyerKey,
        job,
        commitment,
      ),
    ).rejects.toThrow();
    await expect(
      openResult(
        deliver({ ...result, rows: Array(17).fill(result.rows[0]) }),
        buyerKey,
        job,
        commitment,
      ),
    ).rejects.toThrow();
  });
});

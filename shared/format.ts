export const YOCTO = 10n ** 24n;
export const DEMO_BUDGET = 5n * 10n ** 22n;
export const COMPUTE_DEPOSIT = 2n * 10n ** 22n;
export const STORAGE_PRICE = 10n ** 19n;

export function nearAmount(value: string | bigint, digits = 3): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const integer = absolute / YOCTO;
  const fraction = (absolute % YOCTO)
    .toString()
    .padStart(24, "0")
    .slice(0, digits);
  return `${sign}${integer}${digits ? `.${fraction}` : ""}`;
}
export function shortHash(value: string, size = 6): string {
  return value.length > size * 2 + 2
    ? `${value.slice(0, size)}…${value.slice(-size)}`
    : value || "Not available";
}
export function dateFromNs(value: string): Date {
  return new Date(Number(BigInt(value) / 1_000_000n));
}
export function formatDate(value: string): string {
  return (
    dateFromNs(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}
export function transactionUrl(hash: string): string {
  return `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;
}
export function accountUrl(id: string): string {
  return `https://testnet.nearblocks.io/address/${encodeURIComponent(id)}`;
}

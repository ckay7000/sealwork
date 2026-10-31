/** A small CSV preflight for the browser. Acceptance is always decided by
 * the separately pinned Rust verifier, never by this convenience check. */
export function readCsv(value: string): string[][] {
  if (new TextEncoder().encode(value).length > 10000)
    throw new Error("Keep each CSV below 10 KB for this demo.");
  const input = value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"' && cell.trim() === "" && !closed) {
      cell = "";
      quoted = true;
    } else if (char === "," || char === "\n") {
      row.push(cell.trim());
      cell = "";
      closed = false;
      if (char === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else {
      if (closed && char.trim())
        throw new Error("There is text after a quoted CSV field.");
      cell += char;
    }
  }
  if (quoted) throw new Error("A quoted CSV field is not closed.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length)
    throw new Error("Add a CSV header and at least one invoice.");
  if (rows.length > 17)
    throw new Error("This demo supports up to 16 rows per file.");
  const count = rows[0].length;
  if (rows.some((row) => row.length !== count))
    throw new Error("Every CSV row must have the same number of columns.");
  return rows;
}

export function inspectInputs(
  source: string,
  ledger: string,
): { invoices: number; payments: number } {
  const invoices = readCsv(source);
  const payments = readCsv(ledger);
  for (const [rows, required] of [
    [invoices, ["invoice_id", "vendor", "amount", "currency"]],
    [payments, ["invoice_id", "amount", "currency"]],
  ] as const) {
    const headers = rows[0].map((header) => header.toLowerCase());
    if (
      new Set(headers).size !== headers.length ||
      required.some((name) => !headers.includes(name))
    )
      throw new Error(
        `The CSV needs these unique headers: ${required.join(", ")}.`,
      );
    const amountIndex = headers.indexOf("amount");
    const currencyIndex = headers.indexOf("currency");
    for (const row of rows.slice(1)) {
      if (!/^\d+(?:\.\d{1,2})?$/.test(row[amountIndex]))
        throw new Error(
          "Use positive decimal amounts with at most two decimal places.",
        );
      if (!["USD", "EUR", "GBP"].includes(row[currencyIndex].toUpperCase()))
        throw new Error(
          "This demo supports USD, EUR, and GBP, with two decimal minor units.",
        );
    }
  }
  if (invoices.length < 2)
    throw new Error("Include at least one invoice below the header.");
  const idColumn = invoices[0]
    .map((header) => header.toLowerCase())
    .indexOf("invoice_id");
  const ids = invoices.slice(1).map((row) => row[idColumn]);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    throw new Error("Source invoice identifiers must be present and unique.");
  return { invoices: invoices.length - 1, payments: payments.length - 1 };
}

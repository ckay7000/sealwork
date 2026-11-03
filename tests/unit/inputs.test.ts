import { describe, expect, it } from "vitest";
import { inspectInputs, readCsv } from "../../shared/inputs";
import { LEDGER_SAMPLE, SOURCE_SAMPLE } from "../../shared/types";
describe("CSV preflight for confidential jobs", () => {
  it("counts the sample invoices and payment records", () =>
    expect(inspectInputs(SOURCE_SAMPLE, LEDGER_SAMPLE)).toEqual({
      invoices: 6,
      payments: 5,
    }));
  it("handles BOMs, Windows newlines, escaped quotes, and commas within a quoted vendor", () => {
    expect(
      readCsv(
        '\uFEFFinvoice_id,vendor,amount,currency\r\nI-1,"Fern, ""café""",12.35,USD',
      ),
    ).toEqual([
      ["invoice_id", "vendor", "amount", "currency"],
      ["I-1", 'Fern, "café"', "12.35", "USD"],
    ]);
  });
  it.each(["-1", "1e3", "1.999"])(
    "rejects ambiguous or invalid financial values: %s",
    (amount) =>
      expect(() =>
        inspectInputs(
          `invoice_id,vendor,amount,currency\nI-1,Fern,${amount},USD`,
          LEDGER_SAMPLE,
        ),
      ).toThrow(),
  );
  it("rejects duplicate invoice IDs, unsupported currencies, and unmatched CSV columns", () => {
    expect(() =>
      inspectInputs(SOURCE_SAMPLE + "\nINV-1041,Fern,1.00,USD", LEDGER_SAMPLE),
    ).toThrow();
    expect(() =>
      inspectInputs(SOURCE_SAMPLE.replace("USD", "JPY"), LEDGER_SAMPLE),
    ).toThrow();
    expect(() => readCsv("a,b\n1,2,3")).toThrow();
  });
});

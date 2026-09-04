import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  type BankAccountType,
  BankAccountTypeSchema,
  type BankTransferDestinationV1,
  BankTransferDestinationV1Schema,
  bankAccountTypeValues,
} from "../src/index.js";

const validDestination = {
  schemaVersion: "1",
  rail: "bank_transfer",
  id: "recipient-001",
  bankCode: "0012",
  branchCode: "003",
  accountType: "ordinary",
  accountNumber: "0004567",
  accountHolder: "カ）サンプル",
} as const;

describe("BankTransferDestinationV1Schema", () => {
  it("parses the strict shape while preserving code and number strings", () => {
    const parsed = BankTransferDestinationV1Schema.parse(validDestination);

    expect(parsed).toEqual(validDestination);
    expect(parsed.bankCode).toBe("0012");
    expect(parsed.branchCode).toBe("003");
    expect(parsed.accountNumber).toBe("0004567");
    expectTypeOf(parsed).toEqualTypeOf<BankTransferDestinationV1>();
  });

  it("leaves compatibility checks to rules, including empty raw fields", () => {
    expect(
      BankTransferDestinationV1Schema.safeParse({
        ...validDestination,
        bankCode: "",
        branchCode: "１２３",
        accountNumber: "bad value",
        accountHolder: "",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["schema version", { schemaVersion: "2" }],
    ["rail", { rail: "jpyc" }],
    ["unknown account type", { accountType: "current" }],
    ["numeric bank code", { bankCode: 1234 }],
    ["numeric branch code", { branchCode: 1 }],
    ["numeric account number", { accountNumber: 1234567 }],
    ["unknown field", { unexpected: true }],
  ])("rejects invalid structural input: %s", (_name, override) => {
    expect(
      BankTransferDestinationV1Schema.safeParse({ ...validDestination, ...override }).success,
    ).toBe(false);
  });
});

describe("BankAccountTypeSchema", () => {
  it("exports the canonical model from its runtime schema", () => {
    expect(bankAccountTypeValues).toEqual(["ordinary", "checking", "savings", "other"]);
    expect(BankAccountTypeSchema.options).toEqual(bankAccountTypeValues);
    expectTypeOf<BankAccountType>().toEqualTypeOf<z.infer<typeof BankAccountTypeSchema>>();
  });
});

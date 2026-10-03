import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bankGenericJpProfileV1,
  prepareBankTransferValidatorV1,
  validateBankTransferDestinationV1,
  loadBankDirectoryRegistryV1,
} from "../src/index.js";
import { loadCompatibilityProfileV1, PayoutJpInputError } from "@payoutjp/core";
import { bankRules } from "../src/rules.js";

const good = {
  schemaVersion: "1",
  rail: "bank_transfer",
  bankCode: "1234",
  branchCode: "001",
  accountType: "ordinary",
  accountNumber: "0123456",
  accountHolder: "カ）サンプル",
};
const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/bank/${name}`, import.meta.url), "utf8"));
describe("prepared Bank validator", () => {
  it("matches single-item findings and owns its Registry snapshot", () => {
    const registry = loadBankDirectoryRegistryV1(read("registry/banks-synthetic.json"));
    const profile = loadCompatibilityProfileV1(read("profiles/bank-synthetic-test.json"), {
      rules: bankRules,
    });
    const registries = new Map([[registry.id, registry]]);
    const prepared = prepareBankTransferValidatorV1({ profile, registries });
    const input = { ...good, branchCode: "999" };
    const expected = validateBankTransferDestinationV1(input, {
      profile,
      registries,
      itemIndex: 7,
    });
    expect(prepared(input, 7)).toEqual(expected);
    const allowed = profile.rules.find((rule) => rule.id === "BANK-TYPE-001")?.params
      ?.allowedValues;
    if (!Array.isArray(allowed)) throw new Error("fixture must declare allowed account types");
    expect(Object.isFrozen(allowed)).toBe(false);
    allowed.push("other");
    profile.rules.splice(0);
    registry.payload.banks.splice(0);
    registries.clear();
    expect(prepared(input, 7)).toEqual(expected);
  });
  it("rejects invalid IDs as input errors and redacts values misassigned to public fields", () => {
    expect(() => validateBankTransferDestinationV1({ ...good, id: "bad\nid" })).toThrow(
      PayoutJpInputError,
    );
    const prepared = prepareBankTransferValidatorV1({ profile: bankGenericJpProfileV1 });
    const findings = prepared({ ...good, bankCode: "PRIVATE HOLDER", branchCode: "123456789" });
    expect(JSON.stringify(findings)).not.toMatch(/PRIVATE HOLDER|123456789/u);
    expect(findings.every((finding) => finding.actual?.classification === "metadata-only")).toBe(
      true,
    );
  });
});

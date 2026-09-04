import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PayoutJpIntegrityError } from "@payoutjp/core";
import { describe, expect, it } from "vitest";
import {
  BankDirectoryRegistryEnvelopeV1Schema,
  BankDirectoryRegistryV1Schema,
  loadBankDirectoryRegistryV1,
} from "../src/index.js";

const registryPath = fileURLToPath(
  new URL("../../../fixtures/bank/registry/banks-synthetic.json", import.meta.url),
);
const registryInput = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;

describe("Bank Directory Registry", () => {
  it("loads the digest-verified synthetic fixture and labels its provenance", () => {
    const registry = loadBankDirectoryRegistryV1(registryInput);

    expect(registry.id).toBe("banks-synthetic");
    expect(registry.payload.banks).toHaveLength(2);
    expect(registry.source.notes?.join(" ")).toContain("fictional");
    expect(BankDirectoryRegistryEnvelopeV1Schema.safeParse(registry).success).toBe(true);
  });

  it.each([
    [
      "bank code",
      {
        kind: "bank-directory",
        banks: [
          { code: "1234", branches: [] },
          { code: "1234", branches: [] },
        ],
      },
    ],
    [
      "branch code within a bank",
      {
        kind: "bank-directory",
        banks: [
          {
            code: "1234",
            branches: [{ code: "001" }, { code: "001" }],
          },
        ],
      },
    ],
  ])("rejects a duplicate %s", (_name, payload) => {
    expect(BankDirectoryRegistryV1Schema.safeParse(payload).success).toBe(false);
  });

  it("accepts active, closed, unknown, and omitted status metadata", () => {
    const result = BankDirectoryRegistryV1Schema.safeParse({
      kind: "bank-directory",
      banks: [
        {
          code: "1234",
          status: "closed",
          branches: [
            { code: "001", status: "active" },
            { code: "002", status: "unknown" },
            { code: "003" },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("maps a mismatched envelope kind and digest to stable integrity errors", () => {
    const registry = loadBankDirectoryRegistryV1(registryInput);
    expect(() => loadBankDirectoryRegistryV1({ ...registry, kind: "other" })).toThrow(
      new PayoutJpIntegrityError("PJP_REGISTRY_INVALID"),
    );
    expect(() => loadBankDirectoryRegistryV1({ ...registry, sha256: "f".repeat(64) })).toThrow(
      new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH"),
    );
  });
});

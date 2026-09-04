import { loadCompatibilityProfileV1 } from "@payoutjp/core";
import { bankRules } from "./rules.js";

/** Conservative structural Profile; it intentionally carries no production Bank Registry. */
export const bankGenericJpProfileV1 = loadCompatibilityProfileV1(
  {
    schemaVersion: "1",
    id: "bank-generic-jp",
    version: "0.1.0",
    status: "verified",
    rail: "bank_transfer",
    title: "Generic Japanese bank transfer",
    description:
      "Conservative structural validation without claims about acceptance by a specific bank.",
    rules: [
      { id: "BANK-CODE-001", enabled: true, params: { asciiDigits: 4 } },
      { id: "BANK-BRANCH-001", enabled: true, params: { asciiDigits: 3 } },
      {
        id: "BANK-TYPE-001",
        enabled: true,
        params: { allowedValues: ["ordinary", "checking", "savings", "other"] },
      },
      { id: "BANK-NUMBER-001", enabled: true, params: { asciiDigitsOnly: true } },
      {
        id: "BANK-NUMBER-002",
        enabled: true,
        params: { minDigits: 1, maxDigits: 7 },
      },
      { id: "BANK-HOLDER-001", enabled: true, params: { required: true } },
      { id: "BANK-HOLDER-002", enabled: true, params: {} },
      {
        id: "BANK-HOLDER-003",
        enabled: true,
        params: { rejectControlCharacters: true },
      },
      {
        id: "BANK-HOLDER-004",
        enabled: true,
        params: { unicodeNormalization: "NFC" },
      },
    ],
    registries: [],
    sourceNotes: [
      "Structural checks only; this Profile does not assert that a destination is accepted by every bank.",
      "Bank and branch existence rules require an explicitly supplied, version-pinned Registry.",
      "No provider-specific character set or encoded byte limit is asserted.",
    ],
  },
  { rules: bankRules },
);

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadCompatibilityProfileV1,
  PayoutJpConfigurationError,
  PayoutJpInputError,
  PayoutJpIntegrityError,
} from "@payoutjp/core";
import { describe, expect, it, vi } from "vitest";
import {
  bankGenericJpProfileV1,
  bankRules,
  loadBankDirectoryRegistryV1,
  validateBankTransferDestinationV1,
} from "../src/index.js";

const fixtureUrl = (relativePath: string) =>
  new URL(`../../../fixtures/bank/${relativePath}`, import.meta.url);
const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(fixtureUrl(relativePath)), "utf8")) as unknown;

const validDestination = readJson("destinations/valid-synthetic.json");
const syntheticRegistry = loadBankDirectoryRegistryV1(readJson("registry/banks-synthetic.json"));
const syntheticProfile = loadCompatibilityProfileV1(readJson("profiles/bank-synthetic-test.json"), {
  rules: bankRules,
});
const registries = new Map([[syntheticRegistry.id, syntheticRegistry]]);
const syntheticRegistryReference = syntheticProfile.registries[0];
if (syntheticRegistryReference === undefined) {
  throw new Error("synthetic Profile must pin its fixture Registry");
}

function destinationWith(override: Readonly<Record<string, unknown>>): unknown {
  return { ...(validDestination as Record<string, unknown>), ...override };
}

function profileWithRules(rules: readonly unknown[]) {
  return loadCompatibilityProfileV1(
    {
      schemaVersion: "1",
      id: "bank-unit-test",
      version: "0.1.0",
      status: "verified",
      rail: "bank_transfer",
      title: "Bank unit test",
      description: "Fixture-only Profile for isolated Bank rule tests.",
      rules,
      registries: [],
      sourceNotes: ["Synthetic fixtures only."],
    },
    { rules: bankRules },
  );
}

function findingsFor(override: Readonly<Record<string, unknown>>, rules: readonly unknown[]) {
  return validateBankTransferDestinationV1(destinationWith(override), {
    profile: profileWithRules(rules),
  });
}

describe("bank-generic-jp", () => {
  it("is a verified conservative Profile without Registry or provider-specific claims", () => {
    expect(bankGenericJpProfileV1.status).toBe("verified");
    expect(bankGenericJpProfileV1.registries).toEqual([]);
    expect(bankGenericJpProfileV1.rules.map((rule) => rule.id)).not.toContain("BANK-CODE-002");
    expect(bankGenericJpProfileV1.rules.map((rule) => rule.id)).not.toContain("BANK-HOLDER-005");
    expect(bankGenericJpProfileV1.sourceNotes?.join(" ")).toContain("does not assert");
  });

  it("accepts a conservative structurally compatible destination without network access", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const before = structuredClone(validDestination);

    expect(validateBankTransferDestinationV1(validDestination)).toEqual([]);
    expect(validDestination).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("Bank code and branch rules", () => {
  it.each([
    ["1234", []],
    ["123", ["BANK-CODE-001"]],
    ["１２３４", ["BANK-CODE-001"]],
    ["12A4", ["BANK-CODE-001"]],
  ])("validates bank code %j as exact ASCII digits", (bankCode, expectedRuleIds) => {
    const findings = findingsFor({ bankCode }, [
      { id: "BANK-CODE-001", enabled: true, params: { asciiDigits: 4 } },
    ]);
    expect(findings.map((finding) => finding.ruleId)).toEqual(expectedRuleIds);
  });

  it.each([
    ["001", []],
    ["01", ["BANK-BRANCH-001"]],
    ["００１", ["BANK-BRANCH-001"]],
    ["0A1", ["BANK-BRANCH-001"]],
  ])("validates branch code %j as exact ASCII digits", (branchCode, expectedRuleIds) => {
    const findings = findingsFor({ branchCode }, [
      { id: "BANK-BRANCH-001", enabled: true, params: { asciiDigits: 3 } },
    ]);
    expect(findings.map((finding) => finding.ruleId)).toEqual(expectedRuleIds);
  });

  it.each([
    [{ bankCode: "9999" }, ["BANK-CODE-002"]],
    [{ branchCode: "999" }, ["BANK-BRANCH-002"]],
    [{ branchCode: "003" }, ["BANK-BRANCH-003"]],
    [{ branchCode: "002" }, []],
    [{ bankCode: "5678", branchCode: "101" }, []],
  ])("uses exact Registry membership and ownership for %j", (override, expectedRuleIds) => {
    const findings = validateBankTransferDestinationV1(destinationWith(override), {
      profile: syntheticProfile,
      registries,
    });
    const registryFindingIds = findings
      .map((finding) => finding.ruleId)
      .filter((ruleId) => ruleId.endsWith("002") || ruleId === "BANK-BRANCH-003");
    expect(registryFindingIds).toEqual(expectedRuleIds);
  });
});

describe("Account type and account number rules", () => {
  it("applies a Profile-defined account type subset", () => {
    const rules = [
      {
        id: "BANK-TYPE-001",
        enabled: true,
        params: { allowedValues: ["ordinary", "checking"] },
      },
    ] as const;

    expect(findingsFor({ accountType: "checking" }, rules)).toEqual([]);
    expect(findingsFor({ accountType: "savings" }, rules)[0]?.ruleId).toBe("BANK-TYPE-001");
    expect(() => findingsFor({ accountType: "unknown" }, rules)).toThrow(PayoutJpInputError);
  });

  it.each([
    ["0", []],
    ["012345", []],
    ["0123456", []],
    ["01234567", ["BANK-NUMBER-002"]],
    ["12 34", ["BANK-NUMBER-001"]],
    ["１２３４", ["BANK-NUMBER-001"]],
    ["12-34", ["BANK-NUMBER-001"]],
  ])(
    "validates account number %j without losing leading zeroes",
    (accountNumber, expectedRuleIds) => {
      const findings = findingsFor({ accountNumber }, [
        { id: "BANK-NUMBER-001", enabled: true, params: { asciiDigitsOnly: true } },
        { id: "BANK-NUMBER-002", enabled: true, params: { minDigits: 1, maxDigits: 7 } },
      ]);
      expect(findings.map((finding) => finding.ruleId)).toEqual(expectedRuleIds);
      for (const finding of findings) {
        expect(finding.actual?.classification).toBe("masked-bank-account");
        expect(finding.actual?.display).not.toBe(accountNumber);
      }
    },
  );
});

describe("Account holder rules", () => {
  it.each([
    ["", ["BANK-HOLDER-001"]],
    ["   ", ["BANK-HOLDER-001", "BANK-HOLDER-002"]],
    [" サンプル ", ["BANK-HOLDER-002"]],
    ["サン\u0000プル", ["BANK-HOLDER-003"]],
    ["サン\u202eプル", ["BANK-HOLDER-003"]],
    ["サンプル", []],
  ])(
    "checks presence, whitespace, and invisible characters for a redacted holder",
    (accountHolder, expectedRuleIds) => {
      const findings = findingsFor({ accountHolder }, [
        { id: "BANK-HOLDER-001", enabled: true, params: { required: true } },
        { id: "BANK-HOLDER-002", enabled: true, params: {} },
        {
          id: "BANK-HOLDER-003",
          enabled: true,
          params: { rejectControlCharacters: true },
        },
      ]);
      expect(findings.map((finding) => finding.ruleId)).toEqual(expectedRuleIds);
      for (const finding of findings) {
        expect(JSON.stringify(finding)).not.toContain(accountHolder || "fixture-secret-holder");
        expect(finding.actual?.classification).toBe("redacted-account-holder");
      }
    },
  );

  it("warns when NFC differs without changing the source value", () => {
    const decomposed = "Cafe\u0301";
    const input = destinationWith({ accountHolder: decomposed });
    const before = structuredClone(input);
    const findings = findingsFor({ accountHolder: decomposed }, [
      {
        id: "BANK-HOLDER-004",
        enabled: true,
        params: { unicodeNormalization: "NFC" },
      },
    ]);

    expect(findings[0]).toMatchObject({
      ruleId: "BANK-HOLDER-004",
      severity: "warning",
      path: "destination.accountHolder",
      actual: { classification: "redacted-account-holder", display: "<redacted>" },
    });
    expect(input).toEqual(before);
    expect(JSON.stringify(findings)).not.toContain(decomposed);
  });

  it.each([
    ["AB", 6, []],
    ["ABC", 6, ["BANK-HOLDER-005"]],
    ["ああ", 6, []],
    ["あああ", 6, ["BANK-HOLDER-006"]],
  ])(
    "enforces Profile charset and UTF-8 byte boundaries for %j",
    (accountHolder, maxBytes, expectedRuleIds) => {
      const findings = findingsFor({ accountHolder }, [
        {
          id: "BANK-HOLDER-005",
          enabled: true,
          params: { allowedCharacters: "ABあ" },
        },
        {
          id: "BANK-HOLDER-006",
          enabled: true,
          params: { encoding: "utf8", maxBytes },
        },
      ]);
      expect(findings.map((finding) => finding.ruleId)).toEqual(expectedRuleIds);
      expect(JSON.stringify(findings)).not.toContain(accountHolder);
    },
  );
});

describe("Profile and Registry enforcement", () => {
  it("requires explicit permission to validate with an experimental Profile", () => {
    const experimentalProfile = loadCompatibilityProfileV1(
      {
        ...bankGenericJpProfileV1,
        id: "bank-experimental-test",
        status: "experimental",
      },
      { rules: bankRules, allowExperimental: true },
    );

    expect(() =>
      validateBankTransferDestinationV1(validDestination, { profile: experimentalProfile }),
    ).toThrow(new PayoutJpConfigurationError("PJP_PROFILE_STATUS_NOT_ALLOWED"));
    expect(
      validateBankTransferDestinationV1(validDestination, {
        profile: experimentalProfile,
        allowExperimental: true,
      }),
    ).toEqual([]);
  });

  it("exports exactly the authorized non-experimental Bank rule catalog", () => {
    expect(bankRules.map((rule) => rule.id)).toEqual([
      "BANK-BRANCH-001",
      "BANK-BRANCH-002",
      "BANK-BRANCH-003",
      "BANK-CODE-001",
      "BANK-CODE-002",
      "BANK-HOLDER-001",
      "BANK-HOLDER-002",
      "BANK-HOLDER-003",
      "BANK-HOLDER-004",
      "BANK-HOLDER-005",
      "BANK-HOLDER-006",
      "BANK-NUMBER-001",
      "BANK-NUMBER-002",
      "BANK-TYPE-001",
    ]);
  });

  it("rejects unknown and invalid rule parameters at Profile load time", () => {
    expect(() =>
      profileWithRules([
        {
          id: "BANK-CODE-001",
          enabled: true,
          params: { asciiDigits: 4, unexpected: true },
        },
      ]),
    ).toThrow(new PayoutJpConfigurationError("PJP_RULE_PARAMS_INVALID"));
    expect(() =>
      profileWithRules([
        {
          id: "BANK-NUMBER-002",
          enabled: true,
          params: { minDigits: 8, maxDigits: 7 },
        },
      ]),
    ).toThrow(new PayoutJpConfigurationError("PJP_RULE_PARAMS_INVALID"));
  });

  it.each([
    [
      "BANK-CODE-001",
      { bankCode: "bad" },
      { asciiDigits: 4 },
      "error",
      "destination.bankCode",
      "bank.code.invalid_format",
    ],
    [
      "BANK-BRANCH-001",
      { branchCode: "bad" },
      { asciiDigits: 3 },
      "error",
      "destination.branchCode",
      "bank.branch.invalid_format",
    ],
    [
      "BANK-TYPE-001",
      { accountType: "savings" },
      { allowedValues: ["ordinary"] },
      "error",
      "destination.accountType",
      "bank.account_type.not_allowed",
    ],
    [
      "BANK-NUMBER-001",
      { accountNumber: "bad" },
      { asciiDigitsOnly: true },
      "error",
      "destination.accountNumber",
      "bank.account_number.invalid_characters",
    ],
    [
      "BANK-NUMBER-002",
      { accountNumber: "12345678" },
      { minDigits: 1, maxDigits: 7 },
      "error",
      "destination.accountNumber",
      "bank.account_number.invalid_length",
    ],
    [
      "BANK-HOLDER-001",
      { accountHolder: "" },
      { required: true },
      "error",
      "destination.accountHolder",
      "bank.account_holder.required",
    ],
    [
      "BANK-HOLDER-002",
      { accountHolder: " value " },
      {},
      "warning",
      "destination.accountHolder",
      "bank.account_holder.surrounding_whitespace",
    ],
    [
      "BANK-HOLDER-003",
      { accountHolder: "value\u0000" },
      { rejectControlCharacters: true },
      "error",
      "destination.accountHolder",
      "bank.account_holder.forbidden_invisible_character",
    ],
    [
      "BANK-HOLDER-004",
      { accountHolder: "Cafe\u0301" },
      { unicodeNormalization: "NFC" },
      "warning",
      "destination.accountHolder",
      "bank.account_holder.unicode_normalization_differs",
    ],
    [
      "BANK-HOLDER-005",
      { accountHolder: "B" },
      { allowedCharacters: "A" },
      "error",
      "destination.accountHolder",
      "bank.account_holder.character_not_allowed",
    ],
    [
      "BANK-HOLDER-006",
      { accountHolder: "あ" },
      { encoding: "utf8", maxBytes: 2 },
      "error",
      "destination.accountHolder",
      "bank.account_holder.encoded_length_exceeded",
    ],
  ])(
    "%s emits stable severity, path, and message key",
    (ruleId, override, params, severity, path, messageKey) => {
      const findings = findingsFor(override, [{ id: ruleId, enabled: true, params }]);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ ruleId, severity, path, messageKey });
    },
  );

  it.each([
    ["BANK-CODE-002", { bankCode: "9999" }, "destination.bankCode", "bank.code.not_found"],
    ["BANK-BRANCH-002", { branchCode: "999" }, "destination.branchCode", "bank.branch.not_found"],
    ["BANK-BRANCH-003", { branchCode: "003" }, "destination.branchCode", "bank.branch.wrong_bank"],
  ])("%s emits stable Registry finding metadata", (ruleId, override, path, messageKey) => {
    const findings = validateBankTransferDestinationV1(destinationWith(override), {
      profile: syntheticProfile,
      registries,
    });
    expect(findings.find((finding) => finding.ruleId === ruleId)).toMatchObject({
      severity: "error",
      path,
      messageKey,
    });
  });

  it("honors a Profile severity override", () => {
    const findings = findingsFor({ bankCode: "bad" }, [
      {
        id: "BANK-CODE-001",
        enabled: true,
        severity: "warning",
        params: { asciiDigits: 4 },
      },
    ]);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("requires enabled Registry rules to have an exact pinned local Registry", () => {
    expect(() =>
      validateBankTransferDestinationV1(validDestination, {
        profile: profileWithRules([{ id: "BANK-CODE-002", enabled: true, params: {} }]),
      }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_NOT_FOUND"));

    expect(() =>
      validateBankTransferDestinationV1(validDestination, { profile: syntheticProfile }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_NOT_FOUND"));

    const wrongDigestProfile = {
      ...syntheticProfile,
      registries: [{ ...syntheticRegistryReference, sha256: "f".repeat(64) }],
    };
    expect(() =>
      validateBankTransferDestinationV1(validDestination, {
        profile: wrongDigestProfile,
        registries,
      }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH"));

    expect(() =>
      validateBankTransferDestinationV1(validDestination, {
        profile: syntheticProfile,
        registries: new Map([["wrong-map-key", syntheticRegistry]]),
      }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_INVALID"));
  });

  it("rejects invalid item indexes and non-Bank Profiles", () => {
    expect(() => validateBankTransferDestinationV1(validDestination, { itemIndex: -1 })).toThrow(
      new PayoutJpConfigurationError("PJP_CONFIG_INVALID"),
    );
    expect(() =>
      validateBankTransferDestinationV1(validDestination, {
        profile: { ...bankGenericJpProfileV1, rail: "jpyc" },
      }),
    ).toThrow(new PayoutJpConfigurationError("PJP_CONFIG_INVALID"));
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  calculateRegistryEnvelopeSha256,
  loadCompatibilityProfileV1,
  PayoutJpConfigurationError,
  PayoutJpInputError,
  PayoutJpIntegrityError,
} from "@payoutjp/core";
import { describe, expect, it, vi } from "vitest";
import {
  jpycCurrentMainnetProfileV1,
  jpycOfficialMainnetRegistryV1,
  jpycRules,
  loadJpycContractRegistryV1,
  validateJpycDestinationV1,
} from "../src/index.js";

const fixtureUrl = (relativePath: string) =>
  new URL(`../../../fixtures/jpyc/${relativePath}`, import.meta.url);
const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(fixtureUrl(relativePath)), "utf8")) as unknown;

const validDestination = readJson("destinations/valid-polygon.json");
const currentApplicationConfig = readJson("application-config/current-polygon.json");
const officialRegistryReference = jpycCurrentMainnetProfileV1.registries[0];
if (officialRegistryReference === undefined) {
  throw new Error("current JPYC Profile must pin its official Registry");
}

function destinationWith(override: Readonly<Record<string, unknown>>): unknown {
  return { ...(validDestination as Record<string, unknown>), ...override };
}

function configWith(override: Readonly<Record<string, unknown>>): unknown {
  return { ...(currentApplicationConfig as Record<string, unknown>), ...override };
}

function profileWithRules(
  rules: readonly unknown[],
  registry = undefined as typeof jpycOfficialMainnetRegistryV1 | undefined,
) {
  return loadCompatibilityProfileV1(
    {
      schemaVersion: "1",
      id: "jpyc-unit-test",
      version: "0.1.0",
      status: "verified",
      rail: "jpyc",
      title: "JPYC unit test",
      description: "Fixture-only Profile for isolated JPYC rule tests.",
      rules,
      registries:
        registry === undefined
          ? []
          : [{ id: registry.id, version: registry.version, sha256: registry.sha256 }],
      sourceNotes: ["Synthetic test behavior unless the official Registry is supplied."],
    },
    { rules: jpycRules },
  );
}

function findingsFor(
  override: Readonly<Record<string, unknown>>,
  rules: readonly unknown[],
  applicationConfig?: unknown,
) {
  return validateJpycDestinationV1(destinationWith(override), {
    profile: profileWithRules(rules),
    ...(applicationConfig === undefined ? {} : { applicationConfig }),
  });
}

function createHistoricalRegistry(provenance: "verified-historical" | "third-party") {
  const unsigned = {
    schemaVersion: "1",
    id: `jpyc-history-${provenance}`,
    version: "test-1",
    kind: "jpyc-contracts",
    source: {
      publisher: "PayoutJP synthetic tests",
      uri: "https://example.invalid/payoutjp/jpyc-history",
      retrievedAt: "2026-09-04",
      notes: ["Synthetic historical fixture; not a real contract claim."],
    },
    payload: {
      kind: "jpyc-contracts",
      entries: [
        {
          environment: "mainnet",
          network: "Synthetic Polygon",
          chainId: 137,
          contractAddress: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
          status: "current",
          product: "regulated-jpyc",
          provenance: "official",
        },
        {
          environment: "mainnet",
          network: "Synthetic Polygon History",
          chainId: 137,
          contractAddress: "0x2222222222222222222222222222222222222222",
          status: "historical",
          product: "jpyc-prepaid",
          provenance,
        },
      ],
    },
  };
  return loadJpycContractRegistryV1({
    ...unsigned,
    sha256: calculateRegistryEnvelopeSha256(unsigned),
  });
}

describe("jpyc-current-mainnet", () => {
  it("pins one exact official Registry and the intended rule set", () => {
    expect(jpycCurrentMainnetProfileV1.status).toBe("verified");
    expect(jpycCurrentMainnetProfileV1.registries).toEqual([
      {
        id: jpycOfficialMainnetRegistryV1.id,
        version: jpycOfficialMainnetRegistryV1.version,
        sha256: jpycOfficialMainnetRegistryV1.sha256,
      },
    ]);
    expect(jpycCurrentMainnetProfileV1.rules.map((rule) => rule.id)).not.toContain(
      "JPYC-CONTRACT-001",
    );
  });

  it.each([1, 137, 8217, 43114])(
    "accepts current contract routing on official mainnet chain %i",
    (chainId) => {
      expect(
        validateJpycDestinationV1(destinationWith({ chainId }), {
          applicationConfig: configWith({ chainId }),
        }),
      ).toEqual([]);
    },
  );

  it("performs no network access and does not mutate inputs", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const destinationBefore = structuredClone(validDestination);
    const configBefore = structuredClone(currentApplicationConfig);

    expect(
      validateJpycDestinationV1(validDestination, {
        applicationConfig: currentApplicationConfig,
      }),
    ).toEqual([]);
    expect(validDestination).toEqual(destinationBefore);
    expect(currentApplicationConfig).toEqual(configBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("JPYC address rules", () => {
  it.each([
    ["0x1111111111111111111111111111111111111111", []],
    ["1111111111111111111111111111111111111111", ["JPYC-ADDRESS-001"]],
    ["0x1111", ["JPYC-ADDRESS-001"]],
    ["0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", ["JPYC-ADDRESS-001"]],
  ])("validates 20-byte syntax for %j", (walletAddress, expectedRuleIds) => {
    const findings = findingsFor({ walletAddress }, [
      { id: "JPYC-ADDRESS-001", enabled: true, params: {} },
    ]);
    expect(findings.map((finding) => finding.ruleId)).toEqual(expectedRuleIds);
    if (findings.length > 0) {
      expect(findings[0]).toMatchObject({
        severity: "error",
        path: "destination.walletAddress",
        messageKey: "jpyc.address.invalid_format",
      });
    }
  });

  it("rejects the zero address", () => {
    const findings = findingsFor({ walletAddress: "0x0000000000000000000000000000000000000000" }, [
      { id: "JPYC-ADDRESS-002", enabled: true, params: {} },
    ]);
    expect(findings[0]).toMatchObject({
      ruleId: "JPYC-ADDRESS-002",
      severity: "error",
      path: "destination.walletAddress",
      messageKey: "jpyc.address.zero_address",
    });
  });

  it.each([
    ["0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE", []],
    ["0x5AEDA56215b167893e80B4fE645BA6d5Bab767De", ["JPYC-ADDRESS-003"]],
    ["0x5aeda56215b167893e80b4fe645ba6d5bab767de", []],
  ])("uses warning-first EIP-55 policy for %s", (walletAddress, expectedRuleIds) => {
    const findings = findingsFor({ walletAddress }, [
      {
        id: "JPYC-ADDRESS-003",
        enabled: true,
        params: { policy: "mixed-case" },
      },
    ]);
    expect(findings.map((finding) => finding.ruleId)).toEqual(expectedRuleIds);
    expect(findings[0]?.severity).toBe(expectedRuleIds.length === 0 ? undefined : "warning");
    if (findings.length > 0) {
      expect(findings[0]).toMatchObject({
        path: "destination.walletAddress",
        messageKey: "jpyc.address.checksum_invalid",
      });
    }
  });

  it("rejects use of the token contract as a recipient without exposing a full address", () => {
    const tokenContract = "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29";
    const findings = validateJpycDestinationV1(destinationWith({ walletAddress: tokenContract }), {
      applicationConfig: currentApplicationConfig,
    });
    const finding = findings.find((entry) => entry.ruleId === "JPYC-ADDRESS-004");

    expect(finding).toMatchObject({
      severity: "error",
      path: "destination.walletAddress",
      messageKey: "jpyc.address.token_contract_recipient",
      actual: { classification: "short-wallet-address" },
    });
    expect(JSON.stringify(finding)).not.toContain(tokenContract);
  });
});

describe("JPYC route and contract rules", () => {
  it("rejects unsupported chains from Registry data", () => {
    const findings = validateJpycDestinationV1(destinationWith({ chainId: 999999 }));
    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "JPYC-CHAIN-001",
        severity: "error",
        path: "destination.chainId",
        messageKey: "jpyc.chain.unsupported",
      }),
    ]);
  });

  it("rejects destination and application-config chain mismatch", () => {
    const findings = validateJpycDestinationV1(validDestination, {
      applicationConfig: configWith({ chainId: 1 }),
    });
    expect(findings.map((finding) => finding.ruleId)).toEqual(["JPYC-CHAIN-002"]);
    expect(findings[0]).toMatchObject({
      severity: "error",
      path: "applicationConfig.chainId",
      messageKey: "jpyc.chain.application_mismatch",
    });
  });

  it("rejects testnet through the current mainnet Profile", () => {
    const findings = validateJpycDestinationV1(validDestination, {
      applicationConfig: configWith({ environment: "testnet" }),
    });
    expect(findings.map((finding) => finding.ruleId)).toEqual(["JPYC-ENV-001"]);
    expect(findings[0]).toMatchObject({
      severity: "error",
      path: "applicationConfig.environment",
      messageKey: "jpyc.environment.unsupported",
    });
  });

  it("reports an unknown non-current contract as a generic mismatch", () => {
    const tokenContract = "0x3333333333333333333333333333333333333333";
    const findings = validateJpycDestinationV1(validDestination, {
      applicationConfig: configWith({ tokenContract }),
    });
    expect(findings.map((finding) => finding.ruleId)).toEqual(["JPYC-CONTRACT-002"]);
    expect(findings[0]).toMatchObject({
      path: "applicationConfig.tokenContract",
      messageKey: "jpyc.contract.current_mismatch",
      actual: { classification: "short-wallet-address" },
    });
    expect(JSON.stringify(findings)).not.toContain(tokenContract);
  });

  it("specializes historical wording only with verified historical provenance", () => {
    const verifiedRegistry = createHistoricalRegistry("verified-historical");
    const thirdPartyRegistry = createHistoricalRegistry("third-party");
    const rules = [
      { id: "JPYC-CONTRACT-002", enabled: true, params: {} },
      { id: "JPYC-CONTRACT-003", enabled: true, params: {} },
    ];
    const config = configWith({
      tokenContract: "0x2222222222222222222222222222222222222222",
    });

    const verifiedFindings = validateJpycDestinationV1(validDestination, {
      profile: profileWithRules(rules, verifiedRegistry),
      registries: new Map([[verifiedRegistry.id, verifiedRegistry]]),
      applicationConfig: config,
    });
    expect(verifiedFindings.map((finding) => finding.ruleId)).toEqual(["JPYC-CONTRACT-003"]);
    expect(verifiedFindings[0]).toMatchObject({
      severity: "error",
      path: "applicationConfig.tokenContract",
      messageKey: "jpyc.contract.verified_historical",
    });

    const thirdPartyFindings = validateJpycDestinationV1(validDestination, {
      profile: profileWithRules(rules, thirdPartyRegistry),
      registries: new Map([[thirdPartyRegistry.id, thirdPartyRegistry]]),
      applicationConfig: config,
    });
    expect(thirdPartyFindings.map((finding) => finding.ruleId)).toEqual(["JPYC-CONTRACT-002"]);
  });

  it("can require application configuration through an explicit Profile", () => {
    const findings = validateJpycDestinationV1(validDestination, {
      profile: profileWithRules([
        { id: "JPYC-CONTRACT-001", enabled: true, params: { required: true } },
      ]),
    });
    expect(findings[0]).toMatchObject({
      ruleId: "JPYC-CONTRACT-001",
      path: "applicationConfig.tokenContract",
      messageKey: "jpyc.contract.application_config_required",
    });
  });
});

describe("JPYC Profile and Registry boundaries", () => {
  it("rejects invalid input and configuration through stable error classes", () => {
    expect(() => validateJpycDestinationV1(destinationWith({ chainId: 1.5 }))).toThrow(
      PayoutJpInputError,
    );
    expect(() =>
      validateJpycDestinationV1(validDestination, {
        applicationConfig: configWith({ environment: "staging" }),
      }),
    ).toThrow(new PayoutJpConfigurationError("PJP_CONFIG_INVALID"));
  });

  it("requires exact pinned Registry ID, version, digest, and map key", () => {
    expect(() =>
      validateJpycDestinationV1(validDestination, {
        profile: jpycCurrentMainnetProfileV1,
        registries: new Map(),
      }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_NOT_FOUND"));

    const wrongDigestProfile = {
      ...jpycCurrentMainnetProfileV1,
      registries: [{ ...officialRegistryReference, sha256: "f".repeat(64) }],
    };
    expect(() =>
      validateJpycDestinationV1(validDestination, {
        profile: wrongDigestProfile,
      }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH"));
    expect(() =>
      validateJpycDestinationV1(validDestination, {
        registries: new Map([["wrong-key", jpycOfficialMainnetRegistryV1]]),
      }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_INVALID"));
  });

  it("rejects invalid rule params, item indexes, and rail mismatches", () => {
    expect(() =>
      profileWithRules([{ id: "JPYC-ADDRESS-003", enabled: true, params: { policy: "fatal" } }]),
    ).toThrow(new PayoutJpConfigurationError("PJP_RULE_PARAMS_INVALID"));
    expect(() => validateJpycDestinationV1(validDestination, { itemIndex: -1 })).toThrow(
      new PayoutJpConfigurationError("PJP_CONFIG_INVALID"),
    );
    expect(() =>
      validateJpycDestinationV1(validDestination, {
        profile: { ...jpycCurrentMainnetProfileV1, rail: "bank_transfer" },
      }),
    ).toThrow(new PayoutJpConfigurationError("PJP_CONFIG_INVALID"));
  });

  it("exports exactly the M3 JPYC rule catalog", () => {
    expect(jpycRules.map((rule) => rule.id)).toEqual([
      "JPYC-ADDRESS-001",
      "JPYC-ADDRESS-002",
      "JPYC-ADDRESS-003",
      "JPYC-ADDRESS-004",
      "JPYC-CHAIN-001",
      "JPYC-CHAIN-002",
      "JPYC-CONTRACT-001",
      "JPYC-CONTRACT-002",
      "JPYC-CONTRACT-003",
      "JPYC-ENV-001",
    ]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  calculateRegistryEnvelopeSha256,
  canonicalizeJson,
  createItemId,
  createRuleId,
  createValidationReportV1,
  executeRules,
  type FindingV1,
  loadCompatibilityProfileV1,
  loadRegistryEnvelopeV1,
  maskBankAccountNumber,
  PayoutJpConfigurationError,
  redactAccountHolder,
  type RegistryEnvelopeV1,
  type Rule,
  type RuleContextV1,
} from "../src/index.js";

const payloadSchema = z.strictObject({
  kind: z.literal("synthetic-directory"),
  entries: z.array(z.strictObject({ code: z.string() })),
});
type Payload = z.infer<typeof payloadSchema>;

const unsignedRegistry = {
  schemaVersion: "1",
  id: "integration-directory",
  version: "2026-09-04",
  kind: "synthetic-directory",
  source: {
    publisher: "PayoutJP tests",
    uri: "urn:payoutjp:test:integration-directory",
    retrievedAt: "2026-09-04",
    notes: ["Fictional data only."],
  },
  payload: { kind: "synthetic-directory", entries: [{ code: "1234" }] },
} as const;
const registry = loadRegistryEnvelopeV1(
  { ...unsignedRegistry, sha256: calculateRegistryEnvelopeSha256(unsignedRegistry) },
  payloadSchema,
);

interface Destination {
  readonly accountNumber: string;
  readonly accountHolder: string;
}

type Context = RuleContextV1<Destination, unknown, Payload>;

function finding(
  context: Readonly<Context>,
  ruleId: string,
  severity: FindingV1["severity"],
  actual: FindingV1["actual"],
): FindingV1 {
  return {
    schemaVersion: "1",
    ruleId: createRuleId(ruleId),
    severity,
    messageKey: `${ruleId}.message`,
    message: "Synthetic integration finding.",
    path: "destination",
    location: { itemIndex: context.itemIndex },
    actual,
    profileId: context.profile.id,
    profileVersion: context.profile.version,
  };
}

const accountNumberRule: Rule<Context> = {
  id: createRuleId("TEST-ACCOUNT-001"),
  defaultSeverity: "error",
  parseParams: (input) => z.strictObject({ maximumLength: z.literal(7) }).parse(input),
  applies: () => true,
  evaluate: (context) => [
    finding(
      context,
      "TEST-ACCOUNT-001",
      "error",
      maskBankAccountNumber(context.destination.accountNumber),
    ),
  ],
};

const accountHolderRule: Rule<Context> = {
  id: createRuleId("TEST-HOLDER-001"),
  defaultSeverity: "warning",
  parseParams: (input) => z.strictObject({ required: z.literal(true) }).parse(input),
  applies: () => true,
  evaluate: (context) => [
    finding(
      context,
      "TEST-HOLDER-001",
      "warning",
      redactAccountHolder(context.destination.accountHolder),
    ),
  ],
};

const rawProfile = {
  schemaVersion: "1",
  id: "integration-profile",
  version: "1.0.0",
  status: "verified",
  rail: "bank_transfer",
  title: "Integration Profile",
  description: "Synthetic Profile for Core integration tests.",
  rules: [
    { id: "TEST-HOLDER-001", enabled: true, params: { required: true } },
    { id: "TEST-ACCOUNT-001", enabled: true, params: { maximumLength: 7 } },
  ],
  registries: [{ id: registry.id, version: registry.version, sha256: registry.sha256 }],
} as const;

const profile = loadCompatibilityProfileV1(rawProfile, {
  rules: [accountNumberRule, accountHolderRule],
});

function run(ruleOrder: readonly Rule<Context>[], reverseItems: boolean): string {
  const destination = {
    accountNumber: "0123456",
    accountHolder: "カ）秘密サンプル",
  };
  const registries: ReadonlyMap<string, RegistryEnvelopeV1<Payload>> = new Map([
    [registry.id, registry],
  ]);
  const itemId = createItemId("recipient-001");
  const findings = executeRules(ruleOrder, (rule) => {
    const configuration = profile.rules.find((entry) => entry.id === rule.id);
    if (configuration === undefined) {
      throw new PayoutJpConfigurationError("PJP_RULE_UNKNOWN");
    }
    return {
      destination,
      profile,
      params: rule.parseParams(configuration.params),
      registries,
      itemIndex: 0,
      itemId,
    };
  });
  const validatedItem = { id: itemId, index: 0, rail: "bank_transfer" as const, findings };
  const emptyItem = {
    id: createItemId("recipient-002"),
    index: 1,
    rail: "bank_transfer" as const,
    findings: [],
  };
  const items = reverseItems ? [emptyItem, validatedItem] : [validatedItem, emptyItem];
  const report = createValidationReportV1({
    tool: { name: "payoutjp", version: "0.0.0" },
    profiles: [{ id: profile.id, version: profile.version, status: profile.status }],
    registries: [{ id: registry.id, version: registry.version, sha256: registry.sha256 }],
    items,
  });

  return canonicalizeJson(report);
}

describe("Core contract integration", () => {
  it("produces byte-equivalent canonical reports under shuffled registration and item order", () => {
    const first = run([accountHolderRule, accountNumberRule], true);
    const second = run([accountNumberRule, accountHolderRule], false);

    expect(first).toBe(second);
    expect(JSON.parse(first)).toMatchObject({
      status: "FAIL",
      summary: {
        totalItems: 2,
        passedItems: 1,
        failedItems: 1,
        errors: 1,
        warnings: 1,
      },
    });
  });

  it("never includes raw sensitive destination values in canonical output", () => {
    const output = run([accountNumberRule, accountHolderRule], false);

    expect(output).not.toContain("0123456");
    expect(output).not.toContain("カ）秘密サンプル");
    expect(output).toContain("*****56");
    expect(output).toContain("<redacted>");
  });

  it("does not use the network while loading and executing local contracts", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      run([accountNumberRule, accountHolderRule], false);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("sanitizes rule-param failures at the Profile loader boundary", () => {
    const rawSensitiveValue = "raw-secret-param";
    const invalid = {
      ...rawProfile,
      rules: [
        rawProfile.rules[0],
        {
          ...rawProfile.rules[1],
          params: { maximumLength: rawSensitiveValue },
        },
      ],
    };

    try {
      loadCompatibilityProfileV1(invalid, { rules: [accountNumberRule, accountHolderRule] });
      expect.unreachable("invalid Profile params must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PayoutJpConfigurationError);
      expect((error as PayoutJpConfigurationError).code).toBe("PJP_RULE_PARAMS_INVALID");
      expect((error as Error).message).not.toContain(rawSensitiveValue);
    }
  });
});

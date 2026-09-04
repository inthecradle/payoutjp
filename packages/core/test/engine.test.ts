import { describe, expect, it } from "vitest";
import {
  CompatibilityProfileV1Schema,
  createItemId,
  createRuleId,
  executeRules,
  type FindingV1,
  PayoutJpConfigurationError,
  PayoutJpInternalError,
  type Rule,
  type RuleContextV1,
  sortFindings,
} from "../src/index.js";

const profile = CompatibilityProfileV1Schema.parse({
  schemaVersion: "1",
  id: "engine-test",
  version: "1.0.0",
  status: "verified",
  rail: "bank_transfer",
  title: "Engine test",
  description: "Synthetic Profile for deterministic engine tests.",
  rules: [],
  registries: [],
});

interface TestParams {
  readonly enabled: boolean;
}

type TestContext = RuleContextV1<{ readonly value: string }, TestParams>;

const context: TestContext = {
  destination: { value: "fixture" },
  profile,
  params: { enabled: true },
  registries: new Map(),
  itemIndex: 2,
  itemId: createItemId("item-002"),
};

function finding(
  ruleId: string,
  severity: FindingV1["severity"],
  path: string,
  location: FindingV1["location"] = { itemIndex: 2 },
): FindingV1 {
  return {
    schemaVersion: "1",
    ruleId: createRuleId(ruleId),
    severity,
    messageKey: `${ruleId}.message`,
    message: `Message for ${ruleId}`,
    path,
    location,
    profileId: profile.id,
    profileVersion: profile.version,
  };
}

function rule(
  id: string,
  findings: readonly FindingV1[],
  applies = true,
  calls?: string[],
): Rule<TestContext> {
  return {
    id: createRuleId(id),
    defaultSeverity: "warning",
    parseParams: () => ({ enabled: true }),
    applies: () => applies,
    evaluate: () => {
      calls?.push(id);
      return findings;
    },
  };
}

describe("sortFindings", () => {
  it("sorts by item, severity, RuleId, path, file, line, and column", () => {
    const inputs = [
      finding("TEST-B-001", "warning", "z", {
        itemIndex: 2,
        file: "b.json",
        line: 2,
        column: 2,
      }),
      finding("TEST-A-001", "error", "z", { itemIndex: 2 }),
      finding("TEST-A-001", "warning", "a", { itemIndex: 2 }),
      finding("TEST-A-001", "warning", "z", { itemIndex: 1 }),
      finding("TEST-A-001", "warning", "z", {
        itemIndex: 2,
        file: "a.json",
        line: 2,
        column: 3,
      }),
      finding("TEST-A-001", "warning", "z", {
        itemIndex: 2,
        file: "a.json",
        line: 1,
        column: 4,
      }),
    ];

    expect(
      sortFindings(inputs).map((entry) => [
        entry.location?.itemIndex,
        entry.severity,
        entry.ruleId,
        entry.path,
        entry.location?.file,
        entry.location?.line,
        entry.location?.column,
      ]),
    ).toEqual([
      [1, "warning", "TEST-A-001", "z", undefined, undefined, undefined],
      [2, "error", "TEST-A-001", "z", undefined, undefined, undefined],
      [2, "warning", "TEST-A-001", "a", undefined, undefined, undefined],
      [2, "warning", "TEST-A-001", "z", "a.json", 1, 4],
      [2, "warning", "TEST-A-001", "z", "a.json", 2, 3],
      [2, "warning", "TEST-B-001", "z", "b.json", 2, 2],
    ]);
  });

  it("does not mutate its input and uses a total canonical tie-break", () => {
    const second = { ...finding("TEST-A-001", "warning", "value"), message: "Second" };
    const first = { ...second, message: "First" };
    const inputs = [second, first];

    expect(sortFindings(inputs).map((entry) => entry.message)).toEqual(["First", "Second"]);
    expect(inputs.map((entry) => entry.message)).toEqual(["Second", "First"]);
  });
});

describe("executeRules", () => {
  it("executes applicable rules in stable ID order and returns sorted findings", () => {
    const calls: string[] = [];
    const ruleB = rule("TEST-B-001", [finding("TEST-B-001", "warning", "b")], true, calls);
    const ruleA = rule(
      "TEST-A-001",
      [finding("TEST-A-001", "info", "z"), finding("TEST-A-001", "error", "a")],
      true,
      calls,
    );
    const skipped = rule("TEST-C-001", [finding("TEST-C-001", "error", "c")], false, calls);

    const result = executeRules([ruleB, skipped, ruleA], () => context);

    expect(calls).toEqual(["TEST-A-001", "TEST-B-001"]);
    expect(result.map((entry) => [entry.severity, entry.ruleId])).toEqual([
      ["error", "TEST-A-001"],
      ["warning", "TEST-B-001"],
      ["info", "TEST-A-001"],
    ]);
  });

  it("rejects duplicate registered RuleIds before evaluation", () => {
    const calls: string[] = [];
    const duplicate = rule("TEST-A-001", [], true, calls);

    expect(() => executeRules([duplicate, duplicate], () => context)).toThrow(
      new PayoutJpConfigurationError("PJP_RULE_DUPLICATE"),
    );
    expect(calls).toEqual([]);
  });

  it("rejects findings attributed outside the active execution context", () => {
    const invalid = rule("TEST-A-001", [finding("TEST-B-001", "error", "value")]);

    expect(() => executeRules([invalid], () => context)).toThrow(new PayoutJpInternalError());
  });

  it("sanitizes malformed finding output and uncontrolled rule exceptions", () => {
    const malformed = rule("TEST-A-001", [
      { ...finding("TEST-A-001", "error", "value"), severity: "fatal" } as unknown as FindingV1,
    ]);
    const rawValue = "raw-account-value";
    const throwing = {
      ...rule("TEST-B-001", []),
      evaluate: () => {
        throw new Error(rawValue);
      },
    };

    expect(() => executeRules([malformed], () => context)).toThrow(new PayoutJpInternalError());
    try {
      executeRules([throwing], () => context);
      expect.unreachable("throwing rule must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PayoutJpInternalError);
      expect((error as Error).message).not.toContain(rawValue);
    }
  });
});

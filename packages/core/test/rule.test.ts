import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type CompatibilityProfileV1,
  CompatibilityProfileV1Schema,
  createItemId,
  createRegistryId,
  createRuleId,
  type FindingV1,
  type RegistryEnvelopeV1,
  type Rule,
  type RuleContextV1,
} from "../src/index.js";

interface TestDestination {
  readonly value: string;
}

interface TestParams {
  readonly minimumLength: number;
}

interface TestRegistry {
  readonly digest: string;
}

type TestContext = RuleContextV1<TestDestination, TestParams, TestRegistry>;

const profile = CompatibilityProfileV1Schema.parse({
  schemaVersion: "1",
  id: "test-profile",
  version: "1.0.0",
  status: "verified",
  rail: "bank_transfer",
  title: "Test Profile",
  description: "Profile fixture for the generic Rule contract.",
  rules: [],
  registries: [],
});

const registry: RegistryEnvelopeV1<TestRegistry> = {
  schemaVersion: "1",
  id: createRegistryId("test-registry"),
  version: "1.0.0",
  kind: "test",
  sha256: "a".repeat(64),
  source: {
    publisher: "PayoutJP tests",
    uri: "urn:payoutjp:test:rule-registry",
    retrievedAt: "2026-09-04",
  },
  payload: { digest: "abc123" },
};

const minimumLengthRule = {
  id: createRuleId("TEST-LENGTH-001"),
  defaultSeverity: "warning",
  parseParams(input: unknown): TestParams {
    if (
      typeof input !== "object" ||
      input === null ||
      !("minimumLength" in input) ||
      typeof input.minimumLength !== "number"
    ) {
      throw new TypeError("minimumLength must be a number");
    }

    return { minimumLength: input.minimumLength };
  },
  applies(context: Readonly<TestContext>): boolean {
    return context.destination.value.length > 0;
  },
  evaluate(_context: Readonly<TestContext>): readonly FindingV1[] {
    return [];
  },
} satisfies Rule<TestContext>;

const context: TestContext = {
  destination: { value: "1234" },
  profile,
  params: { minimumLength: 4 },
  registries: new Map([["directory", registry]]),
  itemIndex: 0,
  itemId: createItemId("recipient-001"),
};

describe("Rule", () => {
  it("binds parsed params to the context params type", () => {
    expect(minimumLengthRule.parseParams({ minimumLength: 4 })).toEqual({ minimumLength: 4 });
    expect(() => minimumLengthRule.parseParams({ minimumLength: "4" })).toThrow(
      new TypeError("minimumLength must be a number"),
    );

    expectTypeOf<ReturnType<Rule<TestContext>["parseParams"]>>().toEqualTypeOf<TestParams>();
  });

  it("supports pure synchronous applicability and evaluation", () => {
    expect(minimumLengthRule.applies(context)).toBe(true);
    expect(minimumLengthRule.evaluate(context)).toEqual([]);

    expectTypeOf<ReturnType<Rule<TestContext>["applies"]>>().toEqualTypeOf<boolean>();
    expectTypeOf<ReturnType<Rule<TestContext>["evaluate"]>>().toEqualTypeOf<readonly FindingV1[]>();
  });

  it("uses the Profile contract while keeping Registry values generic", () => {
    expect(context.profile).toBe(profile);
    expect(context.registries.get("directory")).toBe(registry);

    expectTypeOf(context.profile).toEqualTypeOf<CompatibilityProfileV1>();
    expectTypeOf(context.registries).toEqualTypeOf<
      ReadonlyMap<string, RegistryEnvelopeV1<TestRegistry>>
    >();
  });
});

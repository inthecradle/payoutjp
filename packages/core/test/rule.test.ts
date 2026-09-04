import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createItemId,
  createRuleId,
  type FindingV1,
  type Rule,
  type RuleContextV1,
} from "../src/index.js";

interface TestDestination {
  readonly value: string;
}

interface TestParams {
  readonly minimumLength: number;
}

interface TestProfile {
  readonly version: string;
}

interface TestRegistry {
  readonly digest: string;
}

type TestContext = RuleContextV1<TestDestination, TestParams, TestProfile, TestRegistry>;

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
  profile: { version: "1.0.0" },
  params: { minimumLength: 4 },
  registries: new Map([["directory", { digest: "abc123" }]]),
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

  it("keeps Profile and Registry values generic for their dedicated contracts", () => {
    expect(context.profile).toEqual({ version: "1.0.0" });
    expect(context.registries.get("directory")).toEqual({ digest: "abc123" });

    expectTypeOf(context.profile).toEqualTypeOf<TestProfile>();
    expectTypeOf(context.registries).toEqualTypeOf<ReadonlyMap<string, TestRegistry>>();
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  type FindingV1,
  FindingV1Schema,
  type ProfileId,
  type RuleId,
  safeObservedValueClassificationValues,
} from "../src/index.js";

const minimalFinding = {
  schemaVersion: "1",
  ruleId: "CORE-SCHEMA-001",
  severity: "error",
  messageKey: "input.schema_invalid",
  message: "Input does not match the declared schema.",
  path: "destination",
  profileId: "bank-generic-jp",
  profileVersion: "0.1.0",
} as const;

describe("FindingV1Schema", () => {
  it("parses a minimal finding and brands its identifiers", () => {
    const finding = FindingV1Schema.parse(minimalFinding);

    expect(finding).toEqual(minimalFinding);
    expectTypeOf(finding).toEqualTypeOf<FindingV1>();
    expectTypeOf(finding.ruleId).toEqualTypeOf<RuleId>();
    expectTypeOf(finding.profileId).toEqualTypeOf<ProfileId>();
  });

  it("parses every optional safe field", () => {
    const finding = FindingV1Schema.parse({
      ...minimalFinding,
      location: {
        file: "fixtures/recipient.json",
        line: 1,
        column: 2,
        itemIndex: 0,
        jsonPointer: "/destination/bankCode",
      },
      actual: {
        classification: "masked-bank-account",
        display: "*****56",
      },
      expected: "seven ASCII digits",
      remediation: {
        code: "review-source",
        message: "Review the value against its source of truth.",
      },
    });

    expect(finding.location?.itemIndex).toBe(0);
    expect(finding.actual?.display).toBe("*****56");
  });

  it.each(safeObservedValueClassificationValues)("accepts observed classification %s", (value) => {
    const result = FindingV1Schema.safeParse({
      ...minimalFinding,
      actual: { classification: value, display: "safe" },
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["schema version", { schemaVersion: "2" }],
    ["rule ID", { ruleId: "core-schema-001" }],
    ["severity", { severity: "fatal" }],
    ["profile ID", { profileId: " bank-generic-jp" }],
    ["classification", { actual: { classification: "raw", display: "value" } }],
  ])("rejects an invalid %s", (_case, override) => {
    expect(FindingV1Schema.safeParse({ ...minimalFinding, ...override }).success).toBe(false);
  });

  it.each([
    ["zero line", { line: 0 }],
    ["fractional column", { column: 1.5 }],
    ["negative item index", { itemIndex: -1 }],
    ["absolute path", { file: "/tmp/recipient.json" }],
    ["Windows absolute path", { file: "C:/customer/recipient.json" }],
    ["parent traversal", { file: "fixtures/../recipient.json" }],
    ["backslash path", { file: "fixtures\\recipient.json" }],
    ["invalid JSON Pointer", { jsonPointer: "destination/bankCode" }],
  ])("rejects invalid location: %s", (_case, location) => {
    expect(FindingV1Schema.safeParse({ ...minimalFinding, location }).success).toBe(false);
  });

  it("accepts the empty JSON Pointer for the document root", () => {
    const result = FindingV1Schema.safeParse({
      ...minimalFinding,
      location: { jsonPointer: "" },
    });

    expect(result.success).toBe(true);
  });

  it("does not echo an invalid identifier value in validation errors", () => {
    const sensitiveValue = "sensitive invalid rule id";
    const result = FindingV1Schema.safeParse({ ...minimalFinding, ruleId: sensitiveValue });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain(sensitiveValue);
    }
  });

  it.each([
    { ...minimalFinding, unexpected: true },
    { ...minimalFinding, location: { line: 1, unexpected: true } },
    { ...minimalFinding, actual: { classification: "public", display: "safe", unexpected: true } },
    { ...minimalFinding, remediation: { code: "review", message: "Review.", unexpected: true } },
  ])("rejects unknown fields instead of silently stripping them", (input) => {
    expect(FindingV1Schema.safeParse(input).success).toBe(false);
  });

  it("is the source of truth for the exported FindingV1 type", () => {
    expectTypeOf<FindingV1>().toEqualTypeOf<z.infer<typeof FindingV1Schema>>();
  });
});

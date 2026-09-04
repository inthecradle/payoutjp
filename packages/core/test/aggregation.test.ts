import { describe, expect, it } from "vitest";
import {
  aggregateItemStatus,
  aggregateReportStatus,
  createItemId,
  createProfileId,
  createRuleId,
  type FindingV1,
  summarizeValidationItems,
  ValidationReportV1Schema,
} from "../src/index.js";

function finding(severity: FindingV1["severity"], suffix: string): FindingV1 {
  return {
    schemaVersion: "1",
    ruleId: createRuleId(`TEST-AGGREGATE-${suffix}`),
    severity,
    messageKey: `aggregate.${suffix}`,
    message: `Synthetic ${severity} finding.`,
    path: "destination.value",
    profileId: createProfileId("aggregation-test"),
    profileVersion: "1.0.0",
  };
}

const info = finding("info", "INFO");
const warning = finding("warning", "WARNING");
const error = finding("error", "ERROR");

describe("status aggregation", () => {
  it.each([
    [[], "PASS"],
    [[info], "PASS"],
    [[warning, info], "WARNING"],
    [[error, warning, info], "FAIL"],
  ] as const)("derives item status from finding severity", (findings, expected) => {
    expect(aggregateItemStatus(findings)).toBe(expected);
  });

  it.each([
    [[], "PASS"],
    [["PASS", "PASS"], "PASS"],
    [["PASS", "WARNING"], "WARNING"],
    [["WARNING", "FAIL"], "FAIL"],
  ] as const)("derives report status from item statuses", (statuses, expected) => {
    expect(aggregateReportStatus(statuses)).toBe(expected);
  });

  it("counts item outcomes and every finding severity", () => {
    const items = [
      { findings: [info] },
      { findings: [warning, info] },
      { findings: [error, warning] },
    ];

    expect(summarizeValidationItems(items)).toEqual({
      totalItems: 3,
      passedItems: 1,
      warningItems: 1,
      failedItems: 1,
      errors: 1,
      warnings: 2,
      infos: 2,
    });
  });
});

describe("ValidationReportV1 aggregation invariants", () => {
  const item = {
    id: createItemId("recipient-001"),
    index: 0,
    rail: "bank_transfer" as const,
    status: "WARNING" as const,
    findings: [warning],
  };
  const report = {
    schemaVersion: "1" as const,
    tool: { name: "payoutjp" as const, version: "0.0.0" },
    status: "WARNING" as const,
    profiles: [],
    registries: [],
    summary: summarizeValidationItems([item]),
    items: [item],
  };

  it("accepts a report derived from its findings", () => {
    expect(ValidationReportV1Schema.safeParse(report).success).toBe(true);
  });

  it.each([
    ["item status", { items: [{ ...item, status: "PASS" }] }],
    ["report status", { status: "PASS" }],
    ["item count", { summary: { ...report.summary, totalItems: 2 } }],
    ["severity count", { summary: { ...report.summary, warnings: 2 } }],
  ])("rejects an inconsistent %s", (_case, override) => {
    expect(ValidationReportV1Schema.safeParse({ ...report, ...override }).success).toBe(false);
  });
});

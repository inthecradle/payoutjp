import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  createProfileId,
  createRegistryId,
  type ItemId,
  type ProfileId,
  type RegistryId,
  type ValidationReportV1,
  ValidationReportV1Schema,
  sortProfileReferences,
  sortRegistryReferences,
} from "../src/index.js";

const registryDigest = "a".repeat(64);

const finding = {
  schemaVersion: "1",
  ruleId: "BANK-CODE-001",
  severity: "warning",
  messageKey: "bank.code_format",
  message: "Bank code should use four ASCII digits.",
  path: "destination.bankCode",
  profileId: "bank-generic-jp",
  profileVersion: "0.1.0",
} as const;

const validReport = {
  schemaVersion: "1",
  tool: { name: "payoutjp", version: "0.0.0" },
  notices: [],
  status: "WARNING",
  profiles: [{ id: "bank-generic-jp", version: "0.1.0", status: "verified" }],
  registries: [{ id: "synthetic-bank-directory", version: "1", sha256: registryDigest }],
  summary: {
    totalItems: 1,
    passedItems: 0,
    warningItems: 1,
    failedItems: 0,
    errors: 0,
    warnings: 1,
    infos: 0,
  },
  items: [
    {
      id: "recipient-001",
      index: 0,
      rail: "bank_transfer",
      status: "WARNING",
      findings: [finding],
    },
  ],
} as const;

describe("ValidationReportV1Schema", () => {
  it("parses a complete canonical report and brands reference identifiers", () => {
    const report = ValidationReportV1Schema.parse(validReport);
    const item = report.items[0];
    const profile = report.profiles[0];
    const registry = report.registries[0];

    expect(report).toEqual(validReport);
    expect(item).toBeDefined();
    expect(profile).toBeDefined();
    expect(registry).toBeDefined();
    if (item === undefined || profile === undefined || registry === undefined) {
      throw new Error("fixture must contain one item, profile, and registry");
    }
    expectTypeOf(report).toEqualTypeOf<ValidationReportV1>();
    expectTypeOf(item.id).toEqualTypeOf<ItemId>();
    expectTypeOf(profile.id).toEqualTypeOf<ProfileId>();
    expectTypeOf(registry.id).toEqualTypeOf<RegistryId>();
  });

  it("accepts an empty PASS report", () => {
    const result = ValidationReportV1Schema.safeParse({
      ...validReport,
      status: "PASS",
      profiles: [],
      registries: [],
      summary: {
        totalItems: 0,
        passedItems: 0,
        warningItems: 0,
        failedItems: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
      },
      items: [],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["schema version", { schemaVersion: "2" }],
    ["tool name", { tool: { name: "other", version: "0.0.0" } }],
    ["empty tool version", { tool: { name: "payoutjp", version: "" } }],
    ["report status", { status: "ERROR" }],
  ])("rejects invalid top-level %s", (_case, override) => {
    expect(ValidationReportV1Schema.safeParse({ ...validReport, ...override }).success).toBe(false);
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
  ])("rejects %s summary counts", (_case, errors) => {
    const result = ValidationReportV1Schema.safeParse({
      ...validReport,
      summary: { ...validReport.summary, errors },
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ["empty item ID", { id: "" }],
    ["negative item index", { index: -1 }],
    ["fractional item index", { index: 0.5 }],
    ["unknown rail", { rail: "card" }],
    ["unknown item status", { status: "ERROR" }],
  ])("rejects invalid item data: %s", (_case, itemOverride) => {
    const result = ValidationReportV1Schema.safeParse({
      ...validReport,
      items: [{ ...validReport.items[0], ...itemOverride }],
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ["empty profile ID", { profiles: [{ id: "", version: "1", status: "verified" }] }],
    ["empty profile version", { profiles: [{ id: "profile", version: "", status: "verified" }] }],
    ["unknown profile status", { profiles: [{ id: "profile", version: "1", status: "active" }] }],
    [
      "invalid registry digest",
      { registries: [{ id: "registry", version: "1", sha256: "ABC123" }] },
    ],
  ])("rejects invalid reference data: %s", (_case, override) => {
    expect(ValidationReportV1Schema.safeParse({ ...validReport, ...override }).success).toBe(false);
  });

  it.each([
    ["profile", "profiles", validReport.profiles[0]],
    ["registry", "registries", validReport.registries[0]],
  ] as const)("rejects an exact duplicate %s reference", (_kind, field, reference) => {
    const result = ValidationReportV1Schema.safeParse({
      ...validReport,
      [field]: [reference, reference],
    });

    expect(result.success).toBe(false);
  });

  it("allows two versions of the same reference ID", () => {
    const result = ValidationReportV1Schema.safeParse({
      ...validReport,
      profiles: [validReport.profiles[0], { ...validReport.profiles[0], version: "0.2.0" }],
      registries: [validReport.registries[0], { ...validReport.registries[0], version: "2" }],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    { ...validReport, timestamp: "2026-09-04T00:00:00Z" },
    { ...validReport, tool: { ...validReport.tool, unexpected: true } },
    { ...validReport, summary: { ...validReport.summary, unexpected: true } },
    { ...validReport, items: [{ ...validReport.items[0], unexpected: true }] },
    { ...validReport, profiles: [{ ...validReport.profiles[0], unexpected: true }] },
    { ...validReport, registries: [{ ...validReport.registries[0], unexpected: true }] },
  ])("rejects unknown fields at every report level", (input) => {
    expect(ValidationReportV1Schema.safeParse(input).success).toBe(false);
  });

  it("rejects summary and status values inconsistent with item findings", () => {
    const result = ValidationReportV1Schema.safeParse({
      ...validReport,
      status: "PASS",
      summary: { ...validReport.summary, totalItems: 99 },
    });

    expect(result.success).toBe(false);
  });

  it("is the source of truth for the exported ValidationReportV1 type", () => {
    expectTypeOf<ValidationReportV1>().toEqualTypeOf<z.infer<typeof ValidationReportV1Schema>>();
  });

  it("sorts versioned references without mutating caller arrays", () => {
    const profiles = [
      { id: createProfileId("z-profile"), version: "1", status: "verified" as const },
      { id: createProfileId("a-profile"), version: "2", status: "deprecated" as const },
      { id: createProfileId("a-profile"), version: "1", status: "verified" as const },
    ];
    const registries = [
      { id: createRegistryId("z-registry"), version: "1", sha256: "a".repeat(64) },
      { id: createRegistryId("a-registry"), version: "2", sha256: "b".repeat(64) },
      { id: createRegistryId("a-registry"), version: "1", sha256: "c".repeat(64) },
    ];

    expect(sortProfileReferences(profiles).map(({ id, version }) => `${id}@${version}`)).toEqual([
      "a-profile@1",
      "a-profile@2",
      "z-profile@1",
    ]);
    expect(sortRegistryReferences(registries).map(({ id, version }) => `${id}@${version}`)).toEqual(
      ["a-registry@1", "a-registry@2", "z-registry@1"],
    );
    expect(profiles[0]?.id).toBe("z-profile");
    expect(registries[0]?.id).toBe("z-registry");
  });
});

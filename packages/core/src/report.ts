import { z } from "zod";
import {
  aggregateItemStatus,
  aggregateReportStatus,
  summarizeValidationItems,
} from "./aggregation.js";
import { sortFindings } from "./engine.js";
import { FindingV1Schema, type FindingV1 } from "./finding.js";
import { ItemIdSchema, ProfileIdSchema, RegistryIdSchema } from "./identifier-schema.js";
import { itemStatusValues, profileStatusValues } from "./status.js";

/** Canonical payout rails represented in a validation report. */
export const railValues = Object.freeze(["bank_transfer", "jpyc"] as const);

/** Payout destination rail represented in a validation report. */
export type Rail = (typeof railValues)[number];

const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NonEmptyStringSchema = z.string().min(1);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "Expected a lowercase SHA-256 digest");

/** Runtime schema for one validated item and its findings. */
export const ValidationItemReportV1Schema = z.strictObject({
  id: ItemIdSchema,
  index: NonNegativeIntegerSchema,
  rail: z.enum(railValues),
  status: z.enum(itemStatusValues),
  findings: z.array(FindingV1Schema),
});

/** One validated item and its findings. */
export type ValidationItemReportV1 = z.infer<typeof ValidationItemReportV1Schema>;

/** Runtime schema for report summary counts before semantic aggregation checks. */
export const ValidationSummaryV1Schema = z.strictObject({
  totalItems: NonNegativeIntegerSchema,
  passedItems: NonNegativeIntegerSchema,
  warningItems: NonNegativeIntegerSchema,
  failedItems: NonNegativeIntegerSchema,
  errors: NonNegativeIntegerSchema,
  warnings: NonNegativeIntegerSchema,
  infos: NonNegativeIntegerSchema,
});

/** Summary counts for a validation report. */
export type ValidationSummaryV1 = z.infer<typeof ValidationSummaryV1Schema>;

/** Runtime schema for the tool identity embedded in canonical reports. */
export const ToolReferenceV1Schema = z.strictObject({
  name: z.literal("payoutjp"),
  version: NonEmptyStringSchema,
});

/** Tool identity embedded in a canonical report. */
export type ToolReferenceV1 = z.infer<typeof ToolReferenceV1Schema>;

/** Runtime schema for a compatibility profile reference. */
export const ProfileReferenceV1Schema = z.strictObject({
  id: ProfileIdSchema,
  version: NonEmptyStringSchema,
  status: z.enum(profileStatusValues),
});

/** Compatibility profile reference embedded in a report. */
export type ProfileReferenceV1 = z.infer<typeof ProfileReferenceV1Schema>;

/** Runtime schema for a content-addressed registry reference. */
export const RegistryReferenceV1Schema = z.strictObject({
  id: RegistryIdSchema,
  version: NonEmptyStringSchema,
  sha256: Sha256Schema,
});

/** Content-addressed registry reference embedded in a report. */
export type RegistryReferenceV1 = z.infer<typeof RegistryReferenceV1Schema>;

function rejectDuplicateReferences(
  references: readonly { id: string; version: string }[],
  context: z.RefinementCtx,
  kind: "profile" | "registry",
): void {
  const seen = new Set<string>();

  references.forEach((reference, index) => {
    const key = `${reference.id}\0${reference.version}`;
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate ${kind} reference`,
        path: [index],
      });
    }
    seen.add(key);
  });
}

const ProfileReferencesSchema = z
  .array(ProfileReferenceV1Schema)
  .superRefine((references, context) => rejectDuplicateReferences(references, context, "profile"));

const RegistryReferencesSchema = z
  .array(RegistryReferenceV1Schema)
  .superRefine((references, context) => rejectDuplicateReferences(references, context, "registry"));

/** Runtime schema for the canonical version 1 validation report contract. */
const summaryFields = Object.freeze([
  "totalItems",
  "passedItems",
  "warningItems",
  "failedItems",
  "errors",
  "warnings",
  "infos",
] as const);

/** Runtime schema for a structurally and semantically consistent version 1 validation report. */
export const ValidationReportV1Schema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    tool: ToolReferenceV1Schema,
    status: z.enum(itemStatusValues),
    profiles: ProfileReferencesSchema,
    registries: RegistryReferencesSchema,
    summary: ValidationSummaryV1Schema,
    items: z.array(ValidationItemReportV1Schema),
  })
  .superRefine((report, context) => {
    const itemStatuses = report.items.map((item, index) => {
      const expected = aggregateItemStatus(item.findings);
      if (item.status !== expected) {
        context.addIssue({
          code: "custom",
          message: "Item status does not match its findings",
          path: ["items", index, "status"],
        });
      }
      return expected;
    });

    const expectedStatus = aggregateReportStatus(itemStatuses);
    if (report.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        message: "Report status does not match its items",
        path: ["status"],
      });
    }

    const expectedSummary = summarizeValidationItems(report.items);
    for (const field of summaryFields) {
      if (report.summary[field] !== expectedSummary[field]) {
        context.addIssue({
          code: "custom",
          message: "Report summary does not match its items",
          path: ["summary", field],
        });
      }
    }
  });

/** Canonical version 1 validation report inferred from {@link ValidationReportV1Schema}. */
export type ValidationReportV1 = z.infer<typeof ValidationReportV1Schema>;

/** Item input for canonical report construction; status is always derived. */
export interface ValidationItemInputV1 {
  readonly id: ValidationItemReportV1["id"];
  readonly index: number;
  readonly rail: Rail;
  readonly findings: readonly FindingV1[];
}

/** Inputs whose ordering and aggregate fields are normalized by the report builder. */
export interface CreateValidationReportV1Input {
  readonly tool: ToolReferenceV1;
  readonly profiles: readonly ProfileReferenceV1[];
  readonly registries: readonly RegistryReferenceV1[];
  readonly items: readonly ValidationItemInputV1[];
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVersionedReferences(
  left: { readonly id: string; readonly version: string },
  right: { readonly id: string; readonly version: string },
): number {
  return compareStrings(left.id, right.id) || compareStrings(left.version, right.version);
}

/** Returns Profile references sorted by ID and then version. */
export function sortProfileReferences(
  profiles: readonly ProfileReferenceV1[],
): readonly ProfileReferenceV1[] {
  return [...profiles].sort(compareVersionedReferences);
}

/** Returns Registry references sorted by ID and then version. */
export function sortRegistryReferences(
  registries: readonly RegistryReferenceV1[],
): readonly RegistryReferenceV1[] {
  return [...registries].sort(compareVersionedReferences);
}

/** Builds a validated canonical report with stable ordering and derived aggregate fields. */
export function createValidationReportV1(input: CreateValidationReportV1Input): ValidationReportV1 {
  const items = input.items
    .map((item): ValidationItemReportV1 => {
      const findings = [...sortFindings(item.findings)];
      return {
        id: item.id,
        index: item.index,
        rail: item.rail,
        status: aggregateItemStatus(findings),
        findings,
      };
    })
    .sort((left, right) => left.index - right.index || compareStrings(left.id, right.id));
  const itemStatuses = items.map((item) => item.status);

  return ValidationReportV1Schema.parse({
    schemaVersion: "1",
    tool: input.tool,
    status: aggregateReportStatus(itemStatuses),
    profiles: sortProfileReferences(input.profiles),
    registries: sortRegistryReferences(input.registries),
    summary: summarizeValidationItems(items),
    items,
  });
}

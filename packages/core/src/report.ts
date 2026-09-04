import { z } from "zod";
import { FindingV1Schema } from "./finding.js";
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
export const ValidationReportV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  tool: ToolReferenceV1Schema,
  status: z.enum(itemStatusValues),
  profiles: ProfileReferencesSchema,
  registries: RegistryReferencesSchema,
  summary: ValidationSummaryV1Schema,
  items: z.array(ValidationItemReportV1Schema),
});

/** Canonical version 1 validation report inferred from {@link ValidationReportV1Schema}. */
export type ValidationReportV1 = z.infer<typeof ValidationReportV1Schema>;

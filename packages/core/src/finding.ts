import { z } from "zod";
import { createProfileId, createRuleId, type ProfileId, type RuleId } from "./identifiers.js";
import { severityValues } from "./status.js";

function parseRuleId(value: string, context: z.RefinementCtx): RuleId {
  try {
    return createRuleId(value);
  } catch {
    context.addIssue({ code: "custom", message: "Invalid RuleId" });
    return z.NEVER;
  }
}

function parseProfileId(value: string, context: z.RefinementCtx): ProfileId {
  try {
    return createProfileId(value);
  } catch {
    context.addIssue({ code: "custom", message: "Invalid ProfileId" });
    return z.NEVER;
  }
}

function isNormalizedRelativePath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\")) {
    return false;
  }

  if (/^[A-Za-z]:\//u.test(value)) {
    return false;
  }

  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

const RuleIdSchema = z.string().transform(parseRuleId);
const ProfileIdSchema = z.string().transform(parseProfileId);
const NormalizedRelativePathSchema = z
  .string()
  .refine(isNormalizedRelativePath, "Expected a normalized relative path");
const JsonPointerSchema = z
  .string()
  .refine((value) => value === "" || value.startsWith("/"), "Expected a JSON Pointer");

/** Runtime schema for a safe source or item location attached to a finding. */
export const FindingLocationV1Schema = z.strictObject({
  file: NormalizedRelativePathSchema.optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  itemIndex: z.number().int().nonnegative().optional(),
  jsonPointer: JsonPointerSchema.optional(),
});

/** Safe source or item location attached to a finding. */
export type FindingLocationV1 = z.infer<typeof FindingLocationV1Schema>;

/** Allowed disclosure classifications for already-safe observed values. */
export const safeObservedValueClassificationValues = Object.freeze([
  "public",
  "masked-bank-account",
  "redacted-account-holder",
  "short-wallet-address",
  "metadata-only",
] as const);

/**
 * Runtime schema for an observed value that has already passed the applicable redaction policy.
 * Shape validation does not itself redact or prove that `display` is safe.
 */
export const SafeObservedValueV1Schema = z.strictObject({
  classification: z.enum(safeObservedValueClassificationValues),
  display: z.string(),
});

/** Observed value safe for normal reports after policy-specific redaction. */
export type SafeObservedValueV1 = z.infer<typeof SafeObservedValueV1Schema>;

/** Runtime schema for deterministic remediation guidance. */
export const RemediationV1Schema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

/** Deterministic remediation guidance attached to a finding. */
export type RemediationV1 = z.infer<typeof RemediationV1Schema>;

/** Runtime schema for the version 1 validation finding contract. */
export const FindingV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  ruleId: RuleIdSchema,
  severity: z.enum(severityValues),
  messageKey: z.string(),
  message: z.string(),
  path: z.string(),
  location: FindingLocationV1Schema.optional(),
  actual: SafeObservedValueV1Schema.optional(),
  expected: z.string().optional(),
  remediation: RemediationV1Schema.optional(),
  profileId: ProfileIdSchema,
  profileVersion: z.string(),
});

/** Version 1 validation finding inferred from {@link FindingV1Schema}. */
export type FindingV1 = z.infer<typeof FindingV1Schema>;

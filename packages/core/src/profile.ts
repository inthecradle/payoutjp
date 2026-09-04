import { z } from "zod";
import { PayoutJpConfigurationError } from "./errors.js";
import { ProfileIdSchema, RuleIdSchema } from "./identifier-schema.js";
import { railValues, RegistryReferenceV1Schema } from "./report.js";
import { profileStatusValues, severityValues } from "./status.js";

const NonEmptyStringSchema = z.string().min(1);

/** Runtime schema for one rule entry in a compatibility profile. */
export const RuleConfigurationV1Schema = z.strictObject({
  id: RuleIdSchema,
  enabled: z.boolean(),
  severity: z.enum(severityValues).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** One rule entry in a compatibility profile. */
export type RuleConfigurationV1 = z.infer<typeof RuleConfigurationV1Schema>;

function rejectDuplicateIds(
  entries: readonly { id: string }[],
  context: z.RefinementCtx,
  kind: "rule" | "registry",
): void {
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    if (seen.has(entry.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate ${kind} ID`,
        path: [index, "id"],
      });
    }
    seen.add(entry.id);
  });
}

const ProfileRulesSchema = z
  .array(RuleConfigurationV1Schema)
  .superRefine((rules, context) => rejectDuplicateIds(rules, context, "rule"));

const ProfileRegistriesSchema = z
  .array(RegistryReferenceV1Schema)
  .superRefine((registries, context) => rejectDuplicateIds(registries, context, "registry"));

/** Runtime schema for an immutable version 1 compatibility profile artifact. */
export const CompatibilityProfileV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  id: ProfileIdSchema,
  version: NonEmptyStringSchema,
  status: z.enum(profileStatusValues),
  rail: z.enum(railValues),
  title: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  rules: ProfileRulesSchema,
  registries: ProfileRegistriesSchema,
  sourceNotes: z.array(NonEmptyStringSchema).optional(),
});

/** Version 1 compatibility profile inferred from {@link CompatibilityProfileV1Schema}. */
export type CompatibilityProfileV1 = z.infer<typeof CompatibilityProfileV1Schema>;

/** Minimal rule capability required while loading a Profile. */
export interface ProfileRuleParameterParser {
  readonly id: RuleConfigurationV1["id"];
  parseParams(input: unknown): unknown;
}

/** Explicit policy and rule catalog used to load one Profile artifact. */
export interface LoadCompatibilityProfileV1Options {
  readonly rules: Iterable<ProfileRuleParameterParser>;
  readonly allowExperimental?: boolean;
  readonly allowRetired?: boolean;
}

function indexRuleParsers(
  rules: Iterable<ProfileRuleParameterParser>,
): ReadonlyMap<string, ProfileRuleParameterParser> {
  const parsers = new Map<string, ProfileRuleParameterParser>();

  for (const rule of rules) {
    if (parsers.has(rule.id)) {
      throw new PayoutJpConfigurationError("PJP_RULE_DUPLICATE");
    }
    parsers.set(rule.id, rule);
  }

  return parsers;
}

/**
 * Loads and validates a decoded Profile without file or network access.
 *
 * Rule-specific parameter errors are deliberately replaced with a fixed safe
 * message so a parser cannot leak raw Profile values through this boundary.
 */
export function loadCompatibilityProfileV1(
  input: unknown,
  options: LoadCompatibilityProfileV1Options,
): CompatibilityProfileV1 {
  const parsed = CompatibilityProfileV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new PayoutJpConfigurationError("PJP_PROFILE_INVALID");
  }
  const profile = parsed.data;

  if (profile.status === "experimental" && options.allowExperimental !== true) {
    throw new PayoutJpConfigurationError("PJP_PROFILE_STATUS_NOT_ALLOWED");
  }
  if (profile.status === "retired" && options.allowRetired !== true) {
    throw new PayoutJpConfigurationError("PJP_PROFILE_STATUS_NOT_ALLOWED");
  }

  const parsers = indexRuleParsers(options.rules);

  for (const configuration of profile.rules) {
    const rule = parsers.get(configuration.id);
    if (rule === undefined) {
      throw new PayoutJpConfigurationError("PJP_RULE_UNKNOWN");
    }

    try {
      rule.parseParams(configuration.params);
    } catch {
      throw new PayoutJpConfigurationError("PJP_RULE_PARAMS_INVALID");
    }
  }

  return profile;
}

import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  type CompatibilityProfileV1,
  CompatibilityProfileV1Schema,
  loadCompatibilityProfileV1,
  type ProfileId,
  type RegistryId,
  type RuleConfigurationV1,
  type RuleId,
} from "../src/index.js";

const registryDigest = "a".repeat(64);

const validProfile = {
  schemaVersion: "1",
  id: "bank-generic-jp",
  version: "0.1.0",
  status: "verified",
  rail: "bank_transfer",
  title: "Generic Japanese bank transfer",
  description: "Conservative structural validation for Japanese bank transfer destinations.",
  rules: [
    {
      id: "BANK-CODE-001",
      enabled: true,
      severity: "error",
      params: { asciiDigits: 4 },
    },
  ],
  registries: [
    {
      id: "synthetic-bank-directory",
      version: "2026-09-04",
      sha256: registryDigest,
    },
  ],
  sourceNotes: ["Conservative structural rules only."],
} as const;

const bankCodeRule = {
  id: "BANK-CODE-001" as RuleId,
  parseParams: (input: unknown) =>
    z.strictObject({ asciiDigits: z.number().int().positive() }).parse(input),
};

const load = (
  input: unknown,
  options: { readonly allowExperimental?: boolean; readonly allowRetired?: boolean } = {},
) => loadCompatibilityProfileV1(input, { rules: [bankCodeRule], ...options });

describe("CompatibilityProfileV1Schema", () => {
  it("parses a complete Profile and brands all identifiers", () => {
    const profile = CompatibilityProfileV1Schema.parse(validProfile);
    const rule = profile.rules[0];
    const registry = profile.registries[0];

    expect(profile).toEqual(validProfile);
    expect(rule).toBeDefined();
    expect(registry).toBeDefined();
    if (rule === undefined || registry === undefined) {
      throw new Error("fixture must contain one rule and registry");
    }

    expectTypeOf(profile).toEqualTypeOf<CompatibilityProfileV1>();
    expectTypeOf(profile.id).toEqualTypeOf<ProfileId>();
    expectTypeOf(rule.id).toEqualTypeOf<RuleId>();
    expectTypeOf(registry.id).toEqualTypeOf<RegistryId>();
  });

  it("accepts a minimal Profile without rules, registries, or source notes", () => {
    const result = CompatibilityProfileV1Schema.safeParse({
      ...validProfile,
      rules: [],
      registries: [],
      sourceNotes: undefined,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["schema version", { schemaVersion: "2" }],
    ["empty Profile ID", { id: "" }],
    ["empty version", { version: "" }],
    ["unknown status", { status: "active" }],
    ["unknown rail", { rail: "card" }],
    ["empty title", { title: "" }],
    ["empty description", { description: "" }],
    ["empty source note", { sourceNotes: [""] }],
  ])("rejects invalid Profile metadata: %s", (_case, override) => {
    expect(CompatibilityProfileV1Schema.safeParse({ ...validProfile, ...override }).success).toBe(
      false,
    );
  });

  it.each([
    ["malformed rule ID", { id: "bank-code-001" }],
    ["non-boolean enabled", { enabled: "true" }],
    ["unknown severity", { severity: "fatal" }],
    ["non-record params", { params: [4] }],
  ])("rejects invalid rule configuration: %s", (_case, override) => {
    const result = CompatibilityProfileV1Schema.safeParse({
      ...validProfile,
      rules: [{ ...validProfile.rules[0], ...override }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid Registry references", () => {
    const result = CompatibilityProfileV1Schema.safeParse({
      ...validProfile,
      registries: [{ ...validProfile.registries[0], sha256: "ABC123" }],
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ["rule", { rules: [validProfile.rules[0], validProfile.rules[0]] }],
    [
      "Registry",
      {
        registries: [
          validProfile.registries[0],
          { ...validProfile.registries[0], version: "2026-09-05", sha256: "b".repeat(64) },
        ],
      },
    ],
  ])("rejects duplicate %s IDs", (_case, override) => {
    expect(CompatibilityProfileV1Schema.safeParse({ ...validProfile, ...override }).success).toBe(
      false,
    );
  });

  it.each([
    { ...validProfile, unexpected: true },
    { ...validProfile, rules: [{ ...validProfile.rules[0], unexpected: true }] },
    { ...validProfile, registries: [{ ...validProfile.registries[0], unexpected: true }] },
  ])("rejects unknown fields at every Profile contract level", (input) => {
    expect(CompatibilityProfileV1Schema.safeParse(input).success).toBe(false);
  });

  it("is the source of truth for exported Profile types", () => {
    expectTypeOf<CompatibilityProfileV1>().toEqualTypeOf<
      z.infer<typeof CompatibilityProfileV1Schema>
    >();
    expectTypeOf<RuleConfigurationV1>().toEqualTypeOf<
      z.infer<typeof import("../src/index.js").RuleConfigurationV1Schema>
    >();
  });
});

describe("loadCompatibilityProfileV1", () => {
  it("loads a verified Profile after validating rule-specific params", () => {
    expect(load(validProfile)).toEqual(validProfile);
  });

  it("allows deprecated Profiles for reproducible past runs", () => {
    expect(load({ ...validProfile, status: "deprecated" }).status).toBe("deprecated");
  });

  it("requires explicit permission for experimental and retired Profiles", () => {
    const experimental = { ...validProfile, status: "experimental" };
    const retired = { ...validProfile, status: "retired" };

    expect(() => load(experimental)).toThrow(
      new TypeError("Experimental Profiles must be explicitly enabled"),
    );
    expect(load(experimental, { allowExperimental: true }).status).toBe("experimental");
    expect(() => load(retired)).toThrow(
      new TypeError("Retired Profiles must be explicitly enabled"),
    );
    expect(load(retired, { allowRetired: true }).status).toBe("retired");
  });

  it("rejects unknown Profile rule IDs", () => {
    expect(() => loadCompatibilityProfileV1(validProfile, { rules: [] })).toThrow(
      new TypeError("Profile references an unknown RuleId"),
    );
  });

  it("rejects duplicate registered rule IDs", () => {
    expect(() =>
      loadCompatibilityProfileV1(validProfile, { rules: [bankCodeRule, bankCodeRule] }),
    ).toThrow(new TypeError("Duplicate registered RuleId"));
  });

  it("rejects invalid and unknown rule params without leaking their values", () => {
    const sensitiveValue = "sensitive-profile-value";
    const profile = {
      ...validProfile,
      rules: [
        {
          ...validProfile.rules[0],
          params: { asciiDigits: sensitiveValue, misspelledOption: true },
        },
      ],
    };

    try {
      load(profile);
      expect.unreachable("invalid params must fail Profile loading");
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toBe("Invalid params for Profile rule");
      expect((error as Error).message).not.toContain(sensitiveValue);
    }
  });
});

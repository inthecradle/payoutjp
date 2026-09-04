import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createItemId,
  createProfileId,
  createRegistryId,
  createRuleId,
  type ItemId,
  type ProfileId,
  type RegistryId,
  type RuleId,
  version,
} from "../src/index.js";

describe("@payoutjp/core", () => {
  it("exports its placeholder version", () => {
    expect(version).toBe("0.0.0");
  });

  it("creates each branded identifier without changing its value", () => {
    expect(createRuleId("CORE-SCHEMA-001")).toBe("CORE-SCHEMA-001");
    expect(createProfileId("bank-generic-jp")).toBe("bank-generic-jp");
    expect(createRegistryId("jpyc-official-mainnet")).toBe("jpyc-official-mainnet");
    expect(createItemId("recipient-001")).toBe("recipient-001");
  });

  it.each([
    ["RuleId", createRuleId],
    ["ProfileId", createProfileId],
    ["RegistryId", createRegistryId],
    ["ItemId", createItemId],
  ] as const)("rejects unsafe common input for %s", (_kind, create) => {
    for (const value of ["", " leading", "trailing ", "line\nbreak", "null\0byte"]) {
      expect(() => create(value)).toThrow(TypeError);
    }
  });

  it.each(["core-schema-001", "CORE_SCHEMA_001", "CORE", "-CORE-SCHEMA-001"])(
    "rejects malformed rule ID %s",
    (value) => {
      expect(() => createRuleId(value)).toThrow(
        new TypeError("RuleId must be an uppercase hyphen-separated identifier"),
      );
    },
  );

  it("keeps identifier brands distinct at compile time", () => {
    expectTypeOf<RuleId>().toMatchTypeOf<string>();
    expectTypeOf<string>().not.toMatchTypeOf<RuleId>();
    expectTypeOf<RuleId>().not.toEqualTypeOf<ProfileId>();
    expectTypeOf<ProfileId>().not.toEqualTypeOf<RegistryId>();
    expectTypeOf<RegistryId>().not.toEqualTypeOf<ItemId>();
  });
});

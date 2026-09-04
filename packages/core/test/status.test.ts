import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isItemStatus,
  isProfileStatus,
  isSeverity,
  type ItemStatus,
  itemStatusValues,
  type ProfileStatus,
  profileStatusValues,
  type Severity,
  severityValues,
} from "../src/index.js";

describe("common severity and status model", () => {
  it("exposes the canonical severity values", () => {
    expect(severityValues).toEqual(["error", "warning", "info"]);
    expect(Object.isFrozen(severityValues)).toBe(true);
    expectTypeOf<Severity>().toEqualTypeOf<"error" | "warning" | "info">();
  });

  it("exposes the canonical item/report status values", () => {
    expect(itemStatusValues).toEqual(["PASS", "WARNING", "FAIL"]);
    expect(Object.isFrozen(itemStatusValues)).toBe(true);
    expectTypeOf<ItemStatus>().toEqualTypeOf<"PASS" | "WARNING" | "FAIL">();
  });

  it("exposes the canonical profile status values", () => {
    expect(profileStatusValues).toEqual(["verified", "experimental", "deprecated", "retired"]);
    expect(Object.isFrozen(profileStatusValues)).toBe(true);
    expectTypeOf<ProfileStatus>().toEqualTypeOf<
      "verified" | "experimental" | "deprecated" | "retired"
    >();
  });

  it.each(severityValues)("accepts severity %s", (value) => {
    expect(isSeverity(value)).toBe(true);
  });

  it.each(itemStatusValues)("accepts item status %s", (value) => {
    expect(isItemStatus(value)).toBe(true);
  });

  it.each(profileStatusValues)("accepts profile status %s", (value) => {
    expect(isProfileStatus(value)).toBe(true);
  });

  it.each(["ERROR", "warn", "", null, undefined, 1, {}, []])(
    "rejects non-severity value %j",
    (value) => {
      expect(isSeverity(value)).toBe(false);
    },
  );

  it.each(["pass", "WARN", "ERROR", "", null, undefined, 1, {}, []])(
    "rejects non-status value %j",
    (value) => {
      expect(isItemStatus(value)).toBe(false);
    },
  );

  it.each(["active", "EXPERIMENTAL", "", null, undefined, 1, {}, []])(
    "rejects non-profile-status value %j",
    (value) => {
      expect(isProfileStatus(value)).toBe(false);
    },
  );

  it("narrows unknown values", () => {
    const severity: unknown = "warning";
    const status: unknown = "FAIL";

    if (!isSeverity(severity) || !isItemStatus(status)) {
      throw new Error("fixture must contain canonical values");
    }

    expectTypeOf(severity).toEqualTypeOf<Severity>();
    expectTypeOf(status).toEqualTypeOf<ItemStatus>();
  });
});

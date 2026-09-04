import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isPayoutJpError,
  PayoutJpConfigurationError,
  type PayoutJpError,
  type PayoutJpErrorCode,
  payoutJpErrorCodeValues,
  type PayoutJpErrorExitCode,
  PayoutJpInputError,
  PayoutJpIntegrityError,
  PayoutJpInternalError,
} from "../src/index.js";

describe("PayoutJP application errors", () => {
  it.each([
    [new PayoutJpInputError(), "PJP_INPUT_INVALID", 2, "PayoutJpInputError"],
    [
      new PayoutJpConfigurationError("PJP_PROFILE_INVALID"),
      "PJP_PROFILE_INVALID",
      2,
      "PayoutJpConfigurationError",
    ],
    [
      new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH"),
      "PJP_REGISTRY_DIGEST_MISMATCH",
      4,
      "PayoutJpIntegrityError",
    ],
    [new PayoutJpInternalError(), "PJP_INTERNAL_INVARIANT", 3, "PayoutJpInternalError"],
  ] as const)("exposes stable code and exit mapping", (error, code, exitCode, name) => {
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.exitCode).toBe(exitCode);
    expect(error.name).toBe(name);
    expect(isPayoutJpError(error)).toBe(true);
  });

  it("does not treat uncontrolled exceptions as safe application errors", () => {
    expect(isPayoutJpError(new Error("raw-value"))).toBe(false);
    expect(isPayoutJpError("raw-value")).toBe(false);
  });

  it("uses only fixed messages that cannot interpolate raw values", () => {
    const sensitiveValue = "sensitive-account-value";
    const errors = [
      new PayoutJpInputError(),
      new PayoutJpConfigurationError("PJP_RULE_PARAMS_INVALID"),
      new PayoutJpIntegrityError("PJP_REGISTRY_INVALID"),
      new PayoutJpInternalError(),
    ];

    for (const error of errors) {
      expect(error.message).not.toContain(sensitiveValue);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it("exports an exhaustive stable code list and narrow exit-code type", () => {
    expect(new Set(payoutJpErrorCodeValues).size).toBe(payoutJpErrorCodeValues.length);
    expect(payoutJpErrorCodeValues).toContain("PJP_REGISTRY_DIGEST_MISMATCH");
    expectTypeOf<PayoutJpError["code"]>().toEqualTypeOf<PayoutJpErrorCode>();
    expectTypeOf<PayoutJpError["exitCode"]>().toEqualTypeOf<PayoutJpErrorExitCode>();
  });
});

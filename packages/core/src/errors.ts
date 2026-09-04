/** Stable machine-readable application error codes. */
export const payoutJpErrorCodeValues = Object.freeze([
  "PJP_INPUT_INVALID",
  "PJP_CONFIG_INVALID",
  "PJP_PROFILE_INVALID",
  "PJP_PROFILE_NOT_FOUND",
  "PJP_PROFILE_STATUS_NOT_ALLOWED",
  "PJP_RULE_DUPLICATE",
  "PJP_RULE_UNKNOWN",
  "PJP_RULE_PARAMS_INVALID",
  "PJP_REGISTRY_INVALID",
  "PJP_REGISTRY_NOT_FOUND",
  "PJP_REGISTRY_DIGEST_MISMATCH",
  "PJP_INTERNAL_INVARIANT",
] as const);

/** Stable machine-readable application error code. */
export type PayoutJpErrorCode = (typeof payoutJpErrorCodeValues)[number];

/** CLI exit codes reserved for non-finding application failures. */
export type PayoutJpErrorExitCode = 2 | 3 | 4;

const errorMessages: Readonly<Record<PayoutJpErrorCode, string>> = Object.freeze({
  PJP_INPUT_INVALID: "Input does not match the required contract",
  PJP_CONFIG_INVALID: "Configuration does not match the required contract",
  PJP_PROFILE_INVALID: "Compatibility Profile does not match the required contract",
  PJP_PROFILE_NOT_FOUND: "Requested Compatibility Profile was not found",
  PJP_PROFILE_STATUS_NOT_ALLOWED: "Compatibility Profile status requires explicit permission",
  PJP_RULE_DUPLICATE: "Duplicate RuleId registration",
  PJP_RULE_UNKNOWN: "Compatibility Profile references an unknown RuleId",
  PJP_RULE_PARAMS_INVALID: "Invalid params for Compatibility Profile rule",
  PJP_REGISTRY_INVALID: "Registry envelope does not match the required contract",
  PJP_REGISTRY_NOT_FOUND: "Required Registry was not found",
  PJP_REGISTRY_DIGEST_MISMATCH: "Registry digest does not match its canonical content",
  PJP_INTERNAL_INVARIANT: "Internal validation invariant failed",
});

/** Base class for safe, stable application errors exposed by Core. */
export class PayoutJpError extends Error {
  readonly code: PayoutJpErrorCode;
  readonly exitCode: PayoutJpErrorExitCode;

  protected constructor(code: PayoutJpErrorCode, exitCode: PayoutJpErrorExitCode) {
    super(errorMessages[code]);
    this.name = "PayoutJpError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** Invalid user input; maps to CLI exit code 2. */
export class PayoutJpInputError extends PayoutJpError {
  constructor(code: "PJP_INPUT_INVALID" = "PJP_INPUT_INVALID") {
    super(code, 2);
    this.name = "PayoutJpInputError";
  }
}

export type PayoutJpConfigurationErrorCode =
  | "PJP_CONFIG_INVALID"
  | "PJP_PROFILE_INVALID"
  | "PJP_PROFILE_NOT_FOUND"
  | "PJP_PROFILE_STATUS_NOT_ALLOWED"
  | "PJP_RULE_DUPLICATE"
  | "PJP_RULE_UNKNOWN"
  | "PJP_RULE_PARAMS_INVALID";

/** Invalid local configuration or Profile selection; maps to CLI exit code 2. */
export class PayoutJpConfigurationError extends PayoutJpError {
  constructor(code: PayoutJpConfigurationErrorCode) {
    super(code, 2);
    this.name = "PayoutJpConfigurationError";
  }
}

export type PayoutJpIntegrityErrorCode =
  | "PJP_REGISTRY_INVALID"
  | "PJP_REGISTRY_NOT_FOUND"
  | "PJP_REGISTRY_DIGEST_MISMATCH";

/** Missing, malformed, or modified Registry data; maps to CLI exit code 4. */
export class PayoutJpIntegrityError extends PayoutJpError {
  constructor(code: PayoutJpIntegrityErrorCode) {
    super(code, 4);
    this.name = "PayoutJpIntegrityError";
  }
}

/** Unexpected invariant or implementation failure; maps to CLI exit code 3. */
export class PayoutJpInternalError extends PayoutJpError {
  constructor(code: "PJP_INTERNAL_INVARIANT" = "PJP_INTERNAL_INVARIANT") {
    super(code, 3);
    this.name = "PayoutJpInternalError";
  }
}

/** Type guard for errors safe to cross a Core application boundary. */
export function isPayoutJpError(error: unknown): error is PayoutJpError {
  return error instanceof PayoutJpError;
}

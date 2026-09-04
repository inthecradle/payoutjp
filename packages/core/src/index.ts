/** Placeholder package version for the repository bootstrap. */
export const version = "0.0.0";

export {
  aggregateItemStatus,
  aggregateReportStatus,
  summarizeValidationItems,
} from "./aggregation.js";

export { compareFindings, executeRules, sortFindings } from "./engine.js";

export {
  isPayoutJpError,
  PayoutJpConfigurationError,
  type PayoutJpConfigurationErrorCode,
  PayoutJpError,
  type PayoutJpErrorCode,
  payoutJpErrorCodeValues,
  type PayoutJpErrorExitCode,
  PayoutJpInputError,
  PayoutJpIntegrityError,
  type PayoutJpIntegrityErrorCode,
  PayoutJpInternalError,
} from "./errors.js";

export {
  type FindingLocationV1,
  FindingLocationV1Schema,
  type FindingV1,
  FindingV1Schema,
  type RemediationV1,
  RemediationV1Schema,
  type SafeObservedValueV1,
  SafeObservedValueV1Schema,
  safeObservedValueClassificationValues,
} from "./finding.js";

export {
  createItemId,
  createProfileId,
  createRegistryId,
  createRuleId,
  type ItemId,
  type ProfileId,
  type RegistryId,
  type RuleId,
} from "./identifiers.js";

export {
  type CompatibilityProfileV1,
  CompatibilityProfileV1Schema,
  type LoadCompatibilityProfileV1Options,
  loadCompatibilityProfileV1,
  type ProfileRuleParameterParser,
  type RuleConfigurationV1,
  RuleConfigurationV1Schema,
} from "./profile.js";

export {
  type CreateValidationReportV1Input,
  createValidationReportV1,
  type ProfileReferenceV1,
  ProfileReferenceV1Schema,
  type Rail,
  railValues,
  type RegistryReferenceV1,
  RegistryReferenceV1Schema,
  type ToolReferenceV1,
  ToolReferenceV1Schema,
  type ValidationItemInputV1,
  type ValidationItemReportV1,
  ValidationItemReportV1Schema,
  type ValidationReportV1,
  ValidationReportV1Schema,
  type ValidationSummaryV1,
  ValidationSummaryV1Schema,
  sortProfileReferences,
  sortRegistryReferences,
} from "./report.js";

export {
  createMetadataObservedValue,
  createPublicObservedValue,
  maskBankAccountNumber,
  redactAccountHolder,
  shortenTokenContract,
  shortenWalletAddress,
} from "./redaction.js";

export {
  calculateRegistryEnvelopeSha256,
  canonicalizeJson,
  createRegistryEnvelopeV1Schema,
  type RegistryEnvelopeV1,
  RegistryEnvelopeV1Schema,
  type SourceMetadataV1,
  SourceMetadataV1Schema,
  loadRegistryEnvelopeV1,
} from "./registry.js";

export type { Rule, RuleContextV1 } from "./rule.js";

export {
  isItemStatus,
  isProfileStatus,
  isSeverity,
  type ItemStatus,
  itemStatusValues,
  type ProfileStatus,
  profileStatusValues,
  type Severity,
  severityValues,
} from "./status.js";

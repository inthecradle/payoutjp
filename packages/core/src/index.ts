/** Placeholder package version for the repository bootstrap. */
export const version = "0.0.0";

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
  type ProfileReferenceV1,
  ProfileReferenceV1Schema,
  type Rail,
  railValues,
  type RegistryReferenceV1,
  RegistryReferenceV1Schema,
  type ToolReferenceV1,
  ToolReferenceV1Schema,
  type ValidationItemReportV1,
  ValidationItemReportV1Schema,
  type ValidationReportV1,
  ValidationReportV1Schema,
  type ValidationSummaryV1,
  ValidationSummaryV1Schema,
} from "./report.js";

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

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
  isItemStatus,
  isSeverity,
  type ItemStatus,
  itemStatusValues,
  type Severity,
  severityValues,
} from "./status.js";

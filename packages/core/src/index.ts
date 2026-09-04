/** Placeholder package version for the repository bootstrap. */
export const version = "0.0.0";

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

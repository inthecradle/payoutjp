/** Canonical finding severities. */
export const severityValues = Object.freeze(["error", "warning", "info"] as const);

/** Severity assigned to a validation finding. */
export type Severity = (typeof severityValues)[number];

/** Canonical validation item and report statuses. */
export const itemStatusValues = Object.freeze(["PASS", "WARNING", "FAIL"] as const);

/** Aggregated status shared by validation items and reports. */
export type ItemStatus = (typeof itemStatusValues)[number];

/** Canonical lifecycle statuses for compatibility profiles. */
export const profileStatusValues = Object.freeze([
  "verified",
  "experimental",
  "deprecated",
  "retired",
] as const);

/** Lifecycle status of a compatibility profile. */
export type ProfileStatus = (typeof profileStatusValues)[number];

function isStringMember<Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

/** Returns whether an unknown value is a canonical finding severity. */
export function isSeverity(value: unknown): value is Severity {
  return isStringMember(severityValues, value);
}

/** Returns whether an unknown value is a canonical validation item/report status. */
export function isItemStatus(value: unknown): value is ItemStatus {
  return isStringMember(itemStatusValues, value);
}

/** Returns whether an unknown value is a canonical compatibility profile status. */
export function isProfileStatus(value: unknown): value is ProfileStatus {
  return isStringMember(profileStatusValues, value);
}

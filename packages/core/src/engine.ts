import { FindingV1Schema, type FindingV1 } from "./finding.js";
import { isPayoutJpError, PayoutJpConfigurationError, PayoutJpInternalError } from "./errors.js";
import { canonicalizeJson } from "./registry.js";
import type { Rule, RuleContextV1 } from "./rule.js";
import type { Severity } from "./status.js";

const severityRank: Readonly<Record<Severity, number>> = Object.freeze({
  error: 0,
  warning: 1,
  info: 2,
});

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOptionalStrings(left: string | undefined, right: string | undefined): number {
  if (left === undefined) {
    return right === undefined ? 0 : -1;
  }
  return right === undefined ? 1 : compareStrings(left, right);
}

function compareOptionalNumbers(left: number | undefined, right: number | undefined): number {
  if (left === undefined) {
    return right === undefined ? 0 : -1;
  }
  return right === undefined ? 1 : compareNumbers(left, right);
}

/** Total, locale-independent comparator for canonical finding output. */
export function compareFindings(left: FindingV1, right: FindingV1): number {
  const comparisons = [
    compareOptionalNumbers(left.location?.itemIndex, right.location?.itemIndex),
    compareNumbers(severityRank[left.severity], severityRank[right.severity]),
    compareStrings(left.ruleId, right.ruleId),
    compareStrings(left.path, right.path),
    compareOptionalStrings(left.location?.file, right.location?.file),
    compareOptionalNumbers(left.location?.line, right.location?.line),
    compareOptionalNumbers(left.location?.column, right.location?.column),
  ];

  for (const comparison of comparisons) {
    if (comparison !== 0) {
      return comparison;
    }
  }

  return compareStrings(canonicalizeJson(left), canonicalizeJson(right));
}

/** Returns a canonically sorted copy without mutating the caller's findings. */
export function sortFindings(findings: readonly FindingV1[]): readonly FindingV1[] {
  return [...findings].sort(compareFindings);
}

function assertFindingContext<TContext extends RuleContextV1>(
  finding: FindingV1,
  rule: Rule<TContext>,
  context: Readonly<TContext>,
): void {
  if (
    finding.ruleId !== rule.id ||
    finding.profileId !== context.profile.id ||
    finding.profileVersion !== context.profile.version ||
    (finding.location?.itemIndex !== undefined && finding.location.itemIndex !== context.itemIndex)
  ) {
    throw new PayoutJpInternalError();
  }
}

/**
 * Executes applicable rules in stable RuleId order and returns canonically sorted findings.
 * The context factory allows each rule to receive its own already-parsed params.
 */
export function executeRules<TContext extends RuleContextV1>(
  rules: Iterable<Rule<TContext>>,
  createContext: (rule: Rule<TContext>) => Readonly<TContext>,
): readonly FindingV1[] {
  const orderedRules = [...rules].sort((left, right) => compareStrings(left.id, right.id));
  const seen = new Set<string>();

  for (const rule of orderedRules) {
    if (seen.has(rule.id)) {
      throw new PayoutJpConfigurationError("PJP_RULE_DUPLICATE");
    }
    seen.add(rule.id);
  }

  const findings: FindingV1[] = [];
  for (const rule of orderedRules) {
    try {
      const context = createContext(rule);
      if (!rule.applies(context)) {
        continue;
      }

      for (const output of rule.evaluate(context)) {
        const parsed = FindingV1Schema.safeParse(output);
        if (!parsed.success) {
          throw new PayoutJpInternalError();
        }
        assertFindingContext(parsed.data, rule, context);
        findings.push(parsed.data);
      }
    } catch (error) {
      if (isPayoutJpError(error)) {
        throw error;
      }
      throw new PayoutJpInternalError();
    }
  }

  return sortFindings(findings);
}

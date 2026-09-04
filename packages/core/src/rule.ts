import type { FindingV1 } from "./finding.js";
import type { ItemId, RuleId } from "./identifiers.js";
import type { Severity } from "./status.js";

/**
 * Immutable input shared with a rule during applicability checks and evaluation.
 *
 * Profile and Registry values remain generic until their runtime contracts are
 * introduced by PJP-106 and PJP-107.
 */
export interface RuleContextV1<
  TDestination = unknown,
  TParams = unknown,
  TProfile = unknown,
  TRegistry = unknown,
  TApplicationConfig = unknown,
> {
  readonly destination: TDestination;
  readonly applicationConfig?: TApplicationConfig;
  readonly profile: TProfile;
  readonly params: TParams;
  readonly registries: ReadonlyMap<string, TRegistry>;
  readonly itemIndex: number;
  readonly itemId: ItemId;
}

/** A pure, synchronous validation rule specialized for one context shape. */
export interface Rule<TContext extends RuleContextV1 = RuleContextV1> {
  readonly id: RuleId;
  readonly defaultSeverity: Severity;

  /** Parses and validates the rule-specific params supplied by a Profile. */
  parseParams(input: unknown): TContext["params"];

  /** Determines whether the rule applies without mutating the context. */
  applies(context: Readonly<TContext>): boolean;

  /** Evaluates the context without I/O or mutation and returns report-ready findings. */
  evaluate(context: Readonly<TContext>): readonly FindingV1[];
}

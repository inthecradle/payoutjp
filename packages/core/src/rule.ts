import type { FindingV1 } from "./finding.js";
import type { ItemId, RuleId } from "./identifiers.js";
import type { CompatibilityProfileV1 } from "./profile.js";
import type { RegistryEnvelopeV1 } from "./registry.js";
import type { Severity } from "./status.js";

/**
 * Immutable input shared with a rule during applicability checks and evaluation.
 *
 * Destination, params, Registry payload, and optional application configuration
 * remain generic while Profile and Registry envelopes use their runtime contracts.
 */
export interface RuleContextV1<
  TDestination = unknown,
  TParams = unknown,
  TRegistryPayload = unknown,
  TApplicationConfig = unknown,
> {
  readonly destination: TDestination;
  readonly applicationConfig?: TApplicationConfig;
  readonly profile: CompatibilityProfileV1;
  readonly params: TParams;
  readonly registries: ReadonlyMap<string, RegistryEnvelopeV1<TRegistryPayload>>;
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

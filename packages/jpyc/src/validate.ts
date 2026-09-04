import {
  type CompatibilityProfileV1,
  createItemId,
  executeRules,
  type FindingV1,
  loadCompatibilityProfileV1,
  PayoutJpConfigurationError,
  PayoutJpInputError,
  PayoutJpIntegrityError,
  type RegistryEnvelopeV1,
  type Rule,
} from "@payoutjp/core";
import {
  JpycApplicationConfigV1Schema,
  JpycDestinationV1Schema,
  type JpycApplicationConfigV1,
  type JpycDestinationV1,
} from "./contracts.js";
import { jpycOfficialMainnetRegistryV1 } from "./official-registry.js";
import { jpycCurrentMainnetProfileV1 } from "./profile.js";
import { type JpycContractRegistryV1, loadJpycContractRegistryV1 } from "./registry.js";
import { type JpycRuleContextV1, jpycRules } from "./rules.js";

const registryRuleIds = new Set([
  "JPYC-ADDRESS-004",
  "JPYC-CHAIN-001",
  "JPYC-CONTRACT-002",
  "JPYC-CONTRACT-003",
]);

export interface ValidateJpycDestinationV1Options {
  readonly profile?: CompatibilityProfileV1;
  readonly registries?: ReadonlyMap<string, RegistryEnvelopeV1<JpycContractRegistryV1>>;
  readonly applicationConfig?: unknown;
  readonly itemIndex?: number;
}

function validateItemIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }
  return value;
}

function verifyRegistries(
  inputs: ReadonlyMap<string, RegistryEnvelopeV1<JpycContractRegistryV1>>,
): ReadonlyMap<string, RegistryEnvelopeV1<JpycContractRegistryV1>> {
  const verified = new Map<string, RegistryEnvelopeV1<JpycContractRegistryV1>>();
  for (const [key, input] of inputs) {
    const registry = loadJpycContractRegistryV1(input);
    if (key !== registry.id) {
      throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
    }
    verified.set(key, registry);
  }
  return verified;
}

function selectReferencedRegistries(
  profile: CompatibilityProfileV1,
  registries: ReadonlyMap<string, RegistryEnvelopeV1<JpycContractRegistryV1>>,
): ReadonlyMap<string, RegistryEnvelopeV1<JpycContractRegistryV1>> {
  const selected = new Map<string, RegistryEnvelopeV1<JpycContractRegistryV1>>();
  for (const reference of profile.registries) {
    const registry = registries.get(reference.id);
    if (registry === undefined || registry.version !== reference.version) {
      throw new PayoutJpIntegrityError("PJP_REGISTRY_NOT_FOUND");
    }
    if (registry.sha256 !== reference.sha256) {
      throw new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH");
    }
    selected.set(registry.id, registry);
  }
  return selected;
}

function effectiveRule(
  rule: Rule<JpycRuleContextV1>,
  severity: FindingV1["severity"] | undefined,
): Rule<JpycRuleContextV1> {
  if (severity === undefined) {
    return rule;
  }
  return {
    ...rule,
    defaultSeverity: severity,
    evaluate(context) {
      return rule.evaluate(context).map((entry) => ({ ...entry, severity }));
    },
  };
}

/** Validates one JPYC destination using only exact local Profile and Registry data. */
export function validateJpycDestinationV1(
  input: unknown,
  options: ValidateJpycDestinationV1Options = {},
): readonly FindingV1[] {
  const destinationResult = JpycDestinationV1Schema.safeParse(input);
  if (!destinationResult.success) {
    throw new PayoutJpInputError();
  }
  const destination: JpycDestinationV1 = destinationResult.data;

  let applicationConfig: JpycApplicationConfigV1 | undefined;
  if (options.applicationConfig !== undefined) {
    const configResult = JpycApplicationConfigV1Schema.safeParse(options.applicationConfig);
    if (!configResult.success) {
      throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
    }
    applicationConfig = configResult.data;
  }

  const profile = loadCompatibilityProfileV1(options.profile ?? jpycCurrentMainnetProfileV1, {
    rules: jpycRules,
  });
  if (profile.rail !== "jpyc") {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }

  const defaultRegistries = new Map([
    [jpycOfficialMainnetRegistryV1.id, jpycOfficialMainnetRegistryV1],
  ]);
  const verifiedRegistries = verifyRegistries(options.registries ?? defaultRegistries);
  const registries = selectReferencedRegistries(profile, verifiedRegistries);
  const enabledConfigurations = profile.rules.filter((configuration) => configuration.enabled);
  if (
    enabledConfigurations.some((configuration) => registryRuleIds.has(configuration.id)) &&
    profile.registries.length === 0
  ) {
    throw new PayoutJpIntegrityError("PJP_REGISTRY_NOT_FOUND");
  }

  const itemIndex = validateItemIndex(options.itemIndex ?? 0);
  const itemId = createItemId(destination.id ?? `item-${String(itemIndex + 1).padStart(6, "0")}`);
  const ruleById = new Map(jpycRules.map((rule) => [rule.id, rule]));
  const paramsById = new Map<string, Readonly<Record<string, unknown>>>();
  const selectedRules = enabledConfigurations.map((configuration) => {
    const rule = ruleById.get(configuration.id);
    if (rule === undefined) {
      throw new PayoutJpConfigurationError("PJP_RULE_UNKNOWN");
    }
    paramsById.set(rule.id, rule.parseParams(configuration.params));
    return effectiveRule(rule, configuration.severity);
  });

  return executeRules(selectedRules, (rule) => ({
    destination,
    ...(applicationConfig === undefined ? {} : { applicationConfig }),
    profile,
    params: paramsById.get(rule.id) ?? {},
    registries,
    itemIndex,
    itemId,
  }));
}

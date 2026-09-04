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
import { BankTransferDestinationV1Schema, type BankTransferDestinationV1 } from "./destination.js";
import { bankGenericJpProfileV1 } from "./profile.js";
import { type BankDirectoryRegistryV1, loadBankDirectoryRegistryV1 } from "./registry.js";
import { type BankRuleContextV1, bankRules } from "./rules.js";

const registryRuleIds = new Set(["BANK-CODE-002", "BANK-BRANCH-002", "BANK-BRANCH-003"]);

export interface ValidateBankTransferDestinationV1Options {
  readonly profile?: CompatibilityProfileV1;
  readonly registries?: ReadonlyMap<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>;
  readonly itemIndex?: number;
}

function validateItemIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }
  return value;
}

function selectReferencedRegistries(
  profile: CompatibilityProfileV1,
  registries: ReadonlyMap<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>,
): ReadonlyMap<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>> {
  const selected = new Map<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>();
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

function verifyRegistries(
  registries: ReadonlyMap<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>,
): ReadonlyMap<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>> {
  const verified = new Map<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>();
  for (const [key, input] of registries) {
    const registry = loadBankDirectoryRegistryV1(input);
    if (key !== registry.id) {
      throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
    }
    verified.set(key, registry);
  }
  return verified;
}

function effectiveRule(
  rule: Rule<BankRuleContextV1>,
  severity: FindingV1["severity"] | undefined,
): Rule<BankRuleContextV1> {
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

/**
 * Validates one destination synchronously against an exact local Profile and Registry set.
 * No normalization, network access, or input mutation is performed.
 */
export function validateBankTransferDestinationV1(
  input: unknown,
  options: ValidateBankTransferDestinationV1Options = {},
): readonly FindingV1[] {
  const parsed = BankTransferDestinationV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new PayoutJpInputError();
  }
  const destination: BankTransferDestinationV1 = parsed.data;
  const profile = loadCompatibilityProfileV1(options.profile ?? bankGenericJpProfileV1, {
    rules: bankRules,
  });
  if (profile.rail !== "bank_transfer") {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }

  const itemIndex = validateItemIndex(options.itemIndex ?? 0);
  const itemId = createItemId(destination.id ?? `item-${String(itemIndex + 1).padStart(6, "0")}`);
  const verifiedRegistries = verifyRegistries(options.registries ?? new Map());
  const registries = selectReferencedRegistries(profile, verifiedRegistries);

  const enabledConfigurations = profile.rules.filter((configuration) => configuration.enabled);
  if (
    enabledConfigurations.some((configuration) => registryRuleIds.has(configuration.id)) &&
    profile.registries.length === 0
  ) {
    throw new PayoutJpIntegrityError("PJP_REGISTRY_NOT_FOUND");
  }

  const ruleById = new Map(bankRules.map((rule) => [rule.id, rule]));
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
    profile,
    params: paramsById.get(rule.id) ?? {},
    registries,
    itemIndex,
    itemId,
  }));
}

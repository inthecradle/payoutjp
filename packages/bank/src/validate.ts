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
import { BankTransferDestinationV1Schema } from "./destination.js";
import { bankGenericJpProfileV1 } from "./profile.js";
import {
  type BankDirectoryRegistryV1,
  type BankEntryV1,
  loadBankDirectoryRegistryV1,
} from "./registry.js";
import { type BankRuleContextV1, bankRules } from "./rules.js";

const registryRuleIds = new Set(["BANK-CODE-002", "BANK-BRANCH-002", "BANK-BRANCH-003"]);

export interface ValidateBankTransferDestinationV1Options {
  readonly profile?: CompatibilityProfileV1;
  readonly registries?: ReadonlyMap<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>;
  readonly itemIndex?: number;
  readonly allowExperimental?: boolean;
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

function freezeSnapshot<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) freezeSnapshot(entry);
    Object.freeze(value);
  }
  return value;
}

/** Prepares an owned immutable Profile/Registry snapshot once for repeated local validation. */
export function prepareBankTransferValidatorV1(
  options: Omit<ValidateBankTransferDestinationV1Options, "itemIndex"> = {},
): (input: unknown, itemIndex?: number) => readonly FindingV1[] {
  const decodedProfile = loadCompatibilityProfileV1(options.profile ?? bankGenericJpProfileV1, {
    rules: bankRules,
    ...(options.allowExperimental === undefined
      ? {}
      : { allowExperimental: options.allowExperimental }),
  });
  // Profile params are unknown at the Core boundary and can still alias caller-owned arrays.
  const profile = freezeSnapshot(structuredClone(decodedProfile));
  if (profile.rail !== "bank_transfer") throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  const registries = selectReferencedRegistries(
    profile,
    verifyRegistries(options.registries ?? new Map()),
  );
  const bankIndex = new Map<string, BankEntryV1[]>();
  const branchIndex = new Map<string, BankEntryV1[]>();
  for (const registry of registries.values()) {
    freezeSnapshot(registry);
    for (const bank of registry.payload.banks) {
      const banks = bankIndex.get(bank.code) ?? [];
      banks.push(bank);
      bankIndex.set(bank.code, banks);
      for (const branch of bank.branches) {
        const owners = branchIndex.get(branch.code) ?? [];
        owners.push(bank);
        branchIndex.set(branch.code, owners);
      }
    }
  }
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
    if (rule === undefined) throw new PayoutJpConfigurationError("PJP_RULE_UNKNOWN");
    paramsById.set(rule.id, freezeSnapshot(rule.parseParams(configuration.params)));
    return effectiveRule(rule, configuration.severity);
  });
  return (input, suppliedIndex = 0) => {
    const parsed = BankTransferDestinationV1Schema.safeParse(input);
    if (!parsed.success) throw new PayoutJpInputError();
    const destination = parsed.data;
    const itemIndex = validateItemIndex(suppliedIndex);
    const itemId = createItemId(destination.id ?? `item-${String(itemIndex + 1).padStart(6, "0")}`);
    return executeRules(selectedRules, (rule) => ({
      destination,
      profile,
      params: paramsById.get(rule.id) ?? {},
      registries,
      itemIndex,
      itemId,
      bankIndex,
      branchIndex,
    }));
  };
}

/** Validates one destination without normalization, input mutation, network access or I/O. */
export function validateBankTransferDestinationV1(
  input: unknown,
  options: ValidateBankTransferDestinationV1Options = {},
): readonly FindingV1[] {
  if (!BankTransferDestinationV1Schema.safeParse(input).success) throw new PayoutJpInputError();
  return prepareBankTransferValidatorV1(options)(input, options.itemIndex ?? 0);
}

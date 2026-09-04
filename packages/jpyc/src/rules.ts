import {
  createPublicObservedValue,
  createRuleId,
  shortenTokenContract,
  shortenWalletAddress,
  type FindingV1,
  type Rule,
  type RuleContextV1,
  type Severity,
} from "@payoutjp/core";
import { getAddress } from "viem";
import { z } from "zod";
import {
  JpycEnvironmentSchema,
  type JpycApplicationConfigV1,
  type JpycDestinationV1,
} from "./contracts.js";
import type { JpycContractEntryV1, JpycContractRegistryV1 } from "./registry.js";

export type JpycRuleParamsV1 = Readonly<Record<string, unknown>>;
export type JpycRuleContextV1 = RuleContextV1<
  JpycDestinationV1,
  JpycRuleParamsV1,
  JpycContractRegistryV1,
  JpycApplicationConfigV1
>;

const EmptyParamsSchema = z.strictObject({});
const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/u;
const zeroAddress = "0x0000000000000000000000000000000000000000";

interface FindingDefinition {
  readonly messageKey: string;
  readonly message: string;
  readonly path: string;
  readonly actual?: FindingV1["actual"];
  readonly expected?: string;
  readonly remediation?: FindingV1["remediation"];
}

function finding(
  rule: Rule<JpycRuleContextV1>,
  context: Readonly<JpycRuleContextV1>,
  definition: FindingDefinition,
): FindingV1 {
  return {
    schemaVersion: "1",
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    messageKey: definition.messageKey,
    message: definition.message,
    path: definition.path,
    location: { itemIndex: context.itemIndex },
    ...(definition.actual === undefined ? {} : { actual: definition.actual }),
    ...(definition.expected === undefined ? {} : { expected: definition.expected }),
    ...(definition.remediation === undefined ? {} : { remediation: definition.remediation }),
    profileId: context.profile.id,
    profileVersion: context.profile.version,
  };
}

interface JpycRuleDefinition<TParams extends Record<string, unknown>> {
  readonly id: string;
  readonly defaultSeverity: Severity;
  readonly paramsSchema: z.ZodType<TParams>;
  readonly applies?: (context: Readonly<JpycRuleContextV1>, params: Readonly<TParams>) => boolean;
  readonly evaluate: (
    context: Readonly<JpycRuleContextV1>,
    params: Readonly<TParams>,
    rule: Rule<JpycRuleContextV1>,
  ) => readonly FindingV1[];
}

function defineJpycRule<TParams extends Record<string, unknown>>(
  definition: JpycRuleDefinition<TParams>,
): Rule<JpycRuleContextV1> {
  const rule: Rule<JpycRuleContextV1> = {
    id: createRuleId(definition.id),
    defaultSeverity: definition.defaultSeverity,
    parseParams(input: unknown): JpycRuleParamsV1 {
      return definition.paramsSchema.parse(input ?? {});
    },
    applies(context): boolean {
      const params = definition.paramsSchema.parse(context.params);
      return definition.applies?.(context, params) ?? true;
    },
    evaluate(context): readonly FindingV1[] {
      const params = definition.paramsSchema.parse(context.params);
      return definition.evaluate(context, params, rule);
    },
  };
  return rule;
}

function isEvmAddress(value: string): boolean {
  return evmAddressPattern.test(value);
}

function addressesEqual(left: string, right: string): boolean {
  return isEvmAddress(left) && isEvmAddress(right) && left.toLowerCase() === right.toLowerCase();
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function registryEntries(context: Readonly<JpycRuleContextV1>): readonly JpycContractEntryV1[] {
  return [...context.registries.values()]
    .filter(
      (registry) =>
        registry.kind === "jpyc-contracts" && registry.payload.kind === "jpyc-contracts",
    )
    .sort((left, right) => compareStrings(left.id, right.id))
    .flatMap((registry) => registry.payload.entries);
}

function currentEntry(
  context: Readonly<JpycRuleContextV1>,
  environment: JpycApplicationConfigV1["environment"],
  chainId: number,
): JpycContractEntryV1 | undefined {
  return registryEntries(context).find(
    (entry) =>
      entry.environment === environment &&
      entry.chainId === chainId &&
      entry.status === "current" &&
      entry.provenance === "official",
  );
}

export const jpycAddressSyntaxRule = defineJpycRule({
  id: "JPYC-ADDRESS-001",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  evaluate(context, _params, rule) {
    if (isEvmAddress(context.destination.walletAddress)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.address.invalid_format",
        message: "Wallet address must be a 20-byte EVM hexadecimal address.",
        path: "destination.walletAddress",
        actual: shortenWalletAddress(context.destination.walletAddress),
        expected: "0x followed by 40 hexadecimal characters",
        remediation: {
          code: "confirm_wallet_address",
          message: "Confirm the wallet address without changing it automatically.",
        },
      }),
    ];
  },
});

export const jpycZeroAddressRule = defineJpycRule({
  id: "JPYC-ADDRESS-002",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  applies: (context) => isEvmAddress(context.destination.walletAddress),
  evaluate(context, _params, rule) {
    if (!addressesEqual(context.destination.walletAddress, zeroAddress)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.address.zero_address",
        message: "Wallet address is the EVM zero address.",
        path: "destination.walletAddress",
        actual: shortenWalletAddress(context.destination.walletAddress),
        remediation: {
          code: "confirm_wallet_address",
          message: "Replace the zero address with the intended recipient wallet address.",
        },
      }),
    ];
  },
});

const ChecksumParamsSchema = z.strictObject({
  policy: z.enum(["mixed-case", "always"]),
});

export const jpycAddressChecksumRule = defineJpycRule({
  id: "JPYC-ADDRESS-003",
  defaultSeverity: "warning",
  paramsSchema: ChecksumParamsSchema,
  applies: (context) => isEvmAddress(context.destination.walletAddress),
  evaluate(context, params, rule) {
    const address = context.destination.walletAddress;
    const body = address.slice(2);
    const isMixedCase = /[a-f]/u.test(body) && /[A-F]/u.test(body);
    if (params.policy === "mixed-case" && !isMixedCase) {
      return [];
    }
    if (address === getAddress(address.toLowerCase())) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.address.checksum_invalid",
        message: "Wallet address does not match its EIP-55 checksum representation.",
        path: "destination.walletAddress",
        actual: shortenWalletAddress(address),
        remediation: {
          code: "confirm_wallet_address",
          message: "Confirm the checksum with the wallet owner; no replacement was applied.",
        },
      }),
    ];
  },
});

const RegistryEnvironmentParamsSchema = z.strictObject({
  environment: JpycEnvironmentSchema,
});

export const jpycRecipientIsTokenContractRule = defineJpycRule({
  id: "JPYC-ADDRESS-004",
  defaultSeverity: "error",
  paramsSchema: RegistryEnvironmentParamsSchema,
  applies: (context) => isEvmAddress(context.destination.walletAddress),
  evaluate(context, params, rule) {
    const configuredContract = context.applicationConfig?.tokenContract;
    const officialContract = currentEntry(
      context,
      params.environment,
      context.destination.chainId,
    )?.contractAddress;
    const matchesConfigured =
      configuredContract !== undefined &&
      addressesEqual(context.destination.walletAddress, configuredContract);
    const matchesOfficial =
      officialContract !== undefined &&
      addressesEqual(context.destination.walletAddress, officialContract);
    if (!matchesConfigured && !matchesOfficial) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.address.token_contract_recipient",
        message: "Recipient wallet address equals the configured or current JPYC token contract.",
        path: "destination.walletAddress",
        actual: shortenWalletAddress(context.destination.walletAddress),
        remediation: {
          code: "confirm_wallet_address",
          message: "Confirm the recipient wallet; do not use the JPYC token contract as recipient.",
        },
      }),
    ];
  },
});

export const jpycSupportedChainRule = defineJpycRule({
  id: "JPYC-CHAIN-001",
  defaultSeverity: "error",
  paramsSchema: RegistryEnvironmentParamsSchema,
  applies: (context) => registryEntries(context).length > 0,
  evaluate(context, params, rule) {
    if (currentEntry(context, params.environment, context.destination.chainId) !== undefined) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.chain.unsupported",
        message: "Destination chain is not supported by the selected current JPYC Registry.",
        path: "destination.chainId",
        actual: createPublicObservedValue(String(context.destination.chainId)),
        remediation: {
          code: "select_supported_jpyc_chain",
          message: "Select a chain listed by the exact Profile and Registry snapshot.",
        },
      }),
    ];
  },
});

export const jpycChainMismatchRule = defineJpycRule({
  id: "JPYC-CHAIN-002",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  applies: (context) => context.applicationConfig !== undefined,
  evaluate(context, _params, rule) {
    if (context.destination.chainId === context.applicationConfig?.chainId) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.chain.application_mismatch",
        message: "Destination and application configuration use different chain IDs.",
        path: "applicationConfig.chainId",
        actual: createPublicObservedValue(String(context.applicationConfig?.chainId)),
        expected: String(context.destination.chainId),
        remediation: {
          code: "select_supported_jpyc_chain",
          message: "Align the destination and application configuration chain IDs.",
        },
      }),
    ];
  },
});

const AllowedEnvironmentsParamsSchema = z.strictObject({
  allowedEnvironments: z.array(JpycEnvironmentSchema).min(1),
});

export const jpycEnvironmentRule = defineJpycRule({
  id: "JPYC-ENV-001",
  defaultSeverity: "error",
  paramsSchema: AllowedEnvironmentsParamsSchema,
  applies: (context) => context.applicationConfig !== undefined,
  evaluate(context, params, rule) {
    const environment = context.applicationConfig?.environment;
    if (environment !== undefined && params.allowedEnvironments.includes(environment)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.environment.unsupported",
        message: "Application environment is not allowed by the selected Profile.",
        path: "applicationConfig.environment",
        actual: createPublicObservedValue(environment ?? "missing"),
        expected: params.allowedEnvironments.join(", "),
      }),
    ];
  },
});

const ApplicationConfigRequiredParamsSchema = z.strictObject({ required: z.literal(true) });

export const jpycApplicationConfigRequiredRule = defineJpycRule({
  id: "JPYC-CONTRACT-001",
  defaultSeverity: "error",
  paramsSchema: ApplicationConfigRequiredParamsSchema,
  evaluate(context, _params, rule) {
    if (context.applicationConfig !== undefined) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.contract.application_config_required",
        message: "JPYC application configuration is required by the selected Profile.",
        path: "applicationConfig.tokenContract",
        remediation: {
          code: "replace_with_current_official_contract",
          message: "Provide a local application configuration with chain and token contract.",
        },
      }),
    ];
  },
});

function historicalEntryForConfiguration(
  context: Readonly<JpycRuleContextV1>,
): JpycContractEntryV1 | undefined {
  const config = context.applicationConfig;
  if (config === undefined || !isEvmAddress(config.tokenContract)) {
    return undefined;
  }
  return registryEntries(context).find(
    (entry) =>
      entry.environment === config.environment &&
      entry.chainId === config.chainId &&
      entry.status !== "current" &&
      (entry.provenance === "official" || entry.provenance === "verified-historical") &&
      addressesEqual(entry.contractAddress, config.tokenContract),
  );
}

export const jpycCurrentContractRule = defineJpycRule({
  id: "JPYC-CONTRACT-002",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  applies: (context) => context.applicationConfig !== undefined,
  evaluate(context, _params, rule) {
    const config = context.applicationConfig;
    if (config === undefined || historicalEntryForConfiguration(context) !== undefined) {
      return [];
    }
    const current = currentEntry(context, config.environment, config.chainId);
    if (current === undefined || addressesEqual(config.tokenContract, current.contractAddress)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.contract.current_mismatch",
        message: "Configured token contract does not match the current official JPYC contract.",
        path: "applicationConfig.tokenContract",
        actual: shortenTokenContract(config.tokenContract),
        expected: "current official contract from the selected Registry",
        remediation: {
          code: "replace_with_current_official_contract",
          message: "Use the current official contract for the configured chain and environment.",
        },
      }),
    ];
  },
});

export const jpycHistoricalContractRule = defineJpycRule({
  id: "JPYC-CONTRACT-003",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  applies: (context) => context.applicationConfig !== undefined,
  evaluate(context, _params, rule) {
    const historical = historicalEntryForConfiguration(context);
    if (historical === undefined) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "jpyc.contract.verified_historical",
        message: "Configured token contract is a provenance-backed historical JPYC contract.",
        path: "applicationConfig.tokenContract",
        actual: shortenTokenContract(context.applicationConfig?.tokenContract ?? ""),
        expected: "current official contract from the selected Registry",
        remediation: {
          code: "replace_with_current_official_contract",
          message: "Replace it with the current official contract for the configured chain.",
        },
      }),
    ];
  },
});

/** All M3 JPYC rules, in stable RuleId order. */
export const jpycRules = Object.freeze(
  [
    jpycAddressSyntaxRule,
    jpycZeroAddressRule,
    jpycAddressChecksumRule,
    jpycRecipientIsTokenContractRule,
    jpycSupportedChainRule,
    jpycChainMismatchRule,
    jpycEnvironmentRule,
    jpycApplicationConfigRequiredRule,
    jpycCurrentContractRule,
    jpycHistoricalContractRule,
  ].sort((left, right) => compareStrings(left.id, right.id)),
);

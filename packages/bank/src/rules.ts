import {
  createMetadataObservedValue,
  createPublicObservedValue,
  createRuleId,
  maskBankAccountNumber,
  redactAccountHolder,
  type FindingV1,
  type Rule,
  type RuleContextV1,
  type Severity,
} from "@payoutjp/core";
import { z } from "zod";
import {
  BankAccountTypeSchema,
  type BankAccountType,
  type BankTransferDestinationV1,
} from "./destination.js";
import type { BankDirectoryRegistryV1 } from "./registry.js";

export type BankRuleParamsV1 = Readonly<Record<string, unknown>>;
export type BankRuleContextV1 = RuleContextV1<
  BankTransferDestinationV1,
  BankRuleParamsV1,
  BankDirectoryRegistryV1
>;

const EmptyParamsSchema = z.strictObject({});
const PositiveBoundedIntegerSchema = z.number().int().positive().max(1_000_000);

interface FindingDefinition {
  readonly messageKey: string;
  readonly message: string;
  readonly path: string;
  readonly actual?: FindingV1["actual"];
  readonly expected?: string;
  readonly remediation?: FindingV1["remediation"];
}

function finding(
  rule: Rule<BankRuleContextV1>,
  context: Readonly<BankRuleContextV1>,
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

interface BankRuleDefinition<TParams extends Record<string, unknown>> {
  readonly id: string;
  readonly defaultSeverity: Severity;
  readonly paramsSchema: z.ZodType<TParams>;
  readonly applies?: (context: Readonly<BankRuleContextV1>, params: Readonly<TParams>) => boolean;
  readonly evaluate: (
    context: Readonly<BankRuleContextV1>,
    params: Readonly<TParams>,
    rule: Rule<BankRuleContextV1>,
  ) => readonly FindingV1[];
}

function defineBankRule<TParams extends Record<string, unknown>>(
  definition: BankRuleDefinition<TParams>,
): Rule<BankRuleContextV1> {
  const rule: Rule<BankRuleContextV1> = {
    id: createRuleId(definition.id),
    defaultSeverity: definition.defaultSeverity,
    parseParams(input: unknown): BankRuleParamsV1 {
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

function isExactAsciiDigits(value: string, length: number): boolean {
  return value.length === length && /^[0-9]+$/u.test(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const AsciiDigitsParamsSchema = z.strictObject({
  asciiDigits: PositiveBoundedIntegerSchema.max(32),
});

export const bankCodeSyntaxRule = defineBankRule({
  id: "BANK-CODE-001",
  defaultSeverity: "error",
  paramsSchema: AsciiDigitsParamsSchema,
  evaluate(context, params, rule) {
    if (isExactAsciiDigits(context.destination.bankCode, params.asciiDigits)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.code.invalid_format",
        message: "Bank code must contain the configured number of ASCII digits.",
        path: "destination.bankCode",
        actual: createPublicObservedValue(context.destination.bankCode),
        expected: `${params.asciiDigits} ASCII digits`,
        remediation: {
          code: "confirm_bank_selection",
          message: "Confirm the bank code without converting or padding the input automatically.",
        },
      }),
    ];
  },
});

export const branchCodeSyntaxRule = defineBankRule({
  id: "BANK-BRANCH-001",
  defaultSeverity: "error",
  paramsSchema: AsciiDigitsParamsSchema,
  evaluate(context, params, rule) {
    if (isExactAsciiDigits(context.destination.branchCode, params.asciiDigits)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.branch.invalid_format",
        message: "Branch code must contain the configured number of ASCII digits.",
        path: "destination.branchCode",
        actual: createPublicObservedValue(context.destination.branchCode),
        expected: `${params.asciiDigits} ASCII digits`,
        remediation: {
          code: "confirm_branch_selection",
          message: "Confirm the branch code without converting or padding the input automatically.",
        },
      }),
    ];
  },
});

function bankDirectories(context: Readonly<BankRuleContextV1>) {
  return [...context.registries.values()]
    .filter(
      (registry) =>
        registry.kind === "bank-directory" && registry.payload.kind === "bank-directory",
    )
    .sort((left, right) => compareStrings(left.id, right.id));
}

function declaredBanks(context: Readonly<BankRuleContextV1>) {
  return bankDirectories(context).flatMap((registry) =>
    registry.payload.banks.filter((bank) => bank.code === context.destination.bankCode),
  );
}

export const bankCodeExistsRule = defineBankRule({
  id: "BANK-CODE-002",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  applies: (context) => bankDirectories(context).length > 0,
  evaluate(context, _params, rule) {
    if (declaredBanks(context).length > 0) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.code.not_found",
        message: "Bank code is absent from the selected Bank Directory Registry.",
        path: "destination.bankCode",
        actual: createPublicObservedValue(context.destination.bankCode),
        remediation: {
          code: "confirm_bank_selection",
          message: "Confirm the bank selection against the configured Registry snapshot.",
        },
      }),
    ];
  },
});

function branchOwners(context: Readonly<BankRuleContextV1>) {
  return bankDirectories(context).flatMap((registry) =>
    registry.payload.banks.filter((bank) =>
      bank.branches.some((branch) => branch.code === context.destination.branchCode),
    ),
  );
}

export const branchCodeExistsRule = defineBankRule({
  id: "BANK-BRANCH-002",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  applies: (context) => bankDirectories(context).length > 0,
  evaluate(context, _params, rule) {
    const banks = declaredBanks(context);
    if (
      banks.length === 0 ||
      banks.some((bank) =>
        bank.branches.some((branch) => branch.code === context.destination.branchCode),
      ) ||
      branchOwners(context).length > 0
    ) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.branch.not_found",
        message: "Branch code is absent from the selected bank entry.",
        path: "destination.branchCode",
        actual: createPublicObservedValue(context.destination.branchCode),
        remediation: {
          code: "confirm_branch_selection",
          message: "Confirm the branch selection against the configured Registry snapshot.",
        },
      }),
    ];
  },
});

export const branchOwnershipRule = defineBankRule({
  id: "BANK-BRANCH-003",
  defaultSeverity: "error",
  paramsSchema: EmptyParamsSchema,
  applies: (context) => bankDirectories(context).length > 0,
  evaluate(context, _params, rule) {
    const banks = declaredBanks(context);
    const belongsToDeclaredBank = banks.some((bank) =>
      bank.branches.some((branch) => branch.code === context.destination.branchCode),
    );
    if (banks.length === 0 || belongsToDeclaredBank || branchOwners(context).length === 0) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.branch.wrong_bank",
        message: "Branch exists in the Registry but does not belong to the declared bank.",
        path: "destination.branchCode",
        actual: createPublicObservedValue(context.destination.branchCode),
        remediation: {
          code: "confirm_branch_selection",
          message:
            "Confirm the bank and branch combination against the configured Registry snapshot.",
        },
      }),
    ];
  },
});

const AllowedAccountTypesParamsSchema = z
  .strictObject({ allowedValues: z.array(BankAccountTypeSchema).min(1) })
  .superRefine((params, context) => {
    if (new Set(params.allowedValues).size !== params.allowedValues.length) {
      context.addIssue({
        code: "custom",
        message: "Account type allowlist contains a duplicate",
        path: ["allowedValues"],
      });
    }
  });

export const accountTypeAllowedRule = defineBankRule({
  id: "BANK-TYPE-001",
  defaultSeverity: "error",
  paramsSchema: AllowedAccountTypesParamsSchema,
  evaluate(context, params, rule) {
    if (params.allowedValues.includes(context.destination.accountType)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_type.not_allowed",
        message: "Account type is not allowed by the selected Profile.",
        path: "destination.accountType",
        actual: createPublicObservedValue(context.destination.accountType),
        expected: params.allowedValues.join(", "),
      }),
    ];
  },
});

const AccountNumberDigitsParamsSchema = z.strictObject({ asciiDigitsOnly: z.literal(true) });

export const accountNumberDigitsRule = defineBankRule({
  id: "BANK-NUMBER-001",
  defaultSeverity: "error",
  paramsSchema: AccountNumberDigitsParamsSchema,
  evaluate(context, _params, rule) {
    if (/^[0-9]+$/u.test(context.destination.accountNumber)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_number.invalid_characters",
        message: "Account number must contain only ASCII digits.",
        path: "destination.accountNumber",
        actual: maskBankAccountNumber(context.destination.accountNumber),
        expected: "one or more ASCII digits",
        remediation: {
          code: "confirm_bank_selection",
          message: "Confirm the account number without converting or padding it automatically.",
        },
      }),
    ];
  },
});

const AccountNumberLengthParamsSchema = z
  .strictObject({
    minDigits: z.number().int().nonnegative().max(128),
    maxDigits: z.number().int().nonnegative().max(128),
  })
  .refine((params) => params.minDigits <= params.maxDigits, {
    message: "Minimum digits must not exceed maximum digits",
    path: ["minDigits"],
  });

export const accountNumberLengthRule = defineBankRule({
  id: "BANK-NUMBER-002",
  defaultSeverity: "error",
  paramsSchema: AccountNumberLengthParamsSchema,
  evaluate(context, params, rule) {
    const length = context.destination.accountNumber.length;
    if (length >= params.minDigits && length <= params.maxDigits) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_number.invalid_length",
        message: "Account number length is outside the selected Profile limits.",
        path: "destination.accountNumber",
        actual: maskBankAccountNumber(context.destination.accountNumber),
        expected: `${params.minDigits} to ${params.maxDigits} characters`,
        remediation: {
          code: "confirm_bank_selection",
          message: "Confirm the account number without adding or removing leading zeroes.",
        },
      }),
    ];
  },
});

const AccountHolderRequiredParamsSchema = z.strictObject({ required: z.literal(true) });

export const accountHolderRequiredRule = defineBankRule({
  id: "BANK-HOLDER-001",
  defaultSeverity: "error",
  paramsSchema: AccountHolderRequiredParamsSchema,
  evaluate(context, _params, rule) {
    if (context.destination.accountHolder.trim().length > 0) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_holder.required",
        message: "Account holder is empty after a non-mutating presence check.",
        path: "destination.accountHolder",
        actual: redactAccountHolder(context.destination.accountHolder),
        expected: "a non-whitespace account holder value",
        remediation: {
          code: "compare_registered_account_name",
          message: "Compare the value with the registered account name.",
        },
      }),
    ];
  },
});

export const accountHolderWhitespaceRule = defineBankRule({
  id: "BANK-HOLDER-002",
  defaultSeverity: "warning",
  paramsSchema: EmptyParamsSchema,
  evaluate(context, _params, rule) {
    if (context.destination.accountHolder === context.destination.accountHolder.trim()) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_holder.surrounding_whitespace",
        message: "Account holder contains leading or trailing whitespace.",
        path: "destination.accountHolder",
        actual: redactAccountHolder(context.destination.accountHolder),
        remediation: {
          code: "compare_registered_account_name",
          message: "Review surrounding whitespace without changing the value automatically.",
        },
      }),
    ];
  },
});

const AccountHolderControlParamsSchema = z.strictObject({
  rejectControlCharacters: z.literal(true),
});

const forbiddenInvisiblePattern = /[\p{Cc}\p{Cf}]/u;

export const accountHolderControlCharacterRule = defineBankRule({
  id: "BANK-HOLDER-003",
  defaultSeverity: "error",
  paramsSchema: AccountHolderControlParamsSchema,
  evaluate(context, _params, rule) {
    if (!forbiddenInvisiblePattern.test(context.destination.accountHolder)) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_holder.forbidden_invisible_character",
        message: "Account holder contains a forbidden control or invisible format character.",
        path: "destination.accountHolder",
        actual: redactAccountHolder(context.destination.accountHolder),
        remediation: {
          code: "remove_invisible_character",
          message: "Remove the invisible character only after reviewing the source value.",
        },
      }),
    ];
  },
});

const UnicodeNormalizationParamsSchema = z.strictObject({
  unicodeNormalization: z.enum(["NFC", "NFD", "NFKC", "NFKD"]),
});

export const accountHolderUnicodeNormalizationRule = defineBankRule({
  id: "BANK-HOLDER-004",
  defaultSeverity: "warning",
  paramsSchema: UnicodeNormalizationParamsSchema,
  evaluate(context, params, rule) {
    if (
      context.destination.accountHolder ===
      context.destination.accountHolder.normalize(params.unicodeNormalization)
    ) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_holder.unicode_normalization_differs",
        message: "Account holder differs under the configured Unicode normalization form.",
        path: "destination.accountHolder",
        actual: redactAccountHolder(context.destination.accountHolder),
        expected: params.unicodeNormalization,
        remediation: {
          code: "review_unicode_normalization",
          message: "Review normalization requirements; no replacement was applied.",
        },
      }),
    ];
  },
});

const AccountHolderCharsetParamsSchema = z.strictObject({
  allowedCharacters: z.string().min(1).max(10_000),
});

export const accountHolderCharsetRule = defineBankRule({
  id: "BANK-HOLDER-005",
  defaultSeverity: "error",
  paramsSchema: AccountHolderCharsetParamsSchema,
  evaluate(context, params, rule) {
    const allowed = new Set(params.allowedCharacters);
    if ([...context.destination.accountHolder].every((character) => allowed.has(character))) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_holder.character_not_allowed",
        message: "Account holder contains a character outside the Profile-declared set.",
        path: "destination.accountHolder",
        actual: redactAccountHolder(context.destination.accountHolder),
        expected: "only characters declared by the selected Profile",
        remediation: {
          code: "compare_registered_account_name",
          message: "Compare the value with the character requirements of the selected Profile.",
        },
      }),
    ];
  },
});

const AccountHolderByteLengthParamsSchema = z.strictObject({
  encoding: z.literal("utf8"),
  maxBytes: PositiveBoundedIntegerSchema,
});

export const accountHolderEncodedByteLengthRule = defineBankRule({
  id: "BANK-HOLDER-006",
  defaultSeverity: "error",
  paramsSchema: AccountHolderByteLengthParamsSchema,
  evaluate(context, params, rule) {
    const byteLength = Buffer.byteLength(context.destination.accountHolder, params.encoding);
    if (byteLength <= params.maxBytes) {
      return [];
    }
    return [
      finding(rule, context, {
        messageKey: "bank.account_holder.encoded_length_exceeded",
        message: "Account holder encoded byte length exceeds the selected Profile limit.",
        path: "destination.accountHolder",
        actual: createMetadataObservedValue(`encoded bytes: ${byteLength}`),
        expected: `at most ${params.maxBytes} bytes in ${params.encoding}`,
        remediation: {
          code: "compare_registered_account_name",
          message: "Review the account holder against the selected Profile byte limit.",
        },
      }),
    ];
  },
});

/** All non-experimental M2 Bank rules, in stable RuleId order. */
export const bankRules = Object.freeze(
  [
    branchCodeSyntaxRule,
    branchCodeExistsRule,
    branchOwnershipRule,
    bankCodeSyntaxRule,
    bankCodeExistsRule,
    accountHolderRequiredRule,
    accountHolderWhitespaceRule,
    accountHolderControlCharacterRule,
    accountHolderUnicodeNormalizationRule,
    accountHolderCharsetRule,
    accountHolderEncodedByteLengthRule,
    accountNumberDigitsRule,
    accountNumberLengthRule,
    accountTypeAllowedRule,
  ].sort((left, right) => compareStrings(left.id, right.id)),
);

/** Canonical account-type values useful when constructing a Profile parameter allowlist. */
export const allBankAccountTypes: readonly BankAccountType[] = Object.freeze([
  "ordinary",
  "checking",
  "savings",
  "other",
]);

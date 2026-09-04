import { z } from "zod";

/** Canonical account types accepted by the Bank destination contract. */
export const bankAccountTypeValues = Object.freeze([
  "ordinary",
  "checking",
  "savings",
  "other",
] as const);

/** Runtime schema for a canonical Bank account type. */
export const BankAccountTypeSchema = z.enum(bankAccountTypeValues);

/** A canonical Bank account type. Profile rules may allow only a subset. */
export type BankAccountType = z.infer<typeof BankAccountTypeSchema>;

/**
 * Runtime shape contract for a bank-transfer destination.
 *
 * Compatibility constraints deliberately live in rules so raw strings and
 * leading zeroes survive parsing unchanged.
 */
export const BankTransferDestinationV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  rail: z.literal("bank_transfer"),
  id: z.string().min(1).optional(),
  bankCode: z.string(),
  branchCode: z.string(),
  accountType: BankAccountTypeSchema,
  accountNumber: z.string(),
  accountHolder: z.string(),
});

/** Version 1 bank-transfer destination inferred from its runtime schema. */
export type BankTransferDestinationV1 = z.infer<typeof BankTransferDestinationV1Schema>;

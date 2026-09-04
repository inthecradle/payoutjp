import {
  createRegistryEnvelopeV1Schema,
  loadRegistryEnvelopeV1,
  PayoutJpIntegrityError,
  type RegistryEnvelopeV1,
} from "@payoutjp/core";
import { z } from "zod";

export const bankDirectoryEntryStatusValues = Object.freeze([
  "active",
  "closed",
  "unknown",
] as const);

const OptionalLabelSchema = z.string().min(1).optional();

/** Runtime schema for one branch in a Bank Directory Registry. */
export const BankBranchEntryV1Schema = z.strictObject({
  code: z.string().min(1),
  name: OptionalLabelSchema,
  kana: OptionalLabelSchema,
  status: z.enum(bankDirectoryEntryStatusValues).optional(),
});

export type BankBranchEntryV1 = z.infer<typeof BankBranchEntryV1Schema>;

function rejectDuplicateCodes(
  entries: readonly { readonly code: string }[],
  context: z.RefinementCtx,
  pathPrefix: readonly (string | number)[],
): void {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.code)) {
      context.addIssue({
        code: "custom",
        message: "Duplicate Bank Directory code",
        path: [...pathPrefix, index, "code"],
      });
    }
    seen.add(entry.code);
  });
}

/** Runtime schema for one bank and its declared branches. */
export const BankEntryV1Schema = z
  .strictObject({
    code: z.string().min(1),
    name: OptionalLabelSchema,
    kana: OptionalLabelSchema,
    status: z.enum(bankDirectoryEntryStatusValues).optional(),
    branches: z.array(BankBranchEntryV1Schema),
  })
  .superRefine((bank, context) => rejectDuplicateCodes(bank.branches, context, ["branches"]));

export type BankEntryV1 = z.infer<typeof BankEntryV1Schema>;

/** Runtime payload schema for a synthetic or externally supplied Bank Directory. */
export const BankDirectoryRegistryV1Schema = z
  .strictObject({
    kind: z.literal("bank-directory"),
    banks: z.array(BankEntryV1Schema),
  })
  .superRefine((registry, context) => rejectDuplicateCodes(registry.banks, context, ["banks"]));

export type BankDirectoryRegistryV1 = z.infer<typeof BankDirectoryRegistryV1Schema>;

/** Runtime envelope schema for a Bank Directory Registry. */
export const BankDirectoryRegistryEnvelopeV1Schema = createRegistryEnvelopeV1Schema(
  BankDirectoryRegistryV1Schema,
).refine((envelope) => envelope.kind === "bank-directory", {
  message: "Registry envelope kind must match its Bank Directory payload",
  path: ["kind"],
});

/** Loads and digest-verifies a local Bank Directory Registry without I/O. */
export function loadBankDirectoryRegistryV1(
  input: unknown,
): RegistryEnvelopeV1<BankDirectoryRegistryV1> {
  if (!BankDirectoryRegistryEnvelopeV1Schema.safeParse(input).success) {
    throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
  }
  const envelope = loadRegistryEnvelopeV1(input, BankDirectoryRegistryV1Schema);
  return envelope;
}

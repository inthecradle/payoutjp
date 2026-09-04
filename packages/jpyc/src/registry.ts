import {
  createRegistryEnvelopeV1Schema,
  loadRegistryEnvelopeV1,
  PayoutJpIntegrityError,
  type RegistryEnvelopeV1,
} from "@payoutjp/core";
import { z } from "zod";
import { JpycEnvironmentSchema } from "./contracts.js";

const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/u;

export const jpycContractStatusValues = Object.freeze([
  "current",
  "historical",
  "deprecated",
] as const);
export const jpycProductValues = Object.freeze([
  "regulated-jpyc",
  "jpyc-prepaid",
  "unknown",
] as const);
export const jpycProvenanceValues = Object.freeze([
  "official",
  "verified-historical",
  "third-party",
] as const);

/** Runtime schema for one versioned JPYC contract fact. */
export const JpycContractEntryV1Schema = z
  .strictObject({
    environment: JpycEnvironmentSchema,
    network: z.string().min(1),
    chainId: z.number().int().nonnegative().safe(),
    contractAddress: z.string().regex(evmAddressPattern),
    status: z.enum(jpycContractStatusValues),
    product: z.enum(jpycProductValues),
    provenance: z.enum(jpycProvenanceValues),
  })
  .superRefine((entry, context) => {
    if (
      entry.status === "current" &&
      (entry.provenance !== "official" || entry.product !== "regulated-jpyc")
    ) {
      context.addIssue({
        code: "custom",
        message: "A current JPYC entry requires official regulated-JPYC provenance",
        path: ["provenance"],
      });
    }
  });

export type JpycContractEntryV1 = z.infer<typeof JpycContractEntryV1Schema>;

function canonicalEntryKey(entry: JpycContractEntryV1): string {
  return [
    entry.environment,
    String(entry.chainId).padStart(16, "0"),
    entry.status,
    entry.contractAddress.toLowerCase(),
  ].join("\0");
}

/** Runtime payload schema for current and provenance-backed JPYC contract facts. */
export const JpycContractRegistryV1Schema = z
  .strictObject({
    kind: z.literal("jpyc-contracts"),
    entries: z.array(JpycContractEntryV1Schema),
  })
  .superRefine((registry, context) => {
    const exactEntries = new Set<string>();
    const currentPairs = new Set<string>();
    let previousKey: string | undefined;

    registry.entries.forEach((entry, index) => {
      const key = canonicalEntryKey(entry);
      if (exactEntries.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate JPYC Registry entry",
          path: ["entries", index],
        });
      }
      exactEntries.add(key);

      if (entry.status === "current") {
        const pair = `${entry.environment}\0${entry.chainId}`;
        if (currentPairs.has(pair)) {
          context.addIssue({
            code: "custom",
            message: "Duplicate current JPYC chain and environment",
            path: ["entries", index],
          });
        }
        currentPairs.add(pair);
      }

      if (previousKey !== undefined && previousKey > key) {
        context.addIssue({
          code: "custom",
          message: "JPYC Registry entries must use canonical order",
          path: ["entries", index],
        });
      }
      previousKey = key;
    });
  });

export type JpycContractRegistryV1 = z.infer<typeof JpycContractRegistryV1Schema>;

export const JpycContractRegistryEnvelopeV1Schema = createRegistryEnvelopeV1Schema(
  JpycContractRegistryV1Schema,
).refine((envelope) => envelope.kind === "jpyc-contracts", {
  message: "Registry envelope kind must match its JPYC contract payload",
  path: ["kind"],
});

/** Loads and digest-verifies a local JPYC contract Registry without I/O. */
export function loadJpycContractRegistryV1(
  input: unknown,
): RegistryEnvelopeV1<JpycContractRegistryV1> {
  if (!JpycContractRegistryEnvelopeV1Schema.safeParse(input).success) {
    throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
  }
  return loadRegistryEnvelopeV1(input, JpycContractRegistryV1Schema);
}

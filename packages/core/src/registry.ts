import { createHash } from "node:crypto";
import { z } from "zod";
import { PayoutJpIntegrityError } from "./errors.js";
import { RegistryIdSchema } from "./identifier-schema.js";
import type { RegistryId } from "./identifiers.js";

const NonEmptyStringSchema = z.string().min(1);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "Expected a lowercase SHA-256 digest");
const IsoDateOrDateTimeSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/** Runtime schema for provenance attached to a Registry snapshot. */
export const SourceMetadataV1Schema = z.strictObject({
  publisher: NonEmptyStringSchema,
  uri: NonEmptyStringSchema,
  retrievedAt: IsoDateOrDateTimeSchema,
  effectiveAsOf: IsoDateOrDateTimeSchema.optional(),
  license: NonEmptyStringSchema.optional(),
  notes: z.array(NonEmptyStringSchema).optional(),
});

/** Provenance attached to a Registry snapshot. */
export type SourceMetadataV1 = z.infer<typeof SourceMetadataV1Schema>;

/** Immutable version 1 Registry envelope with a payload-specific type. */
export interface RegistryEnvelopeV1<TPayload = unknown> {
  readonly schemaVersion: "1";
  readonly id: RegistryId;
  readonly version: string;
  readonly kind: string;
  readonly sha256: string;
  readonly source: SourceMetadataV1;
  readonly payload: TPayload;
}

/** Creates a strict Registry envelope schema for one payload contract. */
export function createRegistryEnvelopeV1Schema<TPayload>(payloadSchema: z.ZodType<TPayload>) {
  return z.strictObject({
    schemaVersion: z.literal("1"),
    id: RegistryIdSchema,
    version: NonEmptyStringSchema,
    kind: NonEmptyStringSchema,
    sha256: Sha256Schema,
    source: SourceMetadataV1Schema,
    payload: payloadSchema,
  });
}

/** Runtime schema for a Registry envelope whose payload contract is not yet selected. */
export const RegistryEnvelopeV1Schema = createRegistryEnvelopeV1Schema(z.unknown());

const RegistryEnvelopeDigestInputV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  id: RegistryIdSchema,
  version: NonEmptyStringSchema,
  kind: NonEmptyStringSchema,
  sha256: Sha256Schema.optional(),
  source: SourceMetadataV1Schema,
  payload: z.unknown(),
});

function canonicalizeJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON accepts only finite numbers");
    }
    return JSON.stringify(value);
  }

  if (typeof value !== "object") {
    throw new TypeError("Canonical JSON accepts only JSON values");
  }

  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON does not accept cyclic values");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.keys(value).length !== value.length
      ) {
        throw new TypeError("Canonical JSON accepts only dense arrays");
      }

      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor)) {
          throw new TypeError("Canonical JSON accepts only dense data arrays");
        }
        entries.push(canonicalizeJsonValue(descriptor.value, ancestors));
      }
      return `[${entries.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON accepts only plain objects");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Canonical JSON accepts only string object keys");
    }

    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor)) {
          throw new TypeError("Canonical JSON does not accept accessor properties");
        }
        return `${JSON.stringify(key)}:${canonicalizeJsonValue(descriptor.value, ancestors)}`;
      });

    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Serializes finite JSON data with recursively sorted object keys and preserved array order. */
export function canonicalizeJson(value: unknown): string {
  return canonicalizeJsonValue(value, new Set());
}

/** Calculates the lowercase SHA-256 for a Registry envelope with its digest field omitted. */
export function calculateRegistryEnvelopeSha256(input: unknown): string {
  const envelope = RegistryEnvelopeDigestInputV1Schema.parse(input);
  const content = {
    schemaVersion: envelope.schemaVersion,
    id: envelope.id,
    version: envelope.version,
    kind: envelope.kind,
    source: envelope.source,
    payload: envelope.payload,
  };

  return createHash("sha256").update(canonicalizeJson(content), "utf8").digest("hex");
}

/** Loads a decoded local Registry and verifies its payload contract and content digest. */
export function loadRegistryEnvelopeV1<TPayload = unknown>(
  input: unknown,
  payloadSchema: z.ZodType<TPayload> = z.unknown() as z.ZodType<TPayload>,
): RegistryEnvelopeV1<TPayload> {
  const parsed = createRegistryEnvelopeV1Schema(payloadSchema).safeParse(input);
  if (!parsed.success) {
    throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
  }
  const envelope = parsed.data;

  let actualDigest: string;
  try {
    actualDigest = calculateRegistryEnvelopeSha256(envelope);
  } catch {
    throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
  }

  if (envelope.sha256 !== actualDigest) {
    throw new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH");
  }

  return envelope;
}

import { createHash } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  calculateRegistryEnvelopeSha256,
  canonicalizeJson,
  createRegistryEnvelopeV1Schema,
  loadRegistryEnvelopeV1,
  PayoutJpIntegrityError,
  type RegistryEnvelopeV1,
  RegistryEnvelopeV1Schema,
  type RegistryId,
  type SourceMetadataV1,
  SourceMetadataV1Schema,
} from "../src/index.js";

const payloadSchema = z.strictObject({
  kind: z.literal("synthetic-directory"),
  entries: z.array(z.strictObject({ code: z.string() })),
});

type TestPayload = z.infer<typeof payloadSchema>;

const unsignedRegistry = {
  schemaVersion: "1",
  id: "synthetic-directory",
  version: "2026-09-04",
  kind: "synthetic-directory",
  source: {
    publisher: "PayoutJP tests",
    uri: "urn:payoutjp:test:synthetic-directory",
    retrievedAt: "2026-09-04",
    effectiveAsOf: "2026-09-04T12:00:00+09:00",
    license: "CC0-1.0",
    notes: ["Fictional test data."],
  },
  payload: {
    kind: "synthetic-directory",
    entries: [{ code: "1234" }],
  },
} as const;

const validRegistry = {
  ...unsignedRegistry,
  sha256: calculateRegistryEnvelopeSha256(unsignedRegistry),
};

describe("RegistryEnvelopeV1Schema", () => {
  it("parses a strict Registry envelope and brands its ID", () => {
    const registry = createRegistryEnvelopeV1Schema(payloadSchema).parse(validRegistry);

    expect(registry).toEqual(validRegistry);
    expectTypeOf(registry.id).toEqualTypeOf<RegistryId>();
    expectTypeOf(registry.payload).toEqualTypeOf<TestPayload>();
  });

  it.each([
    ["schema version", { schemaVersion: "2" }],
    ["empty ID", { id: "" }],
    ["empty version", { version: "" }],
    ["empty kind", { kind: "" }],
    ["uppercase digest", { sha256: "A".repeat(64) }],
  ])("rejects invalid envelope metadata: %s", (_case, override) => {
    expect(RegistryEnvelopeV1Schema.safeParse({ ...validRegistry, ...override }).success).toBe(
      false,
    );
  });

  it.each([
    ["empty publisher", { publisher: "" }],
    ["invalid retrieval date", { retrievedAt: "2026-02-30" }],
    ["timezone-free date-time", { retrievedAt: "2026-09-04T12:00:00" }],
    ["invalid effective date", { effectiveAsOf: "yesterday" }],
    ["empty license", { license: "" }],
    ["empty note", { notes: [""] }],
  ])("rejects invalid source metadata: %s", (_case, override) => {
    expect(SourceMetadataV1Schema.safeParse({ ...validRegistry.source, ...override }).success).toBe(
      false,
    );
  });

  it.each([
    { ...validRegistry, unexpected: true },
    { ...validRegistry, source: { ...validRegistry.source, unexpected: true } },
    { ...validRegistry, payload: { ...validRegistry.payload, unexpected: true } },
  ])("rejects unknown fields in strict Registry contracts", (input) => {
    expect(createRegistryEnvelopeV1Schema(payloadSchema).safeParse(input).success).toBe(false);
  });

  it("is the source of truth for non-generic Registry metadata types", () => {
    expectTypeOf<SourceMetadataV1>().toEqualTypeOf<z.infer<typeof SourceMetadataV1Schema>>();
    expectTypeOf<RegistryEnvelopeV1<TestPayload>["payload"]>().toEqualTypeOf<TestPayload>();
  });
});

describe("canonical Registry digest", () => {
  it("sorts object keys recursively without using insertion order", () => {
    expect(canonicalizeJson({ z: 0, nested: { b: 2, a: 1 }, a: 3 })).toBe(
      '{"a":3,"nested":{"a":1,"b":2},"z":0}',
    );
    expect(canonicalizeJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalizeJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("matches a fixed SHA-256 vector", () => {
    const canonical = canonicalizeJson({ b: 2, a: 1 });
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
    expect(calculateRegistryEnvelopeSha256(unsignedRegistry)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("preserves array order", () => {
    expect(canonicalizeJson([1, 2])).not.toBe(canonicalizeJson([2, 1]));
  });

  it.each([undefined, 1n, Number.NaN, Number.POSITIVE_INFINITY, new Date()])(
    "rejects a non-JSON value",
    (value) => {
      expect(() => canonicalizeJson(value)).toThrow(TypeError);
    },
  );

  it("rejects cyclic values", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(() => canonicalizeJson(cyclic)).toThrow(
      new TypeError("Canonical JSON does not accept cyclic values"),
    );
  });

  it("rejects sparse arrays instead of serializing holes ambiguously", () => {
    const sparse = new Array(2);
    sparse[1] = "present";

    expect(() => canonicalizeJson(sparse)).toThrow(
      new TypeError("Canonical JSON accepts only dense arrays"),
    );
  });

  it("rejects symbol keys and accessor properties without executing them", () => {
    const symbolObject = { safe: true, [Symbol("hidden")]: "value" };
    const accessorObject = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => "must-not-run",
    });
    const accessorArray = Object.defineProperty(["placeholder"], "0", {
      enumerable: true,
      get: () => "must-not-run",
    });

    expect(() => canonicalizeJson(symbolObject)).toThrow(
      new TypeError("Canonical JSON accepts only string object keys"),
    );
    expect(() => canonicalizeJson(accessorObject)).toThrow(
      new TypeError("Canonical JSON does not accept accessor properties"),
    );
    expect(() => canonicalizeJson(accessorArray)).toThrow(
      new TypeError("Canonical JSON accepts only dense data arrays"),
    );
  });
});

describe("loadRegistryEnvelopeV1", () => {
  it("loads a Registry only when its payload and digest are valid", () => {
    const registry = loadRegistryEnvelopeV1(validRegistry, payloadSchema);

    expect(registry).toEqual(validRegistry);
    expectTypeOf(registry).toEqualTypeOf<RegistryEnvelopeV1<TestPayload>>();
  });

  it("rejects payload tampering after digest creation", () => {
    const tampered = {
      ...validRegistry,
      payload: { ...validRegistry.payload, entries: [{ code: "9999" }] },
    };

    expect(() => loadRegistryEnvelopeV1(tampered, payloadSchema)).toThrow(
      new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH"),
    );
  });

  it("rejects an invalid payload contract before digest verification", () => {
    const invalid = {
      ...validRegistry,
      payload: { ...validRegistry.payload, entries: [{ code: 1234 }] },
    };

    expect(() => loadRegistryEnvelopeV1(invalid, payloadSchema)).toThrow(
      new PayoutJpIntegrityError("PJP_REGISTRY_INVALID"),
    );
  });

  it("maps a non-JSON payload schema transform to a stable integrity error", () => {
    const nonJsonPayloadSchema = z.unknown().transform(() => new Date("2026-09-04T00:00:00Z"));

    expect(() => loadRegistryEnvelopeV1(validRegistry, nonJsonPayloadSchema)).toThrow(
      new PayoutJpIntegrityError("PJP_REGISTRY_INVALID"),
    );
  });
});

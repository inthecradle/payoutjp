import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PayoutJpIntegrityError } from "@payoutjp/core";
import { describe, expect, it } from "vitest";
import {
  JpycContractRegistryV1Schema,
  jpycOfficialMainnetRegistryV1,
  loadJpycContractRegistryV1,
} from "../src/index.js";

const fixturePath = fileURLToPath(
  new URL("../../../fixtures/jpyc/registry/jpyc-official-mainnet.json", import.meta.url),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;

describe("JPYC Contract Registry", () => {
  it("loads the official digest-verified four-chain snapshot", () => {
    const registry = loadJpycContractRegistryV1(fixture);

    expect(registry).toEqual(jpycOfficialMainnetRegistryV1);
    expect(registry.sha256).toBe(
      "17fa561fc0135c43660a8ead841f169690d7f94dc3f99c7b41f8f2a2241576bf",
    );
    expect(registry.payload.entries.map((entry) => entry.chainId)).toEqual([1, 137, 8217, 43114]);
    expect(new Set(registry.payload.entries.map((entry) => entry.contractAddress))).toEqual(
      new Set(["0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29"]),
    );
    expect(registry.payload.entries.every((entry) => entry.provenance === "official")).toBe(true);
  });

  it("requires current entries to have official regulated-JPYC provenance", () => {
    const entry = jpycOfficialMainnetRegistryV1.payload.entries[0];
    if (entry === undefined) {
      throw new Error("official fixture must contain an entry");
    }
    expect(
      JpycContractRegistryV1Schema.safeParse({
        kind: "jpyc-contracts",
        entries: [{ ...entry, provenance: "third-party" }],
      }).success,
    ).toBe(false);
    expect(
      JpycContractRegistryV1Schema.safeParse({
        kind: "jpyc-contracts",
        entries: [{ ...entry, product: "unknown" }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate current pairs, malformed addresses, and noncanonical ordering", () => {
    const entries = jpycOfficialMainnetRegistryV1.payload.entries;
    const first = entries[0];
    const second = entries[1];
    if (first === undefined || second === undefined) {
      throw new Error("official fixture must contain multiple entries");
    }
    expect(
      JpycContractRegistryV1Schema.safeParse({
        kind: "jpyc-contracts",
        entries: [
          first,
          { ...first, contractAddress: "0x1111111111111111111111111111111111111111" },
        ],
      }).success,
    ).toBe(false);
    expect(
      JpycContractRegistryV1Schema.safeParse({
        kind: "jpyc-contracts",
        entries: [{ ...first, contractAddress: "not-an-address" }],
      }).success,
    ).toBe(false);
    expect(
      JpycContractRegistryV1Schema.safeParse({
        kind: "jpyc-contracts",
        entries: [second, first],
      }).success,
    ).toBe(false);
  });

  it("maps envelope-kind and digest failures to stable integrity errors", () => {
    expect(() =>
      loadJpycContractRegistryV1({ ...jpycOfficialMainnetRegistryV1, kind: "other" }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_INVALID"));
    expect(() =>
      loadJpycContractRegistryV1({
        ...jpycOfficialMainnetRegistryV1,
        sha256: "f".repeat(64),
      }),
    ).toThrow(new PayoutJpIntegrityError("PJP_REGISTRY_DIGEST_MISMATCH"));
  });
});

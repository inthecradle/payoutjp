import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  type JpycApplicationConfigV1,
  JpycApplicationConfigV1Schema,
  type JpycDestinationV1,
  JpycDestinationV1Schema,
} from "../src/index.js";

const destination = {
  schemaVersion: "1",
  rail: "jpyc",
  id: "recipient-jpyc-001",
  chainId: 137,
  walletAddress: "0x1111111111111111111111111111111111111111",
} as const;

const applicationConfig = {
  schemaVersion: "1",
  kind: "jpyc",
  environment: "mainnet",
  chainId: 137,
  tokenContract: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
} as const;

describe("JPYC runtime contracts", () => {
  it("parses strict destination and application-config shapes", () => {
    expect(JpycDestinationV1Schema.parse(destination)).toEqual(destination);
    expect(JpycApplicationConfigV1Schema.parse(applicationConfig)).toEqual(applicationConfig);
    expectTypeOf<JpycDestinationV1>().toEqualTypeOf<z.infer<typeof JpycDestinationV1Schema>>();
    expectTypeOf<JpycApplicationConfigV1>().toEqualTypeOf<
      z.infer<typeof JpycApplicationConfigV1Schema>
    >();
  });

  it("accepts testnet as a shape so Profile rules can reject unsupported environments", () => {
    expect(
      JpycApplicationConfigV1Schema.safeParse({
        ...applicationConfig,
        environment: "testnet",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["destination schema version", { ...destination, schemaVersion: "2" }],
    ["destination rail", { ...destination, rail: "bank_transfer" }],
    ["fractional chain", { ...destination, chainId: 1.5 }],
    ["negative chain", { ...destination, chainId: -1 }],
    ["numeric address", { ...destination, walletAddress: 123 }],
    ["unknown destination field", { ...destination, extra: true }],
  ])("rejects invalid %s", (_name, input) => {
    expect(JpycDestinationV1Schema.safeParse(input).success).toBe(false);
  });

  it.each([
    ["config schema version", { ...applicationConfig, schemaVersion: "2" }],
    ["config kind", { ...applicationConfig, kind: "wallet" }],
    ["unknown environment", { ...applicationConfig, environment: "staging" }],
    ["missing token contract", { ...applicationConfig, tokenContract: undefined }],
    ["unknown config field", { ...applicationConfig, extra: true }],
  ])("rejects invalid %s", (_name, input) => {
    expect(JpycApplicationConfigV1Schema.safeParse(input).success).toBe(false);
  });
});

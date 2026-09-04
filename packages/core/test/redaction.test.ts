import { describe, expect, it } from "vitest";
import {
  createMetadataObservedValue,
  createPublicObservedValue,
  maskBankAccountNumber,
  redactAccountHolder,
  SafeObservedValueV1Schema,
  shortenTokenContract,
  shortenWalletAddress,
} from "../src/index.js";

describe("privacy-safe observed values", () => {
  it("fully redacts account holder values", () => {
    const raw = "カ）サンプル秘密名義";
    const observed = redactAccountHolder(raw);

    expect(observed).toEqual({
      classification: "redacted-account-holder",
      display: "<redacted>",
    });
    expect(JSON.stringify(observed)).not.toContain(raw);
  });

  it.each([
    ["", "<redacted>"],
    ["1", "*"],
    ["12", "**"],
    ["123", "*23"],
    ["0123456", "*****56"],
  ])("masks a bank account number without exposing short values", (raw, expected) => {
    const observed = maskBankAccountNumber(raw);

    expect(observed).toEqual({ classification: "masked-bank-account", display: expected });
    if (raw.length > 0) {
      expect(observed.display).not.toBe(raw);
    }
  });

  it("counts Unicode code points rather than UTF-16 halves while masking", () => {
    expect(maskBankAccountNumber("1😀3").display).toBe("*😀3");
  });

  it("shortens wallet and token contract addresses to a fixed disclosure window", () => {
    const raw = "0x1234567890abcdef1234567890abcdef1234cdef";

    expect(shortenWalletAddress(raw)).toEqual({
      classification: "short-wallet-address",
      display: "0x1234…cdef",
    });
    expect(shortenTokenContract(raw)).toEqual(shortenWalletAddress(raw));
    expect(shortenWalletAddress(raw).display).not.toBe(raw);
  });

  it.each(["", "0x1", "short-value"])("fully redacts a short address-like value", (raw) => {
    expect(shortenWalletAddress(raw).display).toBe("<redacted>");
  });

  it("requires explicit classification for public and metadata-only values", () => {
    expect(createPublicObservedValue("bankCode=1234")).toEqual({
      classification: "public",
      display: "bankCode=1234",
    });
    expect(createMetadataObservedValue("length=7")).toEqual({
      classification: "metadata-only",
      display: "length=7",
    });
  });

  it("creates values accepted by the finding observed-value schema", () => {
    const values = [
      redactAccountHolder("secret"),
      maskBankAccountNumber("0123456"),
      shortenWalletAddress("0x1234567890abcdef1234567890abcdef1234cdef"),
      createPublicObservedValue("bankCode=1234"),
      createMetadataObservedValue("length=7"),
    ];

    for (const value of values) {
      expect(SafeObservedValueV1Schema.safeParse(value).success).toBe(true);
    }
  });
});

import type { SafeObservedValueV1 } from "./finding.js";

const redactedDisplay = "<redacted>";
const maskCharacter = "*";
const shortenedSeparator = "…";

/** Marks an explicitly public value as safe for finding output. */
export function createPublicObservedValue(display: string): SafeObservedValueV1 {
  return { classification: "public", display };
}

/** Emits caller-provided non-sensitive metadata without attaching a source value. */
export function createMetadataObservedValue(display: string): SafeObservedValueV1 {
  return { classification: "metadata-only", display };
}

/** Fully redacts an account holder value regardless of its content or length. */
export function redactAccountHolder(_value: unknown): SafeObservedValueV1 {
  return { classification: "redacted-account-holder", display: redactedDisplay };
}

/** Masks a bank account number while preserving at most its final two characters. */
export function maskBankAccountNumber(value: string): SafeObservedValueV1 {
  const characters = [...value];
  const visibleCharacters = characters.length > 2 ? characters.slice(-2) : [];
  const maskedLength = characters.length - visibleCharacters.length;
  const display =
    `${maskCharacter.repeat(maskedLength)}${visibleCharacters.join("")}` || redactedDisplay;

  return { classification: "masked-bank-account", display };
}

function shortenAddress(value: string): string {
  const prefixLength = 6;
  const suffixLength = 4;
  const minimumAddressLikeLength = 20;
  if (value.length < minimumAddressLikeLength) {
    return redactedDisplay;
  }

  return `${value.slice(0, prefixLength)}${shortenedSeparator}${value.slice(-suffixLength)}`;
}

/** Shortens a public wallet address for normal finding output. */
export function shortenWalletAddress(value: string): SafeObservedValueV1 {
  return { classification: "short-wallet-address", display: shortenAddress(value) };
}

/** Shortens a public token contract address using the wallet-address disclosure policy. */
export function shortenTokenContract(value: string): SafeObservedValueV1 {
  return { classification: "short-wallet-address", display: shortenAddress(value) };
}

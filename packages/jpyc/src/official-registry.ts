import { loadJpycContractRegistryV1 } from "./registry.js";

/** Official JPYC current-mainnet snapshot reviewed on 2026-09-02. */
export const jpycOfficialMainnetRegistryV1 = loadJpycContractRegistryV1({
  schemaVersion: "1",
  id: "jpyc-official-mainnet",
  version: "2026-09-02",
  kind: "jpyc-contracts",
  sha256: "17fa561fc0135c43660a8ead841f169690d7f94dc3f99c7b41f8f2a2241576bf",
  source: {
    publisher: "JPYC Inc.",
    uri: "https://github.com/jpycoin/.github/blob/main/profile/README.md",
    retrievedAt: "2026-09-02",
    notes: [
      "Current regulated JPYC mainnet contracts from the official JPYC GitHub organization.",
      "The official source states that prepaid JPYC is outside this current allowlist.",
    ],
  },
  payload: {
    kind: "jpyc-contracts",
    entries: [
      {
        environment: "mainnet",
        network: "Ethereum",
        chainId: 1,
        contractAddress: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
        status: "current",
        product: "regulated-jpyc",
        provenance: "official",
      },
      {
        environment: "mainnet",
        network: "Polygon",
        chainId: 137,
        contractAddress: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
        status: "current",
        product: "regulated-jpyc",
        provenance: "official",
      },
      {
        environment: "mainnet",
        network: "Kaia",
        chainId: 8217,
        contractAddress: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
        status: "current",
        product: "regulated-jpyc",
        provenance: "official",
      },
      {
        environment: "mainnet",
        network: "Avalanche C-Chain",
        chainId: 43114,
        contractAddress: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",
        status: "current",
        product: "regulated-jpyc",
        provenance: "official",
      },
    ],
  },
});

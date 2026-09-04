import { loadCompatibilityProfileV1 } from "@payoutjp/core";
import { jpycOfficialMainnetRegistryV1 } from "./official-registry.js";
import { jpycRules } from "./rules.js";

/** Verified Profile pinned to the reviewed 2026-09-02 official mainnet snapshot. */
export const jpycCurrentMainnetProfileV1 = loadCompatibilityProfileV1(
  {
    schemaVersion: "1",
    id: "jpyc-current-mainnet",
    version: "2026.09.02",
    status: "verified",
    rail: "jpyc",
    title: "Current regulated JPYC mainnet",
    description:
      "Validates JPYC destinations and optional application routing against an exact official snapshot.",
    rules: [
      { id: "JPYC-ADDRESS-001", enabled: true, params: {} },
      { id: "JPYC-ADDRESS-002", enabled: true, params: {} },
      {
        id: "JPYC-ADDRESS-003",
        enabled: true,
        params: { policy: "mixed-case" },
      },
      {
        id: "JPYC-ADDRESS-004",
        enabled: true,
        params: { environment: "mainnet" },
      },
      {
        id: "JPYC-CHAIN-001",
        enabled: true,
        params: { environment: "mainnet" },
      },
      { id: "JPYC-CHAIN-002", enabled: true, params: {} },
      {
        id: "JPYC-ENV-001",
        enabled: true,
        params: { allowedEnvironments: ["mainnet"] },
      },
      { id: "JPYC-CONTRACT-002", enabled: true, params: {} },
      { id: "JPYC-CONTRACT-003", enabled: true, params: {} },
    ],
    registries: [
      {
        id: jpycOfficialMainnetRegistryV1.id,
        version: jpycOfficialMainnetRegistryV1.version,
        sha256: jpycOfficialMainnetRegistryV1.sha256,
      },
    ],
    sourceNotes: [
      "Current chain and contract pairs come only from the pinned official JPYC Registry.",
      "Checksum findings are warnings and do not prove wallet ownership.",
      "No RPC, balance, token metadata, transaction, or ownership check is performed.",
    ],
  },
  { rules: jpycRules },
);

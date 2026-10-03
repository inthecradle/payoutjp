import { mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import { bankRules } from "@payoutjp/bank";
import {
  CompatibilityProfileV1Schema,
  loadCompatibilityProfileV1,
  PayoutJpConfigurationError,
} from "@payoutjp/core";
import { loadBankDirectoryRegistryV1 } from "@payoutjp/bank";
import {
  loadProfileCandidates,
  loadRegistryCandidates,
  resolveBankRegistries,
} from "./artifacts.js";
import type { ResolvedCliConfig } from "./config.js";
import { CliInputError } from "./io.js";

/** Lists verified locally installed Bank Profiles, rejecting ambiguous identities. */
export async function installedProfiles(config: ResolvedCliConfig, experimental: boolean) {
  const identities = new Set<string>();
  return (await loadProfileCandidates(config.profilePaths))
    .map((input) => {
      const structural = CompatibilityProfileV1Schema.safeParse(input);
      if (!structural.success) throw new PayoutJpConfigurationError("PJP_PROFILE_INVALID");
      if (structural.data.rail !== "bank_transfer")
        throw new PayoutJpConfigurationError("PJP_PROFILE_INVALID");
      const profile = loadCompatibilityProfileV1(structural.data, {
        rules: bankRules,
        allowExperimental: experimental,
        allowRetired: true,
      });
      const key = `${profile.id}@${profile.version}`;
      if (identities.has(key)) throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
      identities.add(key);
      return profile;
    })
    .sort((a, b) => (`${a.id}@${a.version}` < `${b.id}@${b.version}` ? -1 : 1));
}

/** Shows immutable local Registry metadata after verifying the payload and digest. */
export async function registryStatus(config: ResolvedCliConfig) {
  const identities = new Set<string>();
  return (await loadRegistryCandidates(config.registryPaths))
    .map((input) => {
      const registry = loadBankDirectoryRegistryV1(input);
      const key = `${registry.id}@${registry.version}`;
      if (identities.has(key)) throw new CliInputError("duplicate_registry");
      identities.add(key);
      return {
        id: registry.id,
        version: registry.version,
        sha256: registry.sha256,
        source: registry.source,
        digestValid: true,
      };
    })
    .sort((a, b) => (`${a.id}@${a.version}` < `${b.id}@${b.version}` ? -1 : 1));
}

/** Checks all local Profile pins without changing any data or fetching Registry updates. */
export async function diagnose(config: ResolvedCliConfig, experimental: boolean) {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  const profiles = await installedProfiles(config, experimental);
  const registries = await registryStatus(config);
  for (const profile of profiles) await resolveBankRegistries(profile, config.registryPaths);
  return {
    status: "PASS",
    node: process.versions.node,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      version: profile.version,
      rules: profile.rules.filter((rule) => rule.enabled).map((rule) => rule.id),
      registryLookupEnabled: profile.rules.some(
        (rule) =>
          rule.enabled && ["BANK-CODE-002", "BANK-BRANCH-002", "BANK-BRANCH-003"].includes(rule.id),
      ),
    })),
    registries,
    notice:
      "Only declared checks are performed. Registry completeness/currentness and account existence are not verified.",
  };
}

/** Creates a synthetic starter project only in a newly created directory. */
export async function initialize(directory: string) {
  const target = resolve(directory);
  try {
    await mkdir(target);
    const files: Readonly<Record<string, string>> = {
      "payoutjp.config.yml": "version: 1\nfailOn: error\n",
      "columns.json": `${JSON.stringify({ schemaVersion: "1", columns: { bankCode: "銀行コード", branchCode: "支店コード", accountType: "預金種目", accountNumber: "口座番号", accountHolder: "口座名義" }, values: { accountType: { 普通: "ordinary", 当座: "checking" } }, ignoreColumns: ["備考"] }, null, 2)}\n`,
      "recipients.csv":
        "銀行コード,支店コード,預金種目,口座番号,口座名義,備考\n1234,001,普通,0123456,SYNTHETIC,架空の正常例\n1234,001,普通,12X4567,SYNTHETIC,口座番号を文字列で確認\n",
      "README.md":
        "# Bank CSV sample\n\nAll values are synthetic. No production Bank Registry is bundled.\n\nRun from this directory:\n\n```sh\npayoutjp doctor\npayoutjp audit recipients.csv --profile bank-generic-jp@0.1.0 --mapping columns.json --locale ja\n```\n\nThe second row deliberately fails. Manually replace its fictional account number with `0123456` and rerun.\n\n```sh\npayoutjp audit recipients.csv --profile bank-generic-jp@0.1.0 --mapping columns.json --format json --output report.json\n```\n\nUse `--overwrite-report` to explicitly replace a previous audit report. Never upload the input CSV.\n",
    };
    for (const [name, contents] of Object.entries(files)) {
      const handle = await open(resolve(target, name), "wx", 0o600);
      try {
        await handle.writeFile(contents);
      } finally {
        await handle.close();
      }
    }
    return { status: "CREATED", files: Object.keys(files).sort() };
  } catch {
    throw new CliInputError("init_requires_new_directory", "directory");
  }
}

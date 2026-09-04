import type { Dirent, Stats } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  type BankDirectoryRegistryV1,
  bankGenericJpProfileV1,
  bankRules,
  loadBankDirectoryRegistryV1,
} from "@payoutjp/bank";
import {
  type CompatibilityProfileV1,
  CompatibilityProfileV1Schema,
  loadCompatibilityProfileV1,
  PayoutJpConfigurationError,
  PayoutJpIntegrityError,
  type RegistryEnvelopeV1,
  RegistryEnvelopeV1Schema,
} from "@payoutjp/core";

type ArtifactKind = "profile" | "registry";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function artifactError(kind: ArtifactKind): Error {
  return kind === "profile"
    ? new PayoutJpConfigurationError("PJP_PROFILE_INVALID")
    : new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
}

async function collectJsonFiles(root: string, kind: ArtifactKind): Promise<readonly string[]> {
  let metadata: Stats;
  try {
    metadata = await lstat(root);
  } catch {
    throw artifactError(kind);
  }

  if (metadata.isSymbolicLink()) {
    throw artifactError(kind);
  }
  if (metadata.isFile()) {
    if (extname(root).toLowerCase() !== ".json") {
      throw artifactError(kind);
    }
    return [root];
  }
  if (!metadata.isDirectory()) {
    throw artifactError(kind);
  }

  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    throw artifactError(kind);
  }

  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => compareStrings(left.name, right.name))) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectJsonFiles(path, kind)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      paths.push(path);
    }
  }
  return paths;
}

async function readJsonArtifact(path: string, kind: ArtifactKind): Promise<unknown> {
  try {
    const contents = await readFile(path);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(contents);
    return JSON.parse(decoded) as unknown;
  } catch {
    throw artifactError(kind);
  }
}

async function loadProfileCandidates(paths: readonly string[]): Promise<readonly unknown[]> {
  const candidates: unknown[] = [bankGenericJpProfileV1];
  for (const root of paths) {
    for (const file of await collectJsonFiles(root, "profile")) {
      candidates.push(await readJsonArtifact(file, "profile"));
    }
  }
  return candidates;
}

function matchesSelector(profile: CompatibilityProfileV1, selector: string): boolean {
  if (profile.id === selector) {
    return true;
  }
  return `${profile.id}@${profile.version}` === selector;
}

/** Loads exactly one Bank Profile selected from built-ins and configured local JSON paths. */
export async function resolveBankProfile(
  selector: string,
  paths: readonly string[],
  allowExperimental: boolean,
): Promise<CompatibilityProfileV1> {
  const candidates = await loadProfileCandidates(paths);
  const structuralProfiles = candidates.map((candidate) => {
    const parsed = CompatibilityProfileV1Schema.safeParse(candidate);
    if (!parsed.success) {
      throw new PayoutJpConfigurationError("PJP_PROFILE_INVALID");
    }
    return parsed.data;
  });
  const matches = structuralProfiles.filter(
    (profile) => profile.rail === "bank_transfer" && matchesSelector(profile, selector),
  );
  if (matches.length === 0) {
    throw new PayoutJpConfigurationError("PJP_PROFILE_NOT_FOUND");
  }
  if (matches.length !== 1) {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }
  return loadCompatibilityProfileV1(matches[0], {
    rules: bankRules,
    allowExperimental,
  });
}

async function loadRegistryCandidates(paths: readonly string[]): Promise<readonly unknown[]> {
  const candidates: unknown[] = [];
  for (const root of paths) {
    for (const file of await collectJsonFiles(root, "registry")) {
      candidates.push(await readJsonArtifact(file, "registry"));
    }
  }
  return candidates;
}

/** Loads only the exact Registry versions pinned by the selected Bank Profile. */
export async function resolveBankRegistries(
  profile: CompatibilityProfileV1,
  paths: readonly string[],
): Promise<ReadonlyMap<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>> {
  if (profile.registries.length === 0) {
    return new Map();
  }

  const candidates = await loadRegistryCandidates(paths);
  const structuralRegistries = candidates.map((candidate) => {
    const parsed = RegistryEnvelopeV1Schema.safeParse(candidate);
    if (!parsed.success) {
      throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
    }
    return parsed.data;
  });
  const selected = new Map<string, RegistryEnvelopeV1<BankDirectoryRegistryV1>>();

  for (const reference of profile.registries) {
    const matches = structuralRegistries.filter(
      (registry) => registry.id === reference.id && registry.version === reference.version,
    );
    if (matches.length === 0) {
      throw new PayoutJpIntegrityError("PJP_REGISTRY_NOT_FOUND");
    }
    if (matches.length !== 1) {
      throw new PayoutJpIntegrityError("PJP_REGISTRY_INVALID");
    }
    selected.set(reference.id, loadBankDirectoryRegistryV1(matches[0]));
  }

  return selected;
}

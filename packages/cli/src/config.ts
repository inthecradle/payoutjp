import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { PayoutJpConfigurationError } from "@payoutjp/core";
import { parse } from "yaml";
import { z } from "zod";

export const failOnThresholdValues = Object.freeze(["error", "warning", "never"] as const);
export type FailOnThreshold = (typeof failOnThresholdValues)[number];

const PathsConfigSchema = z.strictObject({
  profiles: z.array(z.string().min(1)).optional(),
  registries: z.array(z.string().min(1)).optional(),
});

// Scanner settings are accepted so the documented shared config remains forward-compatible,
// but this M4 subset does not discover files or invoke scanner behavior.
const ScanConfigSchema = z.strictObject({
  include: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional(),
  maxFileBytes: z.number().int().positive().optional(),
});

const CliConfigFileSchema = z.strictObject({
  version: z.literal(1),
  failOn: z.enum(failOnThresholdValues).optional(),
  redaction: z.literal("strict").optional(),
  paths: PathsConfigSchema.optional(),
  scan: ScanConfigSchema.optional(),
});

export interface ResolvedCliConfig {
  readonly configPath?: string;
  readonly failOn: FailOnThreshold;
  readonly profilePaths: readonly string[];
  readonly registryPaths: readonly string[];
}

export interface ResolveCliConfigOptions {
  readonly cwd: string;
  readonly explicitPath?: string;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }
}

function resolveConfiguredPaths(
  baseDirectory: string,
  paths: readonly string[],
): readonly string[] {
  return paths.map((path) => (isAbsolute(path) ? resolve(path) : resolve(baseDirectory, path)));
}

async function parseConfigFile(path: string): Promise<z.infer<typeof CliConfigFileSchema>> {
  let contents: Uint8Array;
  try {
    contents = await readFile(path);
  } catch {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }

  let input: unknown;
  try {
    input = parse(decoded, { maxAliasCount: 0, merge: false });
  } catch {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }

  const parsed = CliConfigFileSchema.safeParse(input);
  if (!parsed.success) {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }
  return parsed.data;
}

/** Resolves an explicit config or the current directory default without searching parents. */
export async function resolveCliConfig(
  options: ResolveCliConfigOptions,
): Promise<ResolvedCliConfig> {
  const defaultPath = join(options.cwd, "payoutjp.config.yml");
  const candidatePath =
    options.explicitPath === undefined
      ? defaultPath
      : isAbsolute(options.explicitPath)
        ? resolve(options.explicitPath)
        : resolve(options.cwd, options.explicitPath);
  const required = options.explicitPath !== undefined;

  if (!(await exists(candidatePath))) {
    if (required) {
      throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
    }
    return {
      failOn: "error",
      profilePaths: [],
      registryPaths: [],
    };
  }

  const config = await parseConfigFile(candidatePath);
  const baseDirectory = dirname(candidatePath);
  return {
    configPath: candidatePath,
    failOn: config.failOn ?? "error",
    profilePaths: resolveConfiguredPaths(baseDirectory, config.paths?.profiles ?? []),
    registryPaths: resolveConfiguredPaths(baseDirectory, config.paths?.registries ?? []),
  };
}

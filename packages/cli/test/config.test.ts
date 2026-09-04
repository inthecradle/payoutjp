import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PayoutJpConfigurationError } from "@payoutjp/core";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCliConfig } from "../src/config.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "payoutjp-cli-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("resolveCliConfig", () => {
  it("uses safe defaults and does not search parent directories", async () => {
    const parent = await temporaryDirectory();
    const child = join(parent, "child");
    await mkdir(child);
    await writeFile(join(parent, "payoutjp.config.yml"), "version: 1\nfailOn: warning\n");

    await expect(resolveCliConfig({ cwd: child })).resolves.toEqual({
      failOn: "error",
      profilePaths: [],
      registryPaths: [],
    });
  });

  it("resolves configured paths relative to the config file", async () => {
    const directory = await temporaryDirectory();
    const configDirectory = join(directory, "config");
    await mkdir(configDirectory);
    await writeFile(
      join(configDirectory, "custom.yml"),
      [
        "version: 1",
        "failOn: warning",
        "redaction: strict",
        "paths:",
        "  profiles: [../profiles]",
        "  registries: [../registries]",
        "",
      ].join("\n"),
    );

    await expect(
      resolveCliConfig({ cwd: directory, explicitPath: "config/custom.yml" }),
    ).resolves.toEqual({
      configPath: join(configDirectory, "custom.yml"),
      failOn: "warning",
      profilePaths: [join(directory, "profiles")],
      registryPaths: [join(directory, "registries")],
    });
  });

  it("rejects missing explicit config and unknown keys", async () => {
    const directory = await temporaryDirectory();
    await expect(
      resolveCliConfig({ cwd: directory, explicitPath: "missing.yml" }),
    ).rejects.toMatchObject({ code: "PJP_CONFIG_INVALID", exitCode: 2 });
    await writeFile(join(directory, "payoutjp.config.yml"), "version: 1\nunsafe: true\n");
    await expect(resolveCliConfig({ cwd: directory })).rejects.toBeInstanceOf(
      PayoutJpConfigurationError,
    );
  });
});

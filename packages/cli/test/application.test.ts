import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { bankGenericJpProfileV1 } from "@payoutjp/bank";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const cliPath = join(repositoryRoot, "packages/cli/dist/main.js");
const fixture = (...parts: readonly string[]) => join(repositoryRoot, "fixtures", ...parts);
const temporaryDirectories: string[] = [];

function runCli(args: readonly string[], cwd = repositoryRoot) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function golden(name: string): string {
  return readFileSync(fixture("expected", "cli", name), "utf8");
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true });
  });
});

describe("payoutjp CLI", () => {
  it("prints the version without diagnostics", () => {
    const result = runCli(["--version"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("0.0.0\n");
    expect(result.stderr).toBe("");
  });

  it("exposes only the authorized command surface", () => {
    const result = runCli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate");
    expect(result.stdout).not.toMatch(/\b(audit|scan|profiles|registry)\b/u);
    expect(result.stderr).toBe("");
  });

  it("renders the text golden with a configured local Profile and Registry", () => {
    const result = runCli([
      "validate",
      fixture("cli", "requests", "valid-synthetic.json"),
      "--config",
      fixture("cli", "payoutjp.config.yml"),
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(golden("valid-synthetic.txt"));
    expect(result.stderr).toBe("");
  });

  it("renders canonical JSON with no extra stdout text", () => {
    const result = runCli([
      "validate",
      fixture("cli", "requests", "valid-synthetic.json"),
      "--config",
      fixture("cli", "payoutjp.config.yml"),
      "--format",
      "json",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(golden("valid-synthetic.json"));
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stderr).toBe("");
  });

  it("returns code 1 and redacts sensitive values in text and JSON", () => {
    const input = fixture("cli", "requests", "invalid-private.json");
    const text = runCli(["validate", input]);
    const json = runCli(["validate", input, "--format", "json"]);

    expect(text.status).toBe(1);
    expect(text.stdout).toBe(golden("invalid-private.txt"));
    expect(json.status).toBe(1);
    expect(JSON.parse(json.stdout)).toMatchObject({ status: "FAIL" });
    for (const result of [text, json]) {
      expect(`${result.stdout}${result.stderr}`).not.toContain("TOP SECRET HOLDER");
      expect(`${result.stdout}${result.stderr}`).not.toContain("12345SECRET");
    }
  });

  it("applies the complete fail-on matrix", () => {
    const warning = fixture("cli", "requests", "warning.json");
    const failure = fixture("cli", "requests", "invalid-private.json");

    expect(runCli(["validate", warning]).status).toBe(0);
    expect(runCli(["validate", warning, "--fail-on", "warning"]).status).toBe(1);
    expect(runCli(["validate", warning, "--fail-on", "never"]).status).toBe(0);
    expect(runCli(["validate", failure, "--fail-on", "error"]).status).toBe(1);
    expect(runCli(["validate", failure, "--fail-on", "never"]).status).toBe(0);
  });

  it("lets an explicit flag override the config fail-on value", () => {
    const directory = mkdtempSync(join(tmpdir(), "payoutjp-cli-precedence-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "config.yml");
    writeFileSync(configPath, "version: 1\nfailOn: warning\n");
    const input = fixture("cli", "requests", "warning.json");

    expect(runCli(["validate", input, "--config", configPath]).status).toBe(1);
    expect(runCli(["validate", input, "--config", configPath, "--fail-on", "error"]).status).toBe(
      0,
    );
  });

  it("loads only the default config in the current working directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "payoutjp-cli-default-config-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "payoutjp.config.yml"), "version: 1\nfailOn: warning\n");

    const result = runCli(["validate", fixture("cli", "requests", "warning.json")], directory);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
  });

  it("requires an explicit flag for an experimental local Profile", () => {
    const directory = mkdtempSync(join(tmpdir(), "payoutjp-cli-experimental-"));
    temporaryDirectories.push(directory);
    const profiles = join(directory, "profiles");
    mkdirSync(profiles);
    writeFileSync(
      join(profiles, "experimental.json"),
      `${JSON.stringify(
        {
          ...bankGenericJpProfileV1,
          id: "bank-experimental-fixture",
          status: "experimental",
        },
        null,
        2,
      )}\n`,
    );
    const configPath = join(directory, "config.yml");
    writeFileSync(configPath, "version: 1\npaths:\n  profiles: [./profiles]\n");
    const input = fixture("bank", "destinations", "valid-synthetic.json");
    const args = [
      "validate",
      input,
      "--config",
      configPath,
      "--profile",
      "bank-experimental-fixture@0.1.0",
    ];

    const denied = runCli(args);
    const allowed = runCli([...args, "--experimental"]);
    expect(denied.status).toBe(2);
    expect(denied.stderr).toContain("PJP_PROFILE_STATUS_NOT_ALLOWED");
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toContain("Profiles: bank-experimental-fixture@0.1.0");
  });

  it("separates safe usage/config diagnostics from stdout", () => {
    const conflict = runCli([
      "validate",
      fixture("cli", "requests", "valid-synthetic.json"),
      "--config",
      fixture("cli", "payoutjp.config.yml"),
      "--profile",
      "bank-generic-jp@0.1.0",
    ]);
    const missingRegistry = runCli([
      "validate",
      fixture("cli", "requests", "valid-synthetic.json"),
      "--config",
      fixture("cli", "no-registry.config.yml"),
    ]);

    expect(conflict.status).toBe(2);
    expect(conflict.stdout).toBe("");
    expect(conflict.stderr).toContain("PJP_CONFIG_INVALID");
    expect(missingRegistry.status).toBe(4);
    expect(missingRegistry.stdout).toBe("");
    expect(missingRegistry.stderr).toContain("PJP_REGISTRY_NOT_FOUND");
  });

  it("does not echo malformed JSON content", () => {
    const directory = mkdtempSync(join(tmpdir(), "payoutjp-cli-private-"));
    temporaryDirectories.push(directory);
    const input = join(directory, "input.json");
    writeFileSync(input, "PRIVATE-MALFORMED-VALUE{");

    const result = runCli(["validate", input, "--profile", "bank-generic-jp@0.1.0"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PJP_INPUT_INVALID");
    expect(result.stderr).not.toContain("PRIVATE-MALFORMED-VALUE");
  });

  it("writes reports to an explicit output path", () => {
    const directory = mkdtempSync(join(tmpdir(), "payoutjp-cli-output-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "report.json");
    const result = runCli([
      "validate",
      fixture("cli", "requests", "warning.json"),
      "--format",
      "json",
      "--output",
      output,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({ status: "WARNING" });
  });
});

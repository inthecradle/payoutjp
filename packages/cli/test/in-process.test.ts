import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/application.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const fixture = (...parts: readonly string[]) => join(repositoryRoot, "fixtures", ...parts);
const temporaryDirectories: string[] = [];

class CapturedOutput {
  value = "";

  write(chunk: string): void {
    this.value += chunk;
  }
}

async function capture(args: readonly string[], cwd = repositoryRoot) {
  const stdout = new CapturedOutput();
  const stderr = new CapturedOutput();
  const exitCode = await runCli(args, { cwd, stdout, stderr });
  return { exitCode, stdout: stdout.value, stderr: stderr.value };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("runCli in-process coverage", () => {
  it("executes configured validation and both report renderers", async () => {
    const input = fixture("cli", "requests", "valid-synthetic.json");
    const config = fixture("cli", "payoutjp.config.yml");
    const text = await capture(["validate", input, "--config", config]);
    const json = await capture(["validate", input, "--config", config, "--format", "json"]);

    expect(text).toMatchObject({ exitCode: 0, stderr: "" });
    expect(text.stdout).toContain("Registries: banks-synthetic@2026-09-04");
    expect(JSON.parse(json.stdout)).toMatchObject({ status: "PASS" });
    expect(json.stderr).toBe("");
  });

  it("renders redacted findings and applies finding thresholds", async () => {
    const failure = fixture("cli", "requests", "invalid-private.json");
    const warning = fixture("cli", "requests", "warning.json");
    const failed = await capture(["validate", failure]);
    const ignored = await capture(["validate", failure, "--fail-on", "never"]);
    const warningFailure = await capture(["validate", warning, "--fail-on", "warning"]);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain("Observed: <redacted>");
    expect(failed.stdout).not.toContain("TOP SECRET HOLDER");
    expect(ignored.exitCode).toBe(0);
    expect(warningFailure.exitCode).toBe(1);
  });

  it("maps usage, configuration, and integrity errors without stdout leakage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "payoutjp-cli-invalid-input-"));
    temporaryDirectories.push(directory);
    const partialWrapper = join(directory, "partial.json");
    const invalidDestination = join(directory, "invalid.json");
    await writeFile(partialWrapper, '{"schemaVersion":"1","profileId":"bank-generic-jp"}\n');
    await writeFile(
      invalidDestination,
      '{"schemaVersion":"1","rail":"bank_transfer","bankCode":"1234"}\n',
    );
    const input = fixture("cli", "requests", "valid-synthetic.json");
    const noRegistry = fixture("cli", "no-registry.config.yml");
    const malformed = fixture("cli", "requests", "invalid-private.json");
    const bare = fixture("bank", "destinations", "valid-synthetic.json");
    const cases = await Promise.all([
      capture([]),
      capture(["unknown"]),
      capture(["validate", malformed, "--profile", "different-profile"]),
      capture(["validate", input, "--config", noRegistry]),
      capture(["validate", partialWrapper]),
      capture(["validate", bare]),
      capture(["validate", invalidDestination, "--profile", "bank-generic-jp"]),
    ]);

    expect(cases.map((result) => result.exitCode)).toEqual([2, 2, 2, 4, 2, 2, 2]);
    for (const result of cases) {
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/^PJP_/u);
    }
  });

  it("supports help, version, explicit rail, and output files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "payoutjp-cli-in-process-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "report.json");
    const input = fixture("cli", "requests", "warning.json");
    const help = await capture(["--help"]);
    const version = await capture(["--version"]);
    const written = await capture([
      "validate",
      input,
      "--rail",
      "bank_transfer",
      "--format",
      "json",
      "--output",
      output,
    ]);

    expect(help).toMatchObject({ exitCode: 0, stderr: "" });
    expect(version.stdout).toBe("0.1.0-alpha.1\n");
    expect(written).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({ status: "WARNING" });
  });

  it("accepts the unique built-in Profile without an explicit version", async () => {
    const result = await capture([
      "validate",
      fixture("bank", "destinations", "valid-synthetic.json"),
      "--profile",
      "bank-generic-jp",
    ]);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("Profiles: bank-generic-jp@0.1.0");
  });
});

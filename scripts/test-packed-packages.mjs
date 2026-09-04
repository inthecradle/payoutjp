import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedVersion = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
).version;
const packageManagerPath = process.env.npm_execpath;

if (packageManagerPath === undefined) {
  throw new Error(
    "Run this check through pnpm so npm_execpath identifies the pinned package manager",
  );
}

function runPnpm(args, cwd, options = {}) {
  return execFileSync(process.execPath, [packageManagerPath, ...args], {
    cwd,
    encoding: "utf8",
    ...options,
  });
}

function archiveEntries(archive) {
  return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
}

function archivedPackageJson(archive) {
  return JSON.parse(
    execFileSync("tar", ["-xOzf", archive, "package/package.json"], { encoding: "utf8" }),
  );
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "payoutjp-release-check-"));
const packDirectory = join(temporaryRoot, "packs");
const consumerDirectory = join(temporaryRoot, "consumer");
mkdirSync(packDirectory);
mkdirSync(consumerDirectory);

try {
  const publicPackages = [
    { name: "@payoutjp/core", directory: "core" },
    { name: "@payoutjp/bank", directory: "bank" },
    { name: "@payoutjp/cli", directory: "cli" },
  ];
  const archives = new Map();

  for (const entry of publicPackages) {
    const before = new Set(readdirSync(packDirectory));
    runPnpm(
      ["pack", "--pack-destination", packDirectory],
      join(repositoryRoot, "packages", entry.directory),
    );
    const created = readdirSync(packDirectory).filter((file) => !before.has(file));
    if (created.length !== 1) {
      throw new Error(`Expected one tarball for ${entry.name}, received ${created.length}`);
    }
    const archive = join(packDirectory, created[0]);
    const manifest = archivedPackageJson(archive);
    const entries = archiveEntries(archive);

    if (manifest.name !== entry.name || manifest.version !== expectedVersion) {
      throw new Error(`Unexpected package identity in ${created[0]}`);
    }
    if (manifest.private === true || manifest.license !== "Apache-2.0") {
      throw new Error(`Package ${entry.name} is not configured as public Apache-2.0 software`);
    }
    if (JSON.stringify(manifest).includes("workspace:")) {
      throw new Error(`Package ${entry.name} leaks a workspace dependency`);
    }
    if (!entries.includes("package/LICENSE") || !entries.includes("package/README.md")) {
      throw new Error(`Package ${entry.name} is missing LICENSE or README.md`);
    }
    archives.set(entry.name, archive);
  }

  const dependencies = Object.fromEntries(
    [...archives].map(([name, archive]) => [name, `file:${archive}`]),
  );
  const overrides = {
    ...dependencies,
    commander: "15.0.0",
    yaml: "2.9.0",
    zod: "4.5.4",
  };
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "payoutjp-packed-consumer",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerDirectory, "pnpm-workspace.yaml"),
    `overrides:\n${Object.entries(overrides)
      .map(([name, archive]) => `  '${name}': '${archive}'`)
      .join("\n")}\n`,
  );
  runPnpm(["install", "--prefer-offline", "--ignore-scripts"], consumerDirectory, {
    stdio: "pipe",
  });

  writeFileSync(
    join(consumerDirectory, "consumer.mjs"),
    [
      'import { bankGenericJpProfileV1, validateBankTransferDestinationV1 } from "@payoutjp/bank";',
      'import { createValidationReportV1 } from "@payoutjp/core";',
      'if (bankGenericJpProfileV1.id !== "bank-generic-jp") throw new Error("Bank export failed");',
      'const findings = validateBankTransferDestinationV1({ schemaVersion: "1", rail: "bank_transfer", bankCode: "1234", branchCode: "001", accountType: "ordinary", accountNumber: "0123456", accountHolder: "SYNTHETIC" });',
      'if (findings.length !== 0) throw new Error("Unexpected consumer finding");',
      'const report = createValidationReportV1({ tool: { name: "payoutjp", version: "consumer" }, profiles: [], registries: [], items: [] });',
      'if (report.status !== "PASS") throw new Error("Core export failed");',
      "",
    ].join("\n"),
  );
  execFileSync(process.execPath, [join(consumerDirectory, "consumer.mjs")], {
    cwd: consumerDirectory,
    stdio: "pipe",
  });

  const inputPath = join(consumerDirectory, "destination.json");
  writeFileSync(
    inputPath,
    `${JSON.stringify({ schemaVersion: "1", profileId: "bank-generic-jp@0.1.0", destination: { schemaVersion: "1", rail: "bank_transfer", bankCode: "1234", branchCode: "001", accountType: "ordinary", accountNumber: "0123456", accountHolder: "SYNTHETIC" } }, null, 2)}\n`,
  );
  const cliOutput = execFileSync(
    process.execPath,
    [join(consumerDirectory, "node_modules/@payoutjp/cli/dist/main.js"), "validate", inputPath],
    { cwd: consumerDirectory, encoding: "utf8" },
  );
  if (
    !cliOutput.includes(`Tool: payoutjp@${expectedVersion}`) ||
    !cliOutput.includes("PayoutJP: PASS")
  ) {
    throw new Error("Packaged CLI did not return the expected alpha report");
  }

  process.stdout.write(`Packed consumer check passed for ${[...archives.keys()].join(", ")}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, platform, arch } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { calculateRegistryEnvelopeSha256 } from "../packages/core/dist/index.js";
import { bankGenericJpProfileV1 } from "../packages/bank/dist/index.js";
import { runAuditCommand } from "../packages/cli/dist/audit-command.js";
import { renderJsonReport } from "../packages/cli/dist/renderers/json.js";

const root = mkdtempSync(join(tmpdir(), "payoutjp-benchmark-"));
try {
  const registry = {
    schemaVersion: "1",
    id: "benchmark-synthetic",
    version: "2026-10-03",
    kind: "bank-directory",
    sha256: "0".repeat(64),
    source: {
      publisher: "PayoutJP synthetic benchmark",
      uri: "https://example.invalid/synthetic",
      retrievedAt: "2026-10-03",
    },
    payload: {
      kind: "bank-directory",
      banks: Array.from({ length: 1000 }, (_, index) => ({
        code: String(index).padStart(4, "0"),
        branches: Array.from({ length: 30 }, (_, branch) => ({
          code: String(branch + 1).padStart(3, "0"),
        })),
      })),
    },
  };
  registry.sha256 = calculateRegistryEnvelopeSha256(registry);
  const registryPath = join(root, "registry.json");
  const profilePath = join(root, "profile.json");
  writeFileSync(registryPath, JSON.stringify(registry));
  const profile = {
    ...bankGenericJpProfileV1,
    id: "benchmark-bank",
    registries: [{ id: registry.id, version: registry.version, sha256: registry.sha256 }],
    rules: [
      ...bankGenericJpProfileV1.rules,
      ...["BANK-CODE-002", "BANK-BRANCH-002", "BANK-BRANCH-003"].map((id) => ({
        id,
        enabled: true,
        params: {},
      })),
    ],
  };
  writeFileSync(profilePath, JSON.stringify(profile));
  const results = [];
  for (const invalid of [false, true]) {
    const path = join(root, "batch.csv");
    writeFileSync(
      path,
      `bankCode,branchCode,accountType,accountNumber,accountHolder\n${Array.from({ length: 10000 }, (_, index) => `${String(index % 1000).padStart(4, "0")},001,ordinary,${invalid && index % 10 === 0 ? "12X4567" : "0123456"},SYNTHETIC`).join("\n")}\n`,
    );
    const timings = [];
    for (let trial = 0; trial < 6; trial++) {
      const start = performance.now();
      const report = await runAuditCommand({
        path,
        format: "csv",
        selector: "benchmark-bank",
        idPolicy: "generated",
        experimental: false,
        config: { failOn: "error", profilePaths: [profilePath], registryPaths: [registryPath] },
      });
      const json = renderJsonReport(report);
      const duration = performance.now() - start;
      if (
        report.summary.totalItems !== 10000 ||
        report.summary.failedItems !== (invalid ? 1000 : 0) ||
        !json.endsWith("\n")
      )
        throw new Error("Invalid benchmark result");
      if (trial > 0) timings.push(duration);
    }
    timings.sort((a, b) => a - b);
    results.push({
      rows: 10000,
      invalidRows: invalid ? 1000 : 0,
      banks: 1000,
      branches: 30000,
      medianMs: Math.round(timings[2]),
      trialsMs: timings.map(Math.round),
    });
  }
  const peakRssMiB = Math.round(process.resourceUsage().maxRSS / 1024);
  const passed = results.every((result) => result.medianMs < 5000) && peakRssMiB <= 512;
  process.stdout.write(
    `${JSON.stringify({ node: process.version, platform: platform(), arch: arch(), results, peakRssMiB, passed }, null, 2)}\n`,
  );
  if (!passed) process.exitCode = 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}

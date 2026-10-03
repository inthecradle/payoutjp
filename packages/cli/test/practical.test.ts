import net from "node:net";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { spawnSync } from "node:child_process";
import { link, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/application.js";
import { readUtf8, writeReport } from "../src/io.js";

const root = resolve(import.meta.dirname, "../../..");
const directories: string[] = [];
const good = {
  schemaVersion: "1",
  rail: "bank_transfer",
  bankCode: "1234",
  branchCode: "001",
  accountType: "ordinary",
  accountNumber: "0123456",
  accountHolder: "PRIVATE HOLDER",
};
const header = "bankCode,branchCode,accountType,accountNumber,accountHolder";
const goodCsv = `${header}\n1234,001,ordinary,0123456,PRIVATE HOLDER\n`;
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "payoutjp-practical-"));
  directories.push(path);
  return path;
}
async function capture(args: string[], cwd = root, input?: string) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    cwd,
    stdout: {
      write: (value) => {
        stdout += value;
      },
    },
    stderr: {
      write: (value) => {
        stderr += value;
      },
    },
    ...(input === undefined ? {} : { stdin: Readable.from([input]) }),
  });
  return { exitCode, stdout, stderr };
}
const audit = (format = "json") => [
  "audit",
  "-",
  "--input-format",
  format,
  "--profile",
  "bank-generic-jp",
  "--format",
  "json",
];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("practical Bank CLI", () => {
  it("continues malformed rows, preserves totals/locations and canonical JSON determinism", async () => {
    const input = JSON.stringify({
      schemaVersion: "1",
      items: [
        { destination: good },
        { destination: { ...good, accountNumber: 12345 } },
        { destination: { ...good, accountNumber: "12X4567" } },
      ],
    });
    const result = await capture(audit(), root, input);
    expect(result.exitCode).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.summary).toMatchObject({ totalItems: 3, passedItems: 1, failedItems: 2 });
    expect(report.items[1].findings[0]).toMatchObject({
      ruleId: "INPUT-SCHEMA-001",
      severity: "error",
      messageKey: "input.schema.invalid",
      path: "destination.accountNumber",
      location: { itemIndex: 1, jsonPointer: "/items/1/destination/accountNumber" },
    });
    expect((await capture(audit(), root, input)).stdout).toBe(result.stdout);
    expect(result.stdout).not.toContain("PRIVATE HOLDER");
    expect((await capture([...audit(), "--fail-on", "never"], root, input)).exitCode).toBe(0);
    expect(
      (await capture([...audit(), "--fail-on", "never"], root, "PRIVATE-BROKEN{")).exitCode,
    ).toBe(2);
  });

  it("handles BOM, CRLF, quoted multiline fields, physical starts and leading zeroes", async () => {
    const csv = `\uFEFF${header}\r\n1234,001,ordinary,0123456,"PRIVATE\r\nHOLDER"\r\n1234,001,ordinary,12X4567,SYNTHETIC\r\n`;
    const result = await capture(audit("csv"), root, csv);
    expect(result.exitCode).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.summary.totalItems).toBe(2);
    expect(report.items[0].findings[0].location.line).toBe(2);
    expect(report.items[1].findings[0].location.line).toBe(4);
    expect(
      report.items[0].findings.some(
        (finding: { ruleId: string }) => finding.ruleId === "BANK-NUMBER-001",
      ),
    ).toBe(false);
    expect(result.stdout).not.toContain("PRIVATE");
  });

  it("counts empty and short data records as failed rows without dropping them", async () => {
    const result = await capture(audit("csv"), root, `${goodCsv}\n1234,001\n`);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).summary).toMatchObject({
      totalItems: 3,
      passedItems: 1,
      failedItems: 2,
    });
    expect((await capture(audit("csv"), root, `${header}\n`)).exitCode).toBe(2);
  });

  it.each([
    `${header}\n1234,001,ordinary,0123456,"PRIVATE-UNCLOSED`,
    "bankCode,bankCode\n1234,1234\n",
    `${header},PRIVATE-UNKNOWN\n1234,001,ordinary,0123456,SYNTHETIC,SECRET\n`,
  ])("rejects malformed CSV without leaking parser excerpts", async (csv) => {
    const result = await capture(audit("csv"), root, csv);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toMatch(/PRIVATE|SECRET/u);
  });

  it("maps Japanese headers and explicit type values while ignoring private extra columns", async () => {
    const cwd = await directory();
    await writeFile(
      join(cwd, "mapping.json"),
      JSON.stringify({
        schemaVersion: "1",
        columns: {
          bankCode: "銀行",
          branchCode: "支店",
          accountType: "種別",
          accountNumber: "番号",
          accountHolder: "名義",
        },
        values: { accountType: { 普通: "ordinary" } },
        ignoreColumns: ["秘密"],
      }),
    );
    const csv =
      "銀行,支店,種別,番号,名義,秘密\n1234,001,普通,0123456,PRIVATE-HOLDER,PRIVATE-IGNORED\n1234,001,不明,0123456,PRIVATE-HOLDER,PRIVATE-IGNORED\n";
    const result = await capture([...audit("csv"), "--mapping", "mapping.json"], cwd, csv);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).summary).toMatchObject({ passedItems: 1, failedItems: 1 });
    expect(result.stdout).not.toMatch(/PRIVATE/u);
    const mismapped = csv.replace("1234,001,普通,0123456", "PRIVATE-NAME,123456789,普通,0123456");
    const safe = await capture([...audit("csv"), "--mapping", "mapping.json"], cwd, mismapped);
    expect(safe.stdout).not.toMatch(/PRIVATE|123456789/u);
  });

  it("uses generated IDs by default and validates explicit non-sensitive input IDs", async () => {
    const input = JSON.stringify({
      schemaVersion: "1",
      items: [{ id: "PRIVATE-ID", destination: { ...good, id: "\nPRIVATE-NAME" } }],
    });
    const generated = await capture(audit(), root, input);
    expect(generated.exitCode).toBe(0);
    expect(JSON.parse(generated.stdout).items[0].id).toBe("item-000001");
    expect(generated.stdout).not.toMatch(/PRIVATE/u);
    expect((await capture([...audit(), "--id-policy", "input"], root, input)).exitCode).toBe(2);
    const duplicate = JSON.stringify({
      schemaVersion: "1",
      items: [
        { id: "row-1", destination: good },
        { id: "row-1", destination: good },
      ],
    });
    expect((await capture([...audit(), "--id-policy", "input"], root, duplicate)).exitCode).toBe(2);
  });

  it("protects input, config and alias files and explicitly replaces only reports", async () => {
    const cwd = await directory();
    const path = join(cwd, "input.json");
    const original = JSON.stringify({ ...good, id: "row-1" });
    await writeFile(path, original);
    await symlink(path, join(cwd, "symbolic.json"));
    await link(path, join(cwd, "hard.json"));
    await writeFile(join(cwd, "config.yml"), "version: 1\n");
    for (const name of ["input.json", "symbolic.json", "hard.json", "config.yml"]) {
      expect(
        (
          await capture(
            [
              "validate",
              path,
              "--profile",
              "bank-generic-jp",
              "--config",
              "config.yml",
              "--output",
              name,
            ],
            cwd,
          )
        ).exitCode,
      ).toBe(2);
      expect(await readFile(path, "utf8")).toBe(original);
    }
    await writeFile(join(cwd, "report.json"), "previous");
    expect(
      (await capture([...audit("csv"), "--output", "report.json"], cwd, goodCsv)).exitCode,
    ).toBe(2);
    expect(await readFile(join(cwd, "report.json"), "utf8")).toBe("previous");
    expect(
      (
        await capture(
          [...audit("csv"), "--output", "report.json", "--overwrite-report"],
          cwd,
          goodCsv,
        )
      ).exitCode,
    ).toBe(0);
    expect(JSON.parse(await readFile(join(cwd, "report.json"), "utf8")).status).toBe("PASS");
    expect((await readdir(cwd)).some((name) => name.endsWith(".tmp"))).toBe(false);
    await expect(
      writeReport(join(cwd, "missing", "report.json"), "result", [path], false),
    ).rejects.toThrow();
  });

  it("enforces byte limits during reads, accepts the boundary and rejects invalid UTF-8", async () => {
    expect(await readUtf8("-", Readable.from(["0123"]), 4)).toBe("0123");
    await expect(readUtf8("-", Readable.from(["012", "34"]), 4)).rejects.toMatchObject({
      reason: "size_limit",
    });
    await expect(
      readUtf8("-", Readable.from([Buffer.from([0xc3, 0x28])]), 4),
    ).rejects.toMatchObject({ reason: "invalid_utf8" });
    const cwd = await directory();
    await writeFile(join(cwd, "oversized"), "01234");
    await expect(readUtf8(join(cwd, "oversized"), undefined, 4)).rejects.toThrow();
  });

  it("initializes a new sample, diagnoses it, inspects Profiles and fixes the sample", async () => {
    const cwd = await directory();
    const init = await capture(["init", "--directory", "demo"], cwd);
    expect(init.exitCode).toBe(0);
    expect((await capture(["init", "--directory", "demo"], cwd)).exitCode).toBe(2);
    const demo = join(cwd, "demo");
    const doctor = await capture(["doctor"], demo);
    expect(doctor.exitCode).toBe(0);
    expect(JSON.parse(doctor.stdout).profiles[0].registryLookupEnabled).toBe(false);
    expect((await capture(["profiles", "list"], demo)).exitCode).toBe(0);
    expect((await capture(["profiles", "show", "bank-generic-jp"], demo)).exitCode).toBe(0);
    expect((await capture(["registry", "status"], demo)).exitCode).toBe(0);
    const args = [
      "audit",
      "recipients.csv",
      "--profile",
      "bank-generic-jp",
      "--mapping",
      "columns.json",
      "--locale",
      "ja",
    ];
    const failed = await capture(args, demo);
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain("行: 3");
    expect(failed.stdout).toContain("口座番号");
    const csv = await readFile(join(demo, "recipients.csv"), "utf8");
    await writeFile(join(demo, "recipients.csv"), csv.replace("12X4567", "0123456"));
    expect((await capture(args, demo)).exitCode).toBe(0);
  });

  it("bounds human output without changing full report totals or fail policy", async () => {
    const input = JSON.stringify({
      schemaVersion: "1",
      items: Array.from({ length: 121 }, () => ({ destination: { ...good, accountNumber: 42 } })),
    });
    const args = audit();
    const full = await capture(args, root, input);
    const human = await capture(
      args
        .map((arg) => (arg === "json" ? "text" : arg))
        .map((arg, index, all) => (all[index - 1] === "--input-format" ? "json" : arg)),
      root,
      input,
    );
    expect(JSON.parse(full.stdout).summary).toMatchObject({ totalItems: 121, errors: 121 });
    expect(human.exitCode).toBe(1);
    expect(human.stdout).toContain("Omitted: 21");
  });

  it("rejects unsupported rails, conflicting Profiles, excessive rows and invalid IDs globally", async () => {
    for (const items of [
      [{ destination: { ...good, rail: "jpyc" } }],
      [{ profileId: "different-profile", destination: good }],
      Array.from({ length: 100001 }, () => ({ destination: good })),
    ]) {
      const result = await capture(
        [...audit(), "--fail-on", "never"],
        root,
        JSON.stringify({ schemaVersion: "1", items }),
      );
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    }
  });

  it("blocks accidental network use and never echoes arbitrary CLI arguments", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
    const connect = vi.spyOn(net.Socket.prototype, "connect").mockImplementation(() => {
      throw new Error("network forbidden");
    });
    const httpRequest = vi.spyOn(http, "request").mockImplementation(() => {
      throw new Error("network forbidden");
    });
    const httpsRequest = vi.spyOn(https, "request").mockImplementation(() => {
      throw new Error("network forbidden");
    });
    const lookup = vi.spyOn(dns, "lookup").mockImplementation(() => {
      throw new Error("network forbidden");
    });
    expect((await capture(audit("csv"), root, goodCsv)).exitCode).toBe(0);
    for (const call of [fetch, connect, httpRequest, httpsRequest, lookup])
      expect(call).not.toHaveBeenCalled();
    const invalid = await capture(["--PRIVATE-ARGUMENT"]);
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).not.toContain("PRIVATE-ARGUMENT");
    const processResult = spawnSync(
      process.execPath,
      [join(root, "packages/cli/dist/main.js"), ...audit("csv")],
      { input: goodCsv, encoding: "utf8", cwd: root },
    );
    expect(processResult.status).toBe(0);
    expect(JSON.parse(processResult.stdout).summary.totalItems).toBe(1);
  });
});

import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { isPayoutJpError, type PayoutJpError, PayoutJpInputError } from "@payoutjp/core";
import { Command, CommanderError, Option } from "commander";
import { z } from "zod";
import { failOnThresholdValues, resolveCliConfig } from "./config.js";
import { exitCodeForReport } from "./exit-code.js";
import { renderJsonReport } from "./renderers/json.js";
import { renderTextReport } from "./renderers/text.js";
import { runValidateCommand } from "./validate-command.js";
import { version } from "./version.js";

interface WritableTarget {
  write(value: string): unknown;
}

/** Runtime boundaries that callers may replace for deterministic embedding and tests. */
export interface RunCliOptions {
  readonly cwd?: string;
  readonly stdout?: WritableTarget;
  readonly stderr?: WritableTarget;
}

const ParsedOptionsSchema = z.strictObject({
  config: z.string().min(1).optional(),
  format: z.enum(["text", "json"]),
  output: z.string().min(1).optional(),
  failOn: z.enum(failOnThresholdValues).optional(),
  profile: z.string().min(1).optional(),
  experimental: z.boolean(),
  quiet: z.boolean(),
  rail: z.literal("bank_transfer").optional(),
});

const remediationByCode: Readonly<Record<PayoutJpError["code"], string>> = Object.freeze({
  PJP_INPUT_INVALID: "Check that the input is UTF-8 JSON matching the Bank destination contract.",
  PJP_CONFIG_INVALID: "Check command options and payoutjp.config.yml against the CLI contract.",
  PJP_PROFILE_INVALID: "Check the selected local Profile JSON and its rule parameters.",
  PJP_PROFILE_NOT_FOUND: "Supply --profile or embed an available profileId in the request.",
  PJP_PROFILE_STATUS_NOT_ALLOWED: "Pass --experimental only after reviewing the Profile status.",
  PJP_RULE_DUPLICATE: "Remove duplicate RuleId registrations.",
  PJP_RULE_UNKNOWN: "Use only rules supported by the Bank package.",
  PJP_RULE_PARAMS_INVALID: "Correct the selected Profile rule parameters.",
  PJP_REGISTRY_INVALID: "Check the selected local Registry JSON and provenance envelope.",
  PJP_REGISTRY_NOT_FOUND: "Configure the exact Registry version pinned by the Profile.",
  PJP_REGISTRY_DIGEST_MISMATCH: "Restore the immutable Registry snapshot matching its digest.",
  PJP_INTERNAL_INVARIANT: "Report this deterministic internal failure without including raw input.",
});

function safeErrorText(error: PayoutJpError, path: string): string {
  return `${error.code}: ${error.message}\nPath: ${JSON.stringify(path)}\nRemediation: ${remediationByCode[error.code]}\n`;
}

function outputPath(cwd: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

function createCliProgram(stdout: WritableTarget, stderr: WritableTarget): Command {
  const program = new Command();
  program
    .name("payoutjp")
    .description("Local deterministic validation for Japanese payout destinations")
    .version(version)
    .option("--config <path>", "use an explicit config file")
    .addOption(
      new Option("--format <format>", "report format").choices(["text", "json"]).default("text"),
    )
    .option("--output <path>", "write the report to a file")
    .addOption(
      new Option("--fail-on <threshold>", "finding failure threshold").choices([
        ...failOnThresholdValues,
      ]),
    )
    .option("--profile <id[@version]>", "select a compatibility Profile")
    .option("--experimental", "permit an experimental Profile", false)
    .option("--quiet", "suppress non-report informational output", false)
    .configureOutput({
      writeOut: (value) => stdout.write(value),
      writeErr: (value) => stderr.write(value),
      outputError: (value, write) => write(`PJP_INPUT_INVALID: ${value}`),
    })
    .exitOverride();

  program
    .command("validate")
    .description("validate one Bank destination from JSON")
    .argument("<input>", "path to a UTF-8 JSON destination or request")
    .addOption(new Option("--rail <rail>", "destination rail").choices(["bank_transfer"]))
    .action(() => undefined);

  return program;
}

/** Executes the CLI without calling process.exit, returning the documented exit code. */
export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const program = createCliProgram(stdout, stderr);
  let resultCode = 0;
  let diagnosticPath = "command";
  const validate = program.commands.find((command) => command.name() === "validate");
  if (validate === undefined) {
    stderr.write(safeErrorText(new PayoutJpInputError(), diagnosticPath));
    return 3;
  }

  validate.action(async (inputPath: string, _localOptions: unknown, command: Command) => {
    diagnosticPath = inputPath.replaceAll("\\", "/");
    const parsedOptions = ParsedOptionsSchema.safeParse(command.optsWithGlobals());
    if (!parsedOptions.success) {
      throw new PayoutJpInputError();
    }
    const cliOptions = parsedOptions.data;
    const config = await resolveCliConfig({
      cwd,
      ...(cliOptions.config === undefined ? {} : { explicitPath: cliOptions.config }),
    });
    const absoluteInputPath = isAbsolute(inputPath) ? resolve(inputPath) : resolve(cwd, inputPath);
    const report = await runValidateCommand({
      inputPath: absoluteInputPath,
      ...(cliOptions.profile === undefined ? {} : { profileSelector: cliOptions.profile }),
      experimental: cliOptions.experimental,
      config,
    });
    const rendered =
      cliOptions.format === "json" ? renderJsonReport(report) : renderTextReport(report);
    if (cliOptions.output === undefined) {
      stdout.write(rendered);
    } else {
      try {
        await writeFile(outputPath(cwd, cliOptions.output), rendered, "utf8");
      } catch {
        throw new PayoutJpInputError();
      }
    }
    resultCode = exitCodeForReport(report, cliOptions.failOn ?? config.failOn);
  });

  if (argv.length === 0) {
    stderr.write(safeErrorText(new PayoutJpInputError(), diagnosticPath));
    return 2;
  }

  try {
    await program.parseAsync([...argv], { from: "user" });
    return resultCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        return 0;
      }
      stderr.write(
        'Path: "command"\nRemediation: Review payoutjp --help and correct the command arguments.\n',
      );
      return 2;
    }
    if (isPayoutJpError(error)) {
      stderr.write(safeErrorText(error, diagnosticPath));
      return error.exitCode;
    }
    stderr.write(
      `PJP_INTERNAL_INVARIANT: Internal validation invariant failed\nPath: ${JSON.stringify(diagnosticPath)}\nRemediation: Report this deterministic internal failure without including raw input.\n`,
    );
    return 3;
  }
}

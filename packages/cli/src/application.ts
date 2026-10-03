import { isAbsolute, resolve } from "node:path";
import { isPayoutJpError, type PayoutJpError, PayoutJpInputError } from "@payoutjp/core";
import { Command, CommanderError, Option } from "commander";
import { z } from "zod";
import { CliInputError, type InputSource, writeReport } from "./io.js";
import { runAuditCommand } from "./audit-command.js";
import { initialize, diagnose, installedProfiles, registryStatus } from "./setup-commands.js";
import { resolveBankProfile } from "./artifacts.js";
import { failOnThresholdValues, resolveCliConfig } from "./config.js";
import { exitCodeForReport } from "./exit-code.js";
import { baseSafetyNotice } from "./notices.js";
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
  readonly stdin?: InputSource;
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
  locale: z.enum(["en", "ja"]),
  inputFormat: z.enum(["json", "csv"]).optional(),
  mapping: z.string().min(1).optional(),
  idPolicy: z.enum(["generated", "input"]).optional(),
  overwriteReport: z.boolean().optional(),
  all: z.boolean().optional(),
  json: z.boolean().optional(),
  directory: z.string().optional(),
  template: z.literal("bank-csv").optional(),
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
    .addOption(
      new Option("--locale <locale>", "human diagnostic language")
        .choices(["en", "ja"])
        .default("en"),
    )
    .option("--quiet", "suppress non-report informational output", false)
    .addHelpText("after", `\nSafety: ${baseSafetyNotice}\n`)
    .configureOutput({
      writeOut: (value) => stdout.write(value),
      writeErr: (value) => stderr.write(value),
      outputError: (_value, write) => write("PJP_INPUT_INVALID: Invalid command arguments.\n"),
    })
    .exitOverride();

  program
    .command("validate")
    .description("validate one Bank destination from JSON")
    .argument("<input>", "path to a UTF-8 JSON destination or request")
    .addOption(new Option("--rail <rail>", "destination rail").choices(["bank_transfer"]))
    .action(() => undefined);

  program
    .command("audit")
    .description("audit a Bank JSON batch or UTF-8 CSV")
    .argument("<input>", "path, or - for stdin")
    .addOption(new Option("--rail <rail>", "destination rail").choices(["bank_transfer"]))
    .addOption(new Option("--input-format <format>", "required for stdin").choices(["json", "csv"]))
    .option("--mapping <path>", "explicit CSV columns and account type mapping")
    .addOption(
      new Option("--id-policy <policy>", "input IDs must be non-sensitive metadata")
        .choices(["generated", "input"])
        .default("generated"),
    )
    .option("--overwrite-report", "explicitly replace an existing audit report", false);
  const profiles = program
    .command("profiles")
    .description("inspect locally installed Bank Profiles");
  profiles
    .command("list")
    .option("--all", "include deprecated or retired Profiles", false)
    .addOption(new Option("--rail <rail>", "Profile rail").choices(["bank_transfer"]));
  profiles.command("show").argument("<selector>");
  program
    .command("registry")
    .description("inspect local Registry integrity")
    .command("status")
    .option("--json", "print JSON", false);
  program.command("doctor").description("diagnose local configuration without changing it");
  program
    .command("init")
    .description("create synthetic CSV samples in a new directory")
    .requiredOption("--directory <directory>", "new sample directory")
    .addOption(
      new Option("--template <template>", "sample template")
        .choices(["bank-csv"])
        .default("bank-csv"),
    );
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
  function cliOptions(command: Command) {
    const parsed = ParsedOptionsSchema.safeParse(command.optsWithGlobals());
    if (!parsed.success) throw new PayoutJpInputError();
    return parsed.data;
  }
  async function configuration(command: Command) {
    const cli = cliOptions(command);
    const config = await resolveCliConfig({
      cwd,
      ...(cli.config === undefined ? {} : { explicitPath: cli.config }),
    });
    return { cli, config };
  }
  async function emit(
    rendered: string,
    command: Command,
    protectedPaths: readonly string[] = [],
    overwrite = false,
  ) {
    const cli = cliOptions(command);
    if (cli.output === undefined) stdout.write(rendered);
    else await writeReport(outputPath(cwd, cli.output), rendered, protectedPaths, overwrite);
  }
  for (const command of program.commands.filter((entry) =>
    ["validate", "audit"].includes(entry.name()),
  )) {
    command.action(async (inputPath: string, _localOptions: unknown, executing: Command) => {
      diagnosticPath = "input";
      const { cli, config } = await configuration(executing);
      const path = inputPath === "-" ? "-" : outputPath(cwd, inputPath);
      const isAudit = executing.name() === "audit";
      const mapping = cli.mapping === undefined ? undefined : outputPath(cwd, cli.mapping);
      const source = inputPath === "-" ? (options.stdin ?? process.stdin) : undefined;
      const inferred = path.toLowerCase().endsWith(".csv")
        ? "csv"
        : path.toLowerCase().endsWith(".json")
          ? "json"
          : undefined;
      if (isAudit && cli.inputFormat === undefined && inferred === undefined)
        throw new CliInputError("input_format_required");
      const report = isAudit
        ? await runAuditCommand({
            path,
            format: cli.inputFormat ?? inferred ?? "json",
            ...(source ? { source } : {}),
            ...(cli.profile ? { selector: cli.profile } : {}),
            ...(mapping ? { mapping } : {}),
            idPolicy: cli.idPolicy ?? "generated",
            experimental: cli.experimental,
            config,
          })
        : await runValidateCommand({
            inputPath: path,
            ...(source ? { source } : {}),
            ...(cli.profile === undefined ? {} : { profileSelector: cli.profile }),
            experimental: cli.experimental,
            config,
          });
      const rendered =
        cli.format === "json"
          ? renderJsonReport(report)
          : renderTextReport(report, {
              locale: cli.locale,
              ...(isAudit ? { maxFindings: 100 } : {}),
            });
      const protectedPaths = [
        path,
        ...(config.configPath ? [config.configPath] : []),
        ...(mapping ? [mapping] : []),
        ...config.profilePaths,
        ...config.registryPaths,
      ].filter((entry) => entry !== "-");
      await emit(rendered, executing, protectedPaths, !isAudit || cli.overwriteReport === true);
      resultCode = exitCodeForReport(report, cli.failOn ?? config.failOn);
    });
  }
  const profiles = program.commands.find((entry) => entry.name() === "profiles");
  profiles?.commands
    .find((entry) => entry.name() === "list")
    ?.action(async (_local: unknown, command: Command) => {
      const { cli, config } = await configuration(command);
      const data = (await installedProfiles(config, true)).filter(
        (profile) => cli.all || !["deprecated", "retired"].includes(profile.status),
      );
      await emit(
        `${JSON.stringify(
          data.map((profile) => ({
            id: profile.id,
            version: profile.version,
            status: profile.status,
            rail: profile.rail,
          })),
          null,
          2,
        )}\n`,
        command,
        [config.configPath ?? "", ...config.profilePaths, ...config.registryPaths],
      );
    });
  profiles?.commands
    .find((entry) => entry.name() === "show")
    ?.action(async (selector: string, _local: unknown, command: Command) => {
      const { config } = await configuration(command);
      const profile = await resolveBankProfile(selector, config.profilePaths, true, true);
      await emit(`${JSON.stringify(profile, null, 2)}\n`, command, [
        config.configPath ?? "",
        ...config.profilePaths,
        ...config.registryPaths,
      ]);
    });
  program.commands
    .find((entry) => entry.name() === "registry")
    ?.commands[0]?.action(async (_local: unknown, command: Command) => {
      const { config, cli } = await configuration(command);
      const diagnosis = await diagnose(config, cli.experimental);
      await emit(
        `${JSON.stringify({ registries: await registryStatus(config), profiles: diagnosis.profiles, notice: diagnosis.notice }, null, 2)}\n`,
        command,
        [config.configPath ?? "", ...config.profilePaths, ...config.registryPaths],
      );
    });
  program.commands
    .find((entry) => entry.name() === "doctor")
    ?.action(async (_local: unknown, command: Command) => {
      const { config, cli } = await configuration(command);
      await emit(
        `${JSON.stringify(await diagnose(config, cli.experimental), null, 2)}\n`,
        command,
        [config.configPath ?? "", ...config.profilePaths, ...config.registryPaths],
      );
    });
  program.commands
    .find((entry) => entry.name() === "init")
    ?.action(async (_local: unknown, command: Command) => {
      const cli = cliOptions(command);
      if (!cli.directory || cli.output) throw new CliInputError("init_options");
      stdout.write(
        `${JSON.stringify(await initialize(outputPath(cwd, cli.directory)), null, 2)}\n`,
      );
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
      const japanese =
        program.opts().locale === "ja"
          ? "確認: 入力項目・列対応・設定を確認して再実行してください。\n"
          : "";
      stderr.write(
        safeErrorText(error, diagnosticPath) +
          (error instanceof CliInputError
            ? `Reason: ${error.reason}\nField: ${error.field}\n`
            : "") +
          japanese,
      );
      return error.exitCode;
    }
    stderr.write(
      `PJP_INTERNAL_INVARIANT: Internal validation invariant failed\nPath: ${JSON.stringify(diagnosticPath)}\nRemediation: Report this deterministic internal failure without including raw input.\n`,
    );
    return 3;
  }
}

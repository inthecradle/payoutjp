import {
  BankAccountTypeSchema,
  BankTransferDestinationV1Schema,
  prepareBankTransferValidatorV1,
} from "@payoutjp/bank";
import {
  createItemId,
  createRuleId,
  createValidationReportV1,
  ItemIdSchema,
  PayoutJpConfigurationError,
  type CompatibilityProfileV1,
  type FindingV1,
  type ValidationItemInputV1,
} from "@payoutjp/core";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { resolveBankProfile, resolveBankRegistries } from "./artifacts.js";
import type { ResolvedCliConfig } from "./config.js";
import { CliInputError, type InputSource, parseJson, readUtf8 } from "./io.js";
import { baseSafetyNotice, experimentalProfileNotice } from "./notices.js";
import { version } from "./version.js";

const fields = ["bankCode", "branchCode", "accountType", "accountNumber", "accountHolder"] as const;
const fieldSchema = z.enum([...fields, "id"]);
const MappingSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  columns: z
    .partialRecord(fieldSchema, z.string().min(1))
    .refine((columns) => fields.every((field) => columns[field] !== undefined)),
  values: z
    .strictObject({ accountType: z.record(z.string(), BankAccountTypeSchema).optional() })
    .optional(),
  ignoreColumns: z.array(z.string().min(1)).optional(),
});
type CsvMapping = z.infer<typeof MappingSchema>;
interface AuditRow {
  readonly destination: unknown;
  readonly id?: unknown;
  readonly profileId?: string;
  readonly line?: number;
  readonly malformed?: boolean;
}
const BatchSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  items: z.array(z.unknown()).min(1).max(100_000),
});
const ItemSchema = z.strictObject({
  id: z.unknown().optional(),
  profileId: z.string().min(1).optional(),
  destination: z.unknown(),
});
const CsvRecordSchema = z.object({
  record: z.array(z.string()),
  raw: z.string(),
  info: z.object({ lines: z.number() }),
});

/** Options for a bounded single-Profile Bank audit; identifiers are private by default. */
export interface AuditCommandOptions {
  readonly path: string;
  readonly format: "json" | "csv";
  readonly source?: InputSource;
  readonly selector?: string;
  readonly mapping?: string;
  readonly idPolicy: "generated" | "input";
  readonly experimental: boolean;
  readonly config: ResolvedCliConfig;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function csvRows(text: string, mappingPath?: string): Promise<AuditRow[]> {
  let mapping: CsvMapping | undefined;
  if (mappingPath !== undefined) {
    const result = MappingSchema.safeParse(
      parseJson(await readUtf8(mappingPath, undefined, 1024 * 1024)),
    );
    if (!result.success) throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
    mapping = result.data;
  }
  let decoded: unknown;
  try {
    decoded = parse(text, {
      bom: true,
      cast: false,
      trim: false,
      raw: true,
      info: true,
      relax_column_count: true,
      max_record_size: 64 * 1024,
      skip_empty_lines: false,
      on_record: (record: string[], context: { records: number }) => {
        if (context.records > 100_001) throw new CliInputError("batch_size");
        return record;
      },
    });
  } catch {
    throw new CliInputError("csv_syntax");
  }
  const parsed = z.array(CsvRecordSchema).max(100_001).safeParse(decoded);
  if (!parsed.success || parsed.data.length < 2) throw new CliInputError("empty_or_large_batch");
  const header = parsed.data[0]?.record ?? [];
  if (new Set(header).size !== header.length) throw new CliInputError("duplicate_header");
  const columns =
    mapping?.columns ?? Object.fromEntries([...fields, "id"].map((field) => [field, field]));
  const ignored = mapping?.ignoreColumns ?? [];
  const activeColumns = Object.entries(columns).filter(
    ([field, column]) => field !== "id" || header.includes(column),
  );
  const named = activeColumns.map(([, column]) => column);
  if (
    new Set(named).size !== named.length ||
    new Set(ignored).size !== ignored.length ||
    ignored.some((column) => named.includes(column)) ||
    fields.some((field) => !header.includes(columns[field] ?? "")) ||
    (mapping !== undefined && Object.values(columns).some((column) => !header.includes(column))) ||
    ignored.some((column) => !header.includes(column)) ||
    header.some((column) => !named.includes(column) && !ignored.includes(column))
  ) {
    throw new CliInputError("header_mapping", "columns");
  }
  let nextLine = 1 + (parsed.data[0]?.raw.match(/\r\n|\r|\n/gu)?.length ?? 0);
  return parsed.data.slice(1).map(({ record, raw }) => {
    if (
      Buffer.byteLength(raw, "utf8") > 64 * 1024 ||
      record.some((field) => Buffer.byteLength(field, "utf8") > 8 * 1024)
    )
      throw new CliInputError("record_size");
    const newlineCount = raw.match(/\r\n|\r|\n/gu)?.length ?? 0;
    const line = nextLine;
    nextLine += newlineCount;
    const destination: Record<string, unknown> = { schemaVersion: "1", rail: "bank_transfer" };
    for (const [field, column] of activeColumns) {
      destination[field] = record[header.indexOf(column)] ?? "";
    }
    if (mapping?.values?.accountType && typeof destination.accountType === "string") {
      destination.accountType = Object.hasOwn(mapping.values.accountType, destination.accountType)
        ? mapping.values.accountType[destination.accountType]
        : undefined;
    }
    return {
      destination,
      line: Math.max(1, line),
      malformed: record.length !== header.length || (record.length === 1 && record[0] === ""),
    };
  });
}

function jsonRows(text: string): AuditRow[] {
  const batch = BatchSchema.safeParse(parseJson(text));
  if (!batch.success) throw new CliInputError("batch_schema");
  return batch.data.items.map((input) => {
    const item = ItemSchema.safeParse(input);
    if (!item.success) return { destination: undefined, malformed: true };
    return {
      destination: item.data.destination,
      ...(item.data.id === undefined ? {} : { id: item.data.id }),
      ...(item.data.profileId === undefined ? {} : { profileId: item.data.profileId }),
    };
  });
}

function schemaFindings(
  profile: CompatibilityProfileV1,
  index: number,
  paths: readonly string[],
): FindingV1[] {
  return paths.map((path) => ({
    schemaVersion: "1",
    ruleId: createRuleId("INPUT-SCHEMA-001"),
    severity: "error",
    messageKey: "input.schema.invalid",
    message: "Input field does not match the Bank destination contract.",
    path,
    profileId: profile.id,
    profileVersion: profile.version,
    location: { itemIndex: index },
    remediation: {
      code: "review_input_field",
      message: "Review the indicated field and CSV mapping without converting or padding values.",
    },
  }));
}

/** Runs every interpretable row and returns the existing complete, canonical report contract. */
export async function runAuditCommand(options: AuditCommandOptions) {
  const text = await readUtf8(options.path, options.source);
  if (options.mapping !== undefined && options.format !== "csv")
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  const rows = options.format === "csv" ? await csvRows(text, options.mapping) : jsonRows(text);
  if (rows.length === 0 || rows.length > 100_000) throw new CliInputError("batch_size");
  const selectors = new Set(rows.flatMap((row) => (row.profileId ? [row.profileId] : [])));
  if (options.selector) selectors.add(options.selector);
  if (selectors.size !== 1)
    throw new PayoutJpConfigurationError(
      selectors.size === 0 ? "PJP_PROFILE_NOT_FOUND" : "PJP_CONFIG_INVALID",
    );
  const selector = [...selectors][0];
  if (
    !selector ||
    (options.format === "json" &&
      options.selector === undefined &&
      rows.some((row) => !row.malformed && row.profileId === undefined))
  )
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  const profile = await resolveBankProfile(
    selector,
    options.config.profilePaths,
    options.experimental,
  );
  const registries = await resolveBankRegistries(profile, options.config.registryPaths);
  const validate = prepareBankTransferValidatorV1({
    profile,
    registries,
    allowExperimental: options.experimental,
  });
  const seenIds = new Set<string>();
  let totalFindings = 0;
  const items: ValidationItemInputV1[] = rows.map((row, index) => {
    const raw = object(row.destination);
    if (raw?.rail !== undefined && raw.rail !== "bank_transfer")
      throw new CliInputError("unsupported_rail");
    let id = createItemId(`item-${String(index + 1).padStart(6, "0")}`);
    if (options.idPolicy === "input") {
      const supplied = row.id ?? raw?.id;
      const result = ItemIdSchema.safeParse(supplied);
      if (
        !result.success ||
        result.data.length > 128 ||
        seenIds.has(result.data) ||
        (row.id !== undefined && raw?.id !== undefined && row.id !== raw.id)
      )
        throw new CliInputError("invalid_or_duplicate_id", "id");
      id = result.data;
      seenIds.add(id);
    }
    const destination = raw
      ? Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "id"))
      : row.destination;
    const parsed = BankTransferDestinationV1Schema.safeParse(destination);
    let findings: readonly FindingV1[];
    if (row.malformed || !parsed.success) {
      const paths =
        row.malformed || parsed.success
          ? ["destination"]
          : [
              ...new Set(
                parsed.error.issues.map((issue) => {
                  const field = issue.path[0];
                  return typeof field === "string" &&
                    [...fields, "schemaVersion", "rail"].includes(field)
                    ? `destination.${field}`
                    : "destination";
                }),
              ),
            ];
      findings = schemaFindings(profile, index, paths);
    } else {
      if (fields.some((field) => Buffer.byteLength(parsed.data[field], "utf8") > 8 * 1024))
        throw new CliInputError("field_size");
      findings = validate(parsed.data, index);
    }
    findings = findings.map((finding) => ({
      ...finding,
      location: {
        ...finding.location,
        ...(row.line === undefined ? {} : { line: row.line }),
        ...(options.format === "json"
          ? { jsonPointer: `/items/${index}/${finding.path.replaceAll(".", "/")}` }
          : {}),
      },
    }));
    totalFindings += findings.length;
    if (totalFindings > 100_000) throw new CliInputError("finding_limit");
    return { id, index, rail: "bank_transfer", findings };
  });
  return createValidationReportV1({
    tool: { name: "payoutjp", version },
    profiles: [{ id: profile.id, version: profile.version, status: profile.status }],
    registries: profile.registries,
    notices:
      profile.status === "experimental"
        ? [baseSafetyNotice, experimentalProfileNotice]
        : [baseSafetyNotice],
    items,
  });
}

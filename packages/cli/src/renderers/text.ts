import type { FindingV1, ValidationReportV1 } from "@payoutjp/core";
import { japaneseGuidance } from "./japanese.js";

function renderFinding(finding: FindingV1): readonly string[] {
  return [
    `${finding.severity.toUpperCase()} ${finding.ruleId} ${finding.path}`,
    finding.message,
    ...(finding.actual === undefined ? [] : [`Observed: ${finding.actual.display}`]),
    ...(finding.expected === undefined ? [] : [`Expected: ${finding.expected}`]),
    ...(finding.remediation === undefined ? [] : [`Action: ${finding.remediation.message}`]),
  ];
}

/** Renders a deterministic, privacy-safe human report from already-redacted findings. */
export function renderTextReport(
  report: ValidationReportV1,
  options: { readonly locale?: "en" | "ja"; readonly maxFindings?: number } = {},
): string {
  const lines = [
    `PayoutJP: ${report.status}`,
    `Tool: ${report.tool.name}@${report.tool.version}`,
    `Profiles: ${report.profiles.map((profile) => `${profile.id}@${profile.version}`).join(", ")}`,
    `Registries: ${
      report.registries.length === 0
        ? "(none)"
        : report.registries.map((registry) => `${registry.id}@${registry.version}`).join(", ")
    }`,
    `Items: ${report.summary.totalItems}  Passed: ${report.summary.passedItems}  Warnings: ${report.summary.warningItems}  Failed: ${report.summary.failedItems}`,
  ];

  if (report.notices.length > 0) {
    lines.push("", ...report.notices.map((notice) => `Notice: ${notice}`));
  }

  let displayed = 0;
  for (const item of report.items) {
    if (item.findings.length === 0) {
      continue;
    }
    if (displayed >= (options.maxFindings ?? Number.POSITIVE_INFINITY)) break;
    lines.push("", `Item: ${item.id} (${item.status})`);
    item.findings.forEach((finding, index) => {
      if (displayed >= (options.maxFindings ?? Number.POSITIVE_INFINITY)) return;
      displayed++;
      if (index > 0) {
        lines.push("");
      }
      if (finding.location?.line !== undefined)
        lines.push(`${options.locale === "ja" ? "行" : "Line"}: ${finding.location.line}`);
      if (finding.location?.jsonPointer !== undefined)
        lines.push(`JSON Pointer: ${finding.location.jsonPointer}`);
      lines.push(
        ...(options.locale === "ja"
          ? [
              `${finding.severity.toUpperCase()} ${finding.ruleId} ${finding.path}`,
              ...japaneseGuidance(finding),
            ]
          : renderFinding(finding)),
      );
    });
  }

  const omitted =
    report.summary.errors + report.summary.warnings + report.summary.infos - displayed;
  if (omitted > 0)
    lines.push("", `Omitted: ${omitted} findings. Use --format json for the complete report.`);

  return `${lines.join("\n")}\n`;
}

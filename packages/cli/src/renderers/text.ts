import type { FindingV1, ValidationReportV1 } from "@payoutjp/core";

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
export function renderTextReport(report: ValidationReportV1): string {
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

  for (const item of report.items) {
    if (item.findings.length === 0) {
      continue;
    }
    lines.push("", `Item: ${item.id} (${item.status})`);
    item.findings.forEach((finding, index) => {
      if (index > 0) {
        lines.push("");
      }
      lines.push(...renderFinding(finding));
    });
  }

  return `${lines.join("\n")}\n`;
}

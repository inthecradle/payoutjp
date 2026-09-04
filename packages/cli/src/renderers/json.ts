import type { ValidationReportV1 } from "@payoutjp/core";

/** Renders canonical, indented JSON with exactly one trailing newline. */
export function renderJsonReport(report: ValidationReportV1): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

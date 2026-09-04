import type { ValidationReportV1 } from "@payoutjp/core";
import type { FailOnThreshold } from "./config.js";

/** Maps a validation report and fail threshold to the documented finding exit code. */
export function exitCodeForReport(report: ValidationReportV1, failOn: FailOnThreshold): 0 | 1 {
  if (failOn === "never") {
    return 0;
  }
  if (report.summary.errors > 0) {
    return 1;
  }
  return failOn === "warning" && report.summary.warnings > 0 ? 1 : 0;
}

import type { FindingV1 } from "./finding.js";
import type { ValidationItemReportV1, ValidationSummaryV1 } from "./report.js";
import type { ItemStatus } from "./status.js";

/** Derives an item's status from finding severities. Info findings do not raise status. */
export function aggregateItemStatus(findings: readonly FindingV1[]): ItemStatus {
  let status: ItemStatus = "PASS";

  for (const finding of findings) {
    if (finding.severity === "error") {
      return "FAIL";
    }
    if (finding.severity === "warning") {
      status = "WARNING";
    }
  }

  return status;
}

/** Derives report status from item statuses. An empty report passes. */
export function aggregateReportStatus(itemStatuses: readonly ItemStatus[]): ItemStatus {
  let status: ItemStatus = "PASS";

  for (const itemStatus of itemStatuses) {
    if (itemStatus === "FAIL") {
      return "FAIL";
    }
    if (itemStatus === "WARNING") {
      status = "WARNING";
    }
  }

  return status;
}

/** Calculates canonical item and finding counts from item findings. */
export function summarizeValidationItems(
  items: readonly Pick<ValidationItemReportV1, "findings">[],
): ValidationSummaryV1 {
  const summary: ValidationSummaryV1 = {
    totalItems: items.length,
    passedItems: 0,
    warningItems: 0,
    failedItems: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
  };

  for (const item of items) {
    const status = aggregateItemStatus(item.findings);
    if (status === "FAIL") {
      summary.failedItems += 1;
    } else if (status === "WARNING") {
      summary.warningItems += 1;
    } else {
      summary.passedItems += 1;
    }

    for (const finding of item.findings) {
      if (finding.severity === "error") {
        summary.errors += 1;
      } else if (finding.severity === "warning") {
        summary.warnings += 1;
      } else {
        summary.infos += 1;
      }
    }
  }

  return summary;
}

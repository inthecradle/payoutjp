/** Stable safety language included in CLI help and every CLI-generated report. */
export const baseSafetyNotice =
  "PayoutJP checks local data and configuration against the selected Profile and Registry. It does not verify account existence, recipient identity, wallet ownership, or payment success.";

/** Additional warning emitted when an explicitly opted-in experimental Profile is used. */
export const experimentalProfileNotice =
  "This Profile is experimental and must be verified against the receiving bank, service, or current specification before production use.";

import { BankTransferDestinationV1Schema, validateBankTransferDestinationV1 } from "@payoutjp/bank";
import {
  createItemId,
  createValidationReportV1,
  PayoutJpConfigurationError,
  PayoutJpInputError,
  type ValidationReportV1,
} from "@payoutjp/core";
import { z } from "zod";
import { resolveBankProfile, resolveBankRegistries } from "./artifacts.js";
import type { ResolvedCliConfig } from "./config.js";
import { loadJsonInput } from "./loaders/json.js";
import { version } from "./version.js";

const SingleValidationRequestV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  profileId: z.string().min(1),
  destination: z.unknown(),
});

export interface ValidateCommandOptions {
  readonly inputPath: string;
  readonly profileSelector?: string;
  readonly experimental: boolean;
  readonly config: ResolvedCliConfig;
}

/** Runs the authorized single-bank JSON validation flow through the Bank library API. */
export async function runValidateCommand(
  options: ValidateCommandOptions,
): Promise<ValidationReportV1> {
  const input = await loadJsonInput(options.inputPath);
  const requestResult = SingleValidationRequestV1Schema.safeParse(input);
  const hasWrapperShape =
    typeof input === "object" &&
    input !== null &&
    (Object.hasOwn(input, "destination") || Object.hasOwn(input, "profileId"));

  if (hasWrapperShape && !requestResult.success) {
    throw new PayoutJpInputError();
  }

  const embeddedProfile = requestResult.success ? requestResult.data.profileId : undefined;
  if (
    embeddedProfile !== undefined &&
    options.profileSelector !== undefined &&
    embeddedProfile !== options.profileSelector
  ) {
    throw new PayoutJpConfigurationError("PJP_CONFIG_INVALID");
  }
  const selector = options.profileSelector ?? embeddedProfile;
  if (selector === undefined) {
    throw new PayoutJpConfigurationError("PJP_PROFILE_NOT_FOUND");
  }

  const destinationInput = requestResult.success ? requestResult.data.destination : input;
  const destinationResult = BankTransferDestinationV1Schema.safeParse(destinationInput);
  if (!destinationResult.success) {
    throw new PayoutJpInputError();
  }
  const profile = await resolveBankProfile(
    selector,
    options.config.profilePaths,
    options.experimental,
  );
  const registries = await resolveBankRegistries(profile, options.config.registryPaths);
  const findings = validateBankTransferDestinationV1(destinationResult.data, {
    profile,
    registries,
    itemIndex: 0,
    allowExperimental: options.experimental,
  });
  const itemId = createItemId(destinationResult.data.id ?? "item-000001");

  return createValidationReportV1({
    tool: { name: "payoutjp", version },
    profiles: [{ id: profile.id, version: profile.version, status: profile.status }],
    registries: profile.registries,
    items: [
      {
        id: itemId,
        index: 0,
        rail: "bank_transfer",
        findings,
      },
    ],
  });
}

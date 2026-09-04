import { z } from "zod";

/** Environments representable by the application-config shape. Profiles decide compatibility. */
export const jpycEnvironmentValues = Object.freeze(["mainnet", "testnet"] as const);

export const JpycEnvironmentSchema = z.enum(jpycEnvironmentValues);
export type JpycEnvironment = z.infer<typeof JpycEnvironmentSchema>;

const ChainIdSchema = z.number().int().nonnegative().safe();

/** Runtime shape contract for a JPYC payout destination. */
export const JpycDestinationV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  rail: z.literal("jpyc"),
  id: z.string().min(1).optional(),
  chainId: ChainIdSchema,
  walletAddress: z.string(),
});

export type JpycDestinationV1 = z.infer<typeof JpycDestinationV1Schema>;

/**
 * Runtime shape contract for the caller's JPYC routing configuration.
 * Address and environment compatibility remain rule responsibilities.
 */
export const JpycApplicationConfigV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  kind: z.literal("jpyc"),
  environment: JpycEnvironmentSchema,
  chainId: ChainIdSchema,
  tokenContract: z.string(),
});

export type JpycApplicationConfigV1 = z.infer<typeof JpycApplicationConfigV1Schema>;

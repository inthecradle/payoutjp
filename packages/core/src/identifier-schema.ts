import { z } from "zod";
import {
  createItemId,
  createProfileId,
  createRegistryId,
  createRuleId,
  type ItemId,
  type ProfileId,
  type RegistryId,
  type RuleId,
} from "./identifiers.js";

function parseIdentifier<Identifier>(
  value: string,
  context: z.RefinementCtx,
  create: (input: string) => Identifier,
  kind: string,
): Identifier {
  try {
    return create(value);
  } catch {
    context.addIssue({ code: "custom", message: `Invalid ${kind}` });
    return z.NEVER;
  }
}

export const RuleIdSchema = z
  .string()
  .transform((value, context): RuleId => parseIdentifier(value, context, createRuleId, "RuleId"));

export const ProfileIdSchema = z
  .string()
  .transform(
    (value, context): ProfileId => parseIdentifier(value, context, createProfileId, "ProfileId"),
  );

export const RegistryIdSchema = z
  .string()
  .transform(
    (value, context): RegistryId => parseIdentifier(value, context, createRegistryId, "RegistryId"),
  );

export const ItemIdSchema = z
  .string()
  .transform((value, context): ItemId => parseIdentifier(value, context, createItemId, "ItemId"));

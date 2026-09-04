declare const identifierBrand: unique symbol;

type BrandedIdentifier<Name extends string> = string & {
  readonly [identifierBrand]: Name;
};

/** Stable identifier for a validation rule. */
export type RuleId = BrandedIdentifier<"RuleId">;

/** Identifier for a compatibility profile, excluding its version. */
export type ProfileId = BrandedIdentifier<"ProfileId">;

/** Identifier for a versioned registry, excluding its version. */
export type RegistryId = BrandedIdentifier<"RegistryId">;

/** Caller-supplied or deterministically generated validation item identifier. */
export type ItemId = BrandedIdentifier<"ItemId">;

type IdentifierKind = "RuleId" | "ProfileId" | "RegistryId" | "ItemId";

const ruleIdPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u;

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
}

function createIdentifier<Name extends IdentifierKind>(
  value: string,
  kind: Name,
): BrandedIdentifier<Name> {
  if (value.length === 0 || value !== value.trim() || containsControlCharacter(value)) {
    throw new TypeError(
      `${kind} must be a non-empty string without surrounding whitespace or control characters`,
    );
  }

  return value as BrandedIdentifier<Name>;
}

/**
 * Creates a stable uppercase, hyphen-separated rule identifier.
 *
 * @throws {TypeError} When the value is empty, malformed, or contains unsafe whitespace/control characters.
 */
export function createRuleId(value: string): RuleId {
  const id = createIdentifier(value, "RuleId");

  if (!ruleIdPattern.test(id)) {
    throw new TypeError("RuleId must be an uppercase hyphen-separated identifier");
  }

  return id;
}

/**
 * Creates a compatibility profile identifier without imposing provider-specific naming rules.
 *
 * @throws {TypeError} When the value is empty or contains surrounding whitespace/control characters.
 */
export function createProfileId(value: string): ProfileId {
  return createIdentifier(value, "ProfileId");
}

/**
 * Creates a registry identifier without imposing source-specific naming rules.
 *
 * @throws {TypeError} When the value is empty or contains surrounding whitespace/control characters.
 */
export function createRegistryId(value: string): RegistryId {
  return createIdentifier(value, "RegistryId");
}

/**
 * Creates an item identifier while preserving the caller's non-sensitive stable value.
 *
 * @throws {TypeError} When the value is empty or contains surrounding whitespace/control characters.
 */
export function createItemId(value: string): ItemId {
  return createIdentifier(value, "ItemId");
}

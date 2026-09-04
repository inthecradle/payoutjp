import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { version } from "../src/index.js";

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

describe("@payoutjp/cli", () => {
  it("exports its CLI version", () => {
    expect(version).toBe(packageVersion.version);
  });
});

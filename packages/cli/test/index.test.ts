import { describe, expect, it } from "vitest";
import { version } from "../src/index.js";

describe("@payoutjp/cli", () => {
  it("exports its CLI version", () => {
    expect(version).toBe("0.0.0");
  });
});

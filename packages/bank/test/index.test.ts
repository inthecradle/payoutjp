import { describe, expect, it } from "vitest";
import { version } from "../src/index.js";

describe("@payoutjp/bank", () => {
  it("exports its placeholder version", () => {
    expect(version).toBe("0.0.0");
  });
});

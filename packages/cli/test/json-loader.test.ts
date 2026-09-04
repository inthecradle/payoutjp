import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PayoutJpInputError } from "@payoutjp/core";
import { afterEach, describe, expect, it } from "vitest";
import { loadJsonInput } from "../src/loaders/json.js";

const temporaryDirectories: string[] = [];

async function temporaryFile(name: string, contents: string | Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "payoutjp-cli-json-"));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  await writeFile(path, contents);
  return path;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("loadJsonInput", () => {
  it("preserves leading-zero string fields", async () => {
    const path = await temporaryFile("valid.json", '{"accountNumber":"0123456"}\n');
    await expect(loadJsonInput(path)).resolves.toEqual({ accountNumber: "0123456" });
  });

  it.each([
    ["malformed.json", "PRIVATE-VALUE{"],
    ["invalid-utf8.json", Uint8Array.from([0xc3, 0x28])],
  ])("rejects unsafe %s without exposing parser details", async (name, contents) => {
    const path = await temporaryFile(name, contents);
    await expect(loadJsonInput(path)).rejects.toBeInstanceOf(PayoutJpInputError);
  });
});

import { readFile } from "node:fs/promises";
import { PayoutJpInputError } from "@payoutjp/core";

/** Reads one UTF-8 JSON file without evaluating code or exposing parser details. */
export async function loadJsonInput(path: string): Promise<unknown> {
  let contents: Uint8Array;
  try {
    contents = await readFile(path);
  } catch {
    throw new PayoutJpInputError();
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new PayoutJpInputError();
  }

  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    throw new PayoutJpInputError();
  }
}

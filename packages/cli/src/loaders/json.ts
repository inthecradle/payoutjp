import { type InputSource, parseJson, readUtf8 } from "../io.js";

/** Reads one UTF-8 JSON file without evaluating code or exposing parser details. */
export async function loadJsonInput(path: string, source?: InputSource): Promise<unknown> {
  return parseJson(await readUtf8(path, source));
}

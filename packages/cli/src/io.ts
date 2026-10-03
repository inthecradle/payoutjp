import { createReadStream } from "node:fs";
import { link, lstat, open, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { PayoutJpInputError } from "@payoutjp/core";

export const maxInputBytes = 50 * 1024 * 1024;
export type InputSource = AsyncIterable<Uint8Array | string>;

/** Safe diagnostic metadata; parser exception messages never cross this boundary. */
export class CliInputError extends PayoutJpInputError {
  constructor(
    readonly reason: string,
    readonly field = "input",
  ) {
    super();
  }
}

/** Reads a bounded UTF-8 file or stream, rejecting malformed bytes and non-regular files. */
export async function readUtf8(
  path: string,
  source?: InputSource,
  limit = maxInputBytes,
): Promise<string> {
  let owned: ReturnType<typeof createReadStream> | undefined;
  try {
    if (source === undefined) {
      const metadata = await stat(path);
      if (!metadata.isFile() || metadata.size > limit) throw new CliInputError("size_or_file_type");
      owned = createReadStream(path);
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of source ?? owned ?? []) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > limit) throw new CliInputError("size_limit");
      chunks.push(buffer);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new CliInputError("invalid_utf8");
    }
  } catch (error) {
    if (error instanceof CliInputError) throw error;
    throw new CliInputError("read_failed");
  } finally {
    owned?.destroy();
  }
}

/** Parses JSON while withholding values, unknown property names and parser excerpts. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliInputError("json_syntax");
  }
}

async function optionalStat(path: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return undefined;
    throw new CliInputError("output_path");
  }
}

/** Protects source roots and aliases, then commits a complete report with an atomic rename. */
export async function writeReport(
  path: string,
  text: string,
  protectedPaths: readonly string[],
  overwrite: boolean,
): Promise<void> {
  let temporary: string | undefined;
  try {
    const destination = resolve(path);
    const metadata = await optionalStat(destination);
    const parent = await realpath(dirname(destination));
    const canonicalDestination = metadata
      ? await realpath(destination)
      : resolve(parent, basename(destination));
    for (const input of protectedPaths) {
      const source = await optionalStat(input);
      if (!source) continue;
      const canonicalSource = await realpath(input);
      const distance = relative(canonicalSource, canonicalDestination);
      if (
        canonicalSource === canonicalDestination ||
        (metadata && metadata.dev === source.dev && metadata.ino === source.ino) ||
        (source.isDirectory() &&
          distance !== ".." &&
          !distance.startsWith(`..${sep}`) &&
          !isAbsolute(distance))
      ) {
        throw new CliInputError("output_overlaps_source", "output");
      }
    }
    if (metadata && !overwrite) throw new CliInputError("output_exists", "output");
    if (metadata) {
      const link = await lstat(destination);
      if (!link.isFile() || link.isSymbolicLink())
        throw new CliInputError("output_file_type", "output");
    }
    temporary = resolve(parent, `.payoutjp-${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Recheck after writing so ordinary changes during report preparation cannot overwrite a source.
    const current = await optionalStat(destination);
    if (current && !overwrite) throw new CliInputError("output_exists", "output");
    if (current && (!metadata || current.dev !== metadata.dev || current.ino !== metadata.ino))
      throw new CliInputError("output_changed", "output");
    if (overwrite) await rename(temporary, destination);
    else {
      await link(temporary, destination);
      await rm(temporary);
    }
    temporary = undefined;
  } catch (error) {
    if (error instanceof CliInputError) throw error;
    throw new CliInputError("output_write_failed", "output");
  } finally {
    if (temporary) await rm(temporary, { force: true });
  }
}

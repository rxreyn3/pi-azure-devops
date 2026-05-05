import { lstat, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { unzipSync } from "fflate";

import type { AzureDevOpsClient, DownloadArtifactZipResult } from "./client.js";
import {
  type ArtifactDownloadInput,
  type ArtifactDownloadPreview,
  type ArtifactDownloadResult,
  type ArtifactKind,
  type ArtifactSourceResolution,
} from "./models.js";
import { ABSOLUTE_MAX_ARTIFACT_BYTES, DEFAULT_MAX_ARTIFACT_BYTES } from "./rest.js";

export const DEFAULT_ARTIFACT_DOWNLOAD_MAX_BYTES = DEFAULT_MAX_ARTIFACT_BYTES;
export const ABSOLUTE_ARTIFACT_DOWNLOAD_MAX_BYTES = ABSOLUTE_MAX_ARTIFACT_BYTES;

export interface ResolvedOutputPath {
  resolvedAbsolute: string;
  relative: string;
}

export class ArtifactDownloadError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ArtifactDownloadError";
    this.code = code;
  }
}

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;

export function resolveSafeOutputPath(cwd: string, output: string): ResolvedOutputPath {
  if (typeof output !== "string") {
    throw new ArtifactDownloadError("invalidOutput", "output must be a string");
  }
  if (output.length === 0 || output.trim().length === 0) {
    throw new ArtifactDownloadError("invalidOutput", "output path cannot be empty");
  }
  if (output.includes("\0")) {
    throw new ArtifactDownloadError("invalidOutput", "output path cannot contain NUL bytes");
  }
  if (path.isAbsolute(output)) {
    throw new ArtifactDownloadError("invalidOutput", "output path must be relative to the workspace");
  }
  if (WINDOWS_DRIVE_RE.test(output)) {
    throw new ArtifactDownloadError("invalidOutput", "output path cannot use a Windows drive prefix");
  }
  if (output.startsWith("\\\\") || output.startsWith("//")) {
    throw new ArtifactDownloadError("invalidOutput", "output path cannot use a UNC prefix");
  }

  const cwdAbs = path.resolve(cwd);
  const resolved = path.resolve(cwdAbs, output);

  const cwdWithSep = cwdAbs.endsWith(path.sep) ? cwdAbs : cwdAbs + path.sep;
  if (resolved !== cwdAbs && !resolved.startsWith(cwdWithSep)) {
    throw new ArtifactDownloadError("invalidOutput", "output path resolves outside the workspace");
  }
  if (resolved === cwdAbs) {
    throw new ArtifactDownloadError("invalidOutput", "output path cannot equal the workspace root");
  }

  return {
    resolvedAbsolute: resolved,
    relative: path.relative(cwdAbs, resolved),
  };
}

export interface SafeZipEntry {
  rawName: string;
  isDirectory: boolean;
  relative: string;
  resolvedAbsolute: string;
  bytes: Uint8Array;
}

export function validateZipEntries(
  destinationAbsolute: string,
  entries: Record<string, Uint8Array>,
): SafeZipEntry[] {
  const safe: SafeZipEntry[] = [];
  const destWithSep = destinationAbsolute.endsWith(path.sep)
    ? destinationAbsolute
    : destinationAbsolute + path.sep;

  for (const [rawName, bytes] of Object.entries(entries)) {
    if (rawName.length === 0) {
      throw new ArtifactDownloadError("invalidZipEntry", "ZIP contains an empty entry name");
    }
    if (rawName.includes("\0")) {
      throw new ArtifactDownloadError("invalidZipEntry", `ZIP entry contains NUL byte: ${rawName}`);
    }
    const normalizedSlashes = rawName.replace(/\\/g, "/");
    // UNC check first because "//foo" also starts with "/" and the absolute
    // path branch below would otherwise mask it.
    if (normalizedSlashes.startsWith("//")) {
      throw new ArtifactDownloadError("invalidZipEntry", `ZIP entry has UNC prefix: ${rawName}`);
    }
    if (normalizedSlashes.startsWith("/")) {
      throw new ArtifactDownloadError("invalidZipEntry", `ZIP entry has absolute path: ${rawName}`);
    }
    if (WINDOWS_DRIVE_RE.test(normalizedSlashes)) {
      throw new ArtifactDownloadError("invalidZipEntry", `ZIP entry has Windows drive prefix: ${rawName}`);
    }
    const segments = normalizedSlashes.split("/");
    for (const segment of segments) {
      if (segment === "..") {
        throw new ArtifactDownloadError(
          "invalidZipEntry",
          `ZIP entry has parent traversal segment: ${rawName}`,
        );
      }
    }
    // Reject degenerate entries that resolve to the destination root itself.
    // After stripping any trailing slash and removing "." segments the path
    // must contain at least one real component.
    const cleanedSegments = segments
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0 && segment !== ".");
    if (cleanedSegments.length === 0) {
      throw new ArtifactDownloadError(
        "invalidZipEntry",
        `ZIP entry has degenerate path: ${rawName}`,
      );
    }

    const isDirectory = normalizedSlashes.endsWith("/");
    const resolvedAbsolute = path.resolve(destinationAbsolute, normalizedSlashes);
    if (resolvedAbsolute !== destinationAbsolute && !resolvedAbsolute.startsWith(destWithSep)) {
      throw new ArtifactDownloadError(
        "invalidZipEntry",
        `ZIP entry escapes destination directory: ${rawName}`,
      );
    }

    safe.push({
      rawName,
      isDirectory,
      relative: path.relative(destinationAbsolute, resolvedAbsolute),
      resolvedAbsolute,
      bytes,
    });
  }

  return safe;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Verify that no path component between `cwd` (after resolving its own symlinks)
 * and the target is itself a symlink. This guards against three failure modes
 * the lexical containment check cannot:
 *   1. A pre-existing symlink at any path component pointing outside cwd.
 *   2. A dangling symlink at the target itself (which `stat`-based checks
 *      treat as nonexistent and `writeFile` happily follows).
 *   3. A symlink introduced inside an already-existing destination directory
 *      between extraction prep and a per-entry write.
 *
 * Walks each path segment of `target` under `realpath(cwd)` and runs `lstat`
 * (which does NOT follow symlinks). Any symlink component is rejected. Missing
 * components stop the walk early (remaining components cannot exist either).
 *
 * Note: this is best-effort containment; a sufficiently determined attacker
 * with concurrent filesystem write access could introduce a symlink between
 * the check and the subsequent write (TOCTOU). Phase 7B treats that as out of
 * threat model since the cwd is a developer workspace, not a shared mount.
 */
async function verifyNoSymlinkComponents(cwd: string, targetAbsolute: string): Promise<void> {
  const cwdAbs = path.resolve(cwd);
  const cwdReal = await realpath(cwdAbs);
  const targetAbs = path.resolve(targetAbsolute);

  // Re-establish containment against the lexical cwd; resolveSafeOutputPath
  // already did this for output paths, but ZIP entry paths come through here
  // independently and could in theory be constructed against a different cwd.
  const lexicalWithSep = cwdAbs.endsWith(path.sep) ? cwdAbs : cwdAbs + path.sep;
  if (targetAbs !== cwdAbs && !targetAbs.startsWith(lexicalWithSep)) {
    throw new ArtifactDownloadError(
      "invalidOutput",
      "Output path is outside the workspace",
    );
  }

  const relative = targetAbs === cwdAbs ? "" : targetAbs.slice(cwdAbs.length + 1);
  const segments = relative.length === 0 ? [] : relative.split(path.sep).filter((s) => s.length > 0);

  let current = cwdReal;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new ArtifactDownloadError(
          "invalidOutput",
          `Output path component is a symbolic link: ${path.relative(cwdReal, current) || segment}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // This component does not exist on disk; remaining components cannot
        // exist either, so there is nothing left to verify here.
        return;
      }
      if (error instanceof ArtifactDownloadError) throw error;
      throw error;
    }
  }
}

/**
 * Detect file-vs-directory conflicts among ZIP entries themselves.
 *
 * Two failure modes are caught:
 *   1. **Same-path collision** — entry `a/` (directory) and entry `a` (regular
 *      file) both normalize to relative path `a`. Extraction would have to
 *      treat one path as both a file and a directory.
 *   2. **Ancestor collision** — file entry `a` and file entry `a/b.txt`. The
 *      `a` entry forces a regular file; the `a/b.txt` entry forces `a` to be
 *      a directory. The first write would succeed and the second would fail
 *      mid-extraction, leaving partial output despite the all-or-nothing
 *      preflight contract.
 */
function detectInternalEntryConflicts(safeEntries: SafeZipEntry[]): void {
  const fileEntries = safeEntries.filter((entry) => !entry.isDirectory);
  const dirEntries = safeEntries.filter((entry) => entry.isDirectory);
  const fileSet = new Set(fileEntries.map((entry) => entry.relative));
  const dirSet = new Set(dirEntries.map((entry) => entry.relative));

  // 1. Same path appears as both file and directory entry.
  for (const entry of fileEntries) {
    if (dirSet.has(entry.relative)) {
      throw new ArtifactDownloadError(
        "invalidZipEntry",
        `ZIP entry "${entry.rawName}" conflicts with directory entry at "${entry.relative}"`,
      );
    }
  }

  // 2. File entry exists at an ancestor of another entry.
  for (const entry of safeEntries) {
    if (!entry.relative) continue;
    const parts = entry.relative.split(path.sep).filter((segment) => segment.length > 0);
    for (let i = 1; i < parts.length; i += 1) {
      const prefix = parts.slice(0, i).join(path.sep);
      if (fileSet.has(prefix)) {
        throw new ArtifactDownloadError(
          "invalidZipEntry",
          `ZIP entry "${entry.rawName}" conflicts with file entry at "${prefix}"`,
        );
      }
    }
  }
}

function clampMaxBytes(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_ARTIFACT_DOWNLOAD_MAX_BYTES;
  return Math.min(Math.max(1, Math.floor(value)), ABSOLUTE_ARTIFACT_DOWNLOAD_MAX_BYTES);
}

function buildPreviewFromResolution(
  input: ArtifactDownloadInput,
  resolution: ArtifactSourceResolution,
  resolvedOutput: ResolvedOutputPath,
  artifactKind: ArtifactKind,
  extract: boolean,
  overwrite: boolean,
  maxBytes: number,
  notes: string[],
): ArtifactDownloadPreview {
  const preview: ArtifactDownloadPreview = {
    status: "preview",
    buildId: input.buildId,
    artifactName: input.artifactName,
    artifactKind,
    outputPath: input.outputPath,
    resolvedOutputPath: resolvedOutput.relative,
    extract,
    overwrite,
    maxBytes,
    wouldWrite: extract ? [] : [resolvedOutput.relative],
    requiresConfirmation: true,
    resolution,
    notes,
  };

  if (resolution.status === "resolved") {
    preview.resolvedArtifactKind = resolution.resolved.kind;
    if (resolution.resolved.pipelineId !== undefined) preview.pipelineId = resolution.resolved.pipelineId;
    if (resolution.resolved.runId !== undefined) preview.runId = resolution.resolved.runId;
  }

  return preview;
}

export async function downloadArtifact(
  client: AzureDevOpsClient,
  input: ArtifactDownloadInput,
): Promise<ArtifactDownloadPreview | ArtifactDownloadResult> {
  const artifactKind: ArtifactKind = input.artifactKind ?? "auto";
  const extract = Boolean(input.extract);
  const overwrite = Boolean(input.overwrite);
  const maxBytes = clampMaxBytes(input.maxBytes);
  const confirm = Boolean(input.confirm);

  if (!Number.isFinite(input.buildId) || input.buildId <= 0 || !Number.isInteger(input.buildId)) {
    throw new ArtifactDownloadError("invalidInput", "buildId must be a positive integer");
  }
  if (typeof input.artifactName !== "string" || input.artifactName.trim().length === 0) {
    throw new ArtifactDownloadError("invalidInput", "artifactName is required");
  }
  if (typeof input.cwd !== "string" || input.cwd.length === 0) {
    throw new ArtifactDownloadError("invalidInput", "cwd is required");
  }

  const resolvedOutput = resolveSafeOutputPath(input.cwd, input.outputPath);

  const resolution = await client.resolveArtifactSource({
    buildId: input.buildId,
    artifactName: input.artifactName,
    artifactKind,
    ...(input.pipelineId !== undefined ? { pipelineId: input.pipelineId } : {}),
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
  });

  const notes: string[] = [];
  if (resolution.status !== "resolved") {
    notes.push(resolution.message);
  } else if (resolution.notes) {
    notes.push(...resolution.notes);
  }
  if (extract) {
    notes.push("Extraction will list and validate ZIP entries before any file write.");
  }

  if (!confirm || resolution.status !== "resolved") {
    return buildPreviewFromResolution(
      input,
      resolution,
      resolvedOutput,
      artifactKind,
      extract,
      overwrite,
      maxBytes,
      notes,
    );
  }

  // Confirmed + resolved: download bytes.
  const download: DownloadArtifactZipResult = await client.downloadArtifactZip({
    buildId: input.buildId,
    artifactName: input.artifactName,
    resolvedArtifactKind: resolution.resolved.kind,
    ...(resolution.resolved.pipelineId !== undefined
      ? { pipelineId: resolution.resolved.pipelineId }
      : {}),
    ...(resolution.resolved.runId !== undefined ? { runId: resolution.resolved.runId } : {}),
    maxBytes,
  });

  if (!extract) {
    await verifyNoSymlinkComponents(input.cwd, resolvedOutput.resolvedAbsolute);
    if (await pathExists(resolvedOutput.resolvedAbsolute)) {
      if (!overwrite) {
        throw new ArtifactDownloadError(
          "outputExists",
          `Refusing to overwrite existing file ${resolvedOutput.relative}; pass overwrite=true to replace it.`,
        );
      }
    }
    const parentDir = path.dirname(resolvedOutput.resolvedAbsolute);
    await mkdir(parentDir, { recursive: true });
    await writeFile(resolvedOutput.resolvedAbsolute, download.bytes);

    const result: ArtifactDownloadResult = {
      status: "downloaded",
      buildId: input.buildId,
      artifactName: input.artifactName,
      artifactKind,
      resolvedArtifactKind: resolution.resolved.kind,
      outputPath: input.outputPath,
      resolvedOutputPath: resolvedOutput.relative,
      extract,
      overwrite,
      maxBytes,
      bytesDownloaded: download.bytes.byteLength,
      writtenFiles: [resolvedOutput.relative],
      resolution: resolution.notes !== undefined
        ? { status: "resolved", artifactKind, resolved: resolution.resolved, notes: resolution.notes }
        : { status: "resolved", artifactKind, resolved: resolution.resolved },
    };
    if (resolution.resolved.pipelineId !== undefined) result.pipelineId = resolution.resolved.pipelineId;
    if (resolution.resolved.runId !== undefined) result.runId = resolution.resolved.runId;
    if (notes.length > 0) result.notes = notes;
    return result;
  }

  // Extract path.
  const rawEntries = unzipSync(download.bytes);
  const safeEntries = validateZipEntries(resolvedOutput.resolvedAbsolute, rawEntries);
  detectInternalEntryConflicts(safeEntries);
  const fileEntries = safeEntries.filter((entry) => !entry.isDirectory);

  // Confirm the destination directory's deepest existing ancestor is not a symlink
  // pointing outside the workspace before doing any disk writes.
  await verifyNoSymlinkComponents(input.cwd, resolvedOutput.resolvedAbsolute);

  // Preflight overwrite checks.
  if (!overwrite) {
    for (const entry of fileEntries) {
      if (await pathExists(entry.resolvedAbsolute)) {
        throw new ArtifactDownloadError(
          "outputExists",
          `Refusing to overwrite existing extracted file ${path.relative(input.cwd, entry.resolvedAbsolute)}; pass overwrite=true to replace it.`,
        );
      }
    }
  }

  await mkdir(resolvedOutput.resolvedAbsolute, { recursive: true });

  // Re-verify after creating the destination directory: the directory we created
  // is now an existing ancestor for entry writes; if it became a symlink (it can
  // not via mkdir, but be defensive) the next check would catch it.
  await verifyNoSymlinkComponents(input.cwd, resolvedOutput.resolvedAbsolute);

  const writtenFiles: string[] = [];
  const cwdAbs = path.resolve(input.cwd);
  for (const entry of fileEntries) {
    const parentDir = path.dirname(entry.resolvedAbsolute);
    await mkdir(parentDir, { recursive: true });
    // Re-verify per entry: this catches symlinks pre-existing inside the
    // destination directory as well as symlinks introduced concurrently
    // between extraction prep and this write.
    await verifyNoSymlinkComponents(input.cwd, entry.resolvedAbsolute);
    await writeFile(entry.resolvedAbsolute, entry.bytes);
    writtenFiles.push(path.relative(cwdAbs, entry.resolvedAbsolute));
  }

  const result: ArtifactDownloadResult = {
    status: "extracted",
    buildId: input.buildId,
    artifactName: input.artifactName,
    artifactKind,
    resolvedArtifactKind: resolution.resolved.kind,
    outputPath: input.outputPath,
    resolvedOutputPath: resolvedOutput.relative,
    extract,
    overwrite,
    maxBytes,
    bytesDownloaded: download.bytes.byteLength,
    writtenFiles,
    resolution: resolution.notes !== undefined
      ? { status: "resolved", artifactKind, resolved: resolution.resolved, notes: resolution.notes }
      : { status: "resolved", artifactKind, resolved: resolution.resolved },
  };
  if (resolution.resolved.pipelineId !== undefined) result.pipelineId = resolution.resolved.pipelineId;
  if (resolution.resolved.runId !== undefined) result.runId = resolution.resolved.runId;
  if (notes.length > 0) result.notes = notes;
  return result;
}

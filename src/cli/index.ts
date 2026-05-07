#!/usr/bin/env node

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AZURE_DEVOPS_OPERATIONS,
  findOperationByCliCommand,
  getAuthSensitiveValues,
  redactSensitiveText,
  resolveTokenFromEnv,
  type AnyAzureDevOpsOperation,
  type CliFlagSpec,
  type DiagnoseFailureDetails,
} from "../core/index.js";
import { parsePositiveIntegerStrict } from "../core/parsing.js";

interface CliContext {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAG_NAMES = collectBooleanFlagNames();

function collectBooleanFlagNames(): Set<string> {
  const names = new Set<string>();
  for (const operation of AZURE_DEVOPS_OPERATIONS) {
    for (const spec of operation.cli.flags) {
      if (spec.kind === "boolean") names.add(spec.flag);
    }
  }
  return names;
}

function parseArgs(argv: string[]): ParsedArgs {
  const commandParts: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (!token.startsWith("--")) {
      commandParts.push(token);
      continue;
    }

    const flagName = token.slice(2);
    if (BOOLEAN_FLAG_NAMES.has(flagName)) {
      flags[flagName] = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    flags[flagName] = next;
    i += 1;
  }

  return {
    command: commandParts.join(" "),
    flags,
  };
}

function parseInputForOperation(
  operation: AnyAzureDevOpsOperation,
  flags: Record<string, string | boolean>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  for (const spec of operation.cli.flags) {
    const raw = flags[spec.flag];

    switch (spec.kind) {
      case "boolean": {
        if (raw === true) input[spec.key] = true;
        break;
      }
      case "string": {
        if (typeof raw === "string") {
          input[spec.key] = raw;
        } else if (spec.required) {
          throw new Error(`${operation.cli.command} requires --${spec.flag}`);
        }
        break;
      }
      case "integer": {
        if (typeof raw === "string") {
          input[spec.key] = parsePositiveIntegerStrict(raw, `--${spec.flag}`);
        } else if (spec.required) {
          throw new Error(`${operation.cli.command} requires --${spec.flag}`);
        }
        break;
      }
      case "enum": {
        if (typeof raw === "string") {
          if (!spec.values.includes(raw)) {
            throw new Error(`--${spec.flag} must be one of: ${spec.values.join(", ")}`);
          }
          input[spec.key] = raw;
        } else if (spec.defaultValue !== undefined) {
          input[spec.key] = spec.defaultValue;
        }
        break;
      }
    }
  }

  return input;
}

function isJsonRequested(flags: Record<string, string | boolean>): boolean {
  return flags.json === true;
}

function writeJson(context: CliContext, payload: unknown): void {
  context.stdout.write(`${redactSensitiveText(JSON.stringify(payload, null, 2))}\n`);
}

function writeText(context: CliContext, text: string): void {
  context.stdout.write(`${redactSensitiveText(text)}\n`);
}

function formatDiagnoseHuman(details: DiagnoseFailureDetails): string {
  const { diagnostics } = details;
  const excerpts = diagnostics.logs.excerpts
    .map((excerpt) => {
      const excerptLines = excerpt.text.split("\n");
      const markerOffset = excerpt.lineNumber - excerpt.startLine;
      const markerLine = excerptLines[markerOffset] ?? excerptLines[0] ?? "";
      return `- line ${excerpt.lineNumber} (${excerpt.marker}): ${markerLine}`;
    })
    .join("\n");
  const artifactNames =
    diagnostics.artifacts.map((artifact) => artifact.name).filter(Boolean).join(", ") || "none";

  const lines = [
    diagnostics.summary,
    diagnostics.matchedStageRecord
      ? `Matched stage: ${diagnostics.matchedStageRecord.name ?? diagnostics.matchedStageRecord.id}`
      : undefined,
    diagnostics.matchedJobRecord
      ? `Matched job: ${diagnostics.matchedJobRecord.name ?? diagnostics.matchedJobRecord.id}`
      : undefined,
    diagnostics.matchedTaskRecord
      ? `Matched task: ${diagnostics.matchedTaskRecord.name ?? diagnostics.matchedTaskRecord.id}`
      : undefined,
    diagnostics.logs.selected.resolvedLogId === undefined
      ? "Hint: no log selected. Pass a narrower --stage/--job/--task selector or use --log-id to fetch a specific log."
      : undefined,
    `Artifacts (metadata only): ${artifactNames}`,
    diagnostics.logs.excerpts.length > 0 ? `Excerpts:\n${excerpts}` : "Excerpts: none",
  ];

  return lines.filter(Boolean).join("\n");
}

function usage(): string {
  const usageLines = AZURE_DEVOPS_OPERATIONS
    .map((operation) => operation.cli.usage)
    .filter((line) => line.length > 0)
    .map((line) => `  ${line}`);

  return [
    "Usage:",
    ...usageLines,
    "",
    "Selectors: name selectors match exact, then case-insensitive exact, then substring; ambiguous matches return candidates.",
    "Stage selectors are status/evidence context only and never infer child task/job logs.",
  ].join("\n");
}
export async function runCli(argv: string[], context: Partial<CliContext> = {}): Promise<number> {
  const cliContext: CliContext = {
    stdout: context.stdout ?? process.stdout,
    stderr: context.stderr ?? process.stderr,
    env: context.env ?? process.env,
    cwd: context.cwd ?? process.cwd(),
  };

  try {
    const parsed = parseArgs(argv);
    const operation = findOperationByCliCommand(parsed.command);

    if (!operation) {
      cliContext.stderr.write(`${usage()}\n`);
      return 1;
    }

    const input = parseInputForOperation(operation, parsed.flags);
    const { details, sensitiveValues } = await operation.run(input as never, {
      cwd: cliContext.cwd,
      env: cliContext.env,
    });

    const asJson = isJsonRequested(parsed.flags);

    if (operation.key === "diagnoseFailure" && !asJson) {
      const human = formatDiagnoseHuman(details as DiagnoseFailureDetails);
      writeText(cliContext, redactSensitiveText(human, sensitiveValues));
      return 0;
    }

    writeJson(cliContext, details);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CLI error";
    const token = resolveTokenFromEnv(cliContext.env);
    const redactedMessage = redactSensitiveText(message, getAuthSensitiveValues(token?.token));
    cliContext.stderr.write(`pi-ado failed: ${redactedMessage}\n`);
    return 1;
  }
}

function resolveEntrypointPath(value: string): string {
  const absolutePath = path.resolve(value);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

const invokedPath = process.argv[1];
if (invokedPath) {
  const isEntrypoint =
    resolveEntrypointPath(fileURLToPath(import.meta.url)) === resolveEntrypointPath(invokedPath);
  if (isEntrypoint) {
    runCli(process.argv.slice(2)).then((code) => {
      process.exitCode = code;
    });
  }
}

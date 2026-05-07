import type { TSchema } from "typebox";

import type { AzureDevOpsClient } from "../client.js";
import type { ResolvedAzureDevOpsConfig } from "../config.js";

export type OperationSafety = "read-only" | "local-write";

export interface OperationRuntimeContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface OperationScope {
  organization: string;
  project: string;
  profile?: string;
}

export interface OperationRuntime {
  mode: "mock" | "live";
  scope: OperationScope;
  client: AzureDevOpsClient;
  authSensitiveValues: string[];
}

export interface DoctorRuntime {
  mode: "mock" | "live";
  config: ResolvedAzureDevOpsConfig;
  token: { token: string; source: string } | undefined;
}

export interface OperationResult<TDetails> {
  details: TDetails;
  sensitiveValues: string[];
}

export type CliFlagSpec =
  | { kind: "string"; flag: string; key: string; required?: boolean }
  | { kind: "integer"; flag: string; key: string; required?: boolean }
  | { kind: "boolean"; flag: string; key: string }
  | {
      kind: "enum";
      flag: string;
      key: string;
      values: readonly string[];
      defaultValue?: string;
    };

export interface OperationToolMetadata {
  name: string;
  label: string;
  description: string;
}

export interface OperationCliMetadata {
  command: string;
  usage: string;
  flags: readonly CliFlagSpec[];
}

export interface AzureDevOpsOperation<TInput, TDetails, TSchemaT extends TSchema = TSchema> {
  key: string;
  safety: OperationSafety;
  tool: OperationToolMetadata;
  cli: OperationCliMetadata;
  inputSchema: TSchemaT;
  run: (input: TInput, context: OperationRuntimeContext) => Promise<OperationResult<TDetails>>;
}

export type AnyAzureDevOpsOperation = AzureDevOpsOperation<any, any, TSchema>;

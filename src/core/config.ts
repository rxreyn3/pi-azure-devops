import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ConfigProfile {
  organization?: string;
  project?: string;
}

export interface AzureDevOpsConfigFile {
  defaultProfile?: string;
  profiles?: Record<string, ConfigProfile>;
}

export interface ResolveConfigInput {
  organization?: string;
  project?: string;
  profile?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedAzureDevOpsConfig {
  organization?: string;
  project?: string;
  profile?: string;
  sources: {
    organization?: string;
    project?: string;
    profile?: string;
  };
  warnings: string[];
  configFilesChecked: string[];
}

const ORG_ENV_KEYS = ["PI_AZURE_DEVOPS_ORGANIZATION", "PI_ADO_ORGANIZATION", "ADO_ORGANIZATION"];
const PROJECT_ENV_KEYS = ["PI_AZURE_DEVOPS_PROJECT", "PI_ADO_PROJECT", "ADO_PROJECT"];
const PROFILE_ENV_KEYS = ["PI_AZURE_DEVOPS_PROFILE", "PI_ADO_PROFILE", "ADO_PROFILE"];

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function findFirstEnvValue(keys: string[], env: NodeJS.ProcessEnv): { value?: string; source?: string } {
  for (const key of keys) {
    const raw = env[key];
    if (raw && raw.trim()) {
      return { value: raw.trim(), source: `env:${key}` };
    }
  }
  return {};
}

async function readConfigFileIfPresent(filePath: string): Promise<AzureDevOpsConfigFile | undefined> {
  if (!(await fileExists(filePath))) {
    return undefined;
  }

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as AzureDevOpsConfigFile;
  return parsed;
}

function detectSecretLikeConfigEntries(config: AzureDevOpsConfigFile): string[] {
  const warnings: string[] = [];
  const text = JSON.stringify(config).toLowerCase();
  if (text.includes("pat") || text.includes("token") || text.includes("systemaccesstoken")) {
    warnings.push("Configuration appears to contain token-like fields. Keep secrets in environment variables, not config files.");
  }
  return warnings;
}

async function findProjectConfigFiles(cwd: string): Promise<string[]> {
  const found: string[] = [];
  let current = path.resolve(cwd);

  while (true) {
    const candidates = [path.join(current, ".pi", "azure-devops.json"), path.join(current, ".pi", "azure-devops", "config.json")];
    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        found.push(candidate);
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return found;
}

async function loadFirstConfigFromPaths(paths: string[]): Promise<{ filePath?: string; config?: AzureDevOpsConfigFile }> {
  for (const candidate of paths) {
    const config = await readConfigFileIfPresent(candidate);
    if (config) {
      return { filePath: candidate, config };
    }
  }
  return {};
}

function resolveFromConfigProfile(
  config: AzureDevOpsConfigFile | undefined,
  profile: string | undefined,
): { organization?: string; project?: string; profile?: string } {
  if (!config?.profiles) return {};

  const profileName = profile ?? config.defaultProfile;
  if (!profileName) return {};

  const profileConfig = config.profiles[profileName];
  if (!profileConfig) return {};

  const resolved: { organization?: string; project?: string; profile?: string } = {
    profile: profileName,
  };

  if (profileConfig.organization !== undefined) {
    resolved.organization = profileConfig.organization;
  }
  if (profileConfig.project !== undefined) {
    resolved.project = profileConfig.project;
  }

  return resolved;
}

export async function resolveAzureDevOpsConfig(input: ResolveConfigInput = {}): Promise<ResolvedAzureDevOpsConfig> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const warnings: string[] = [];
  const configFilesChecked: string[] = [];

  const explicitProfile = input.profile;
  const envProfile = findFirstEnvValue(PROFILE_ENV_KEYS, env);
  const profile = explicitProfile ?? envProfile.value;

  const projectConfigPaths = await findProjectConfigFiles(cwd);
  const userConfigPaths = [path.join(os.homedir(), ".pi", "agent", "azure-devops", "config.json")];
  configFilesChecked.push(...projectConfigPaths, ...userConfigPaths);

  const projectConfigResult = await loadFirstConfigFromPaths(projectConfigPaths);
  const userConfigResult = await loadFirstConfigFromPaths(userConfigPaths);

  if (projectConfigResult.config) {
    warnings.push(...detectSecretLikeConfigEntries(projectConfigResult.config));
  }
  if (userConfigResult.config) {
    warnings.push(...detectSecretLikeConfigEntries(userConfigResult.config));
  }

  const projectConfigValue = resolveFromConfigProfile(projectConfigResult.config, profile);
  const userConfigValue = resolveFromConfigProfile(userConfigResult.config, profile);

  const envOrganization = findFirstEnvValue(ORG_ENV_KEYS, env);
  const envProject = findFirstEnvValue(PROJECT_ENV_KEYS, env);

  const organization =
    input.organization ??
    envOrganization.value ??
    projectConfigValue.organization ??
    userConfigValue.organization;

  const project = input.project ?? envProject.value ?? projectConfigValue.project ?? userConfigValue.project;

  const resolved: ResolvedAzureDevOpsConfig = {
    sources: {},
    warnings,
    configFilesChecked,
  };

  if (organization !== undefined) {
    resolved.organization = organization;
  }
  if (project !== undefined) {
    resolved.project = project;
  }
  if (profile !== undefined) {
    resolved.profile = profile;
  }

  const organizationSource =
    input.organization !== undefined
      ? "explicit"
      : envOrganization.source ??
        (projectConfigValue.organization ? projectConfigResult.filePath : undefined) ??
        (userConfigValue.organization ? userConfigResult.filePath : undefined);
  if (organizationSource !== undefined) {
    resolved.sources.organization = organizationSource;
  }

  const projectSource =
    input.project !== undefined
      ? "explicit"
      : envProject.source ??
        (projectConfigValue.project ? projectConfigResult.filePath : undefined) ??
        (userConfigValue.project ? userConfigResult.filePath : undefined);
  if (projectSource !== undefined) {
    resolved.sources.project = projectSource;
  }

  const profileSource = input.profile !== undefined ? "explicit" : envProfile.source ?? (profile ? "config-default" : undefined);
  if (profileSource !== undefined) {
    resolved.sources.profile = profileSource;
  }

  return resolved;
}

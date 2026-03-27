import * as vscode from "vscode";
import { ExtensionInfo, BackupData } from "./types/backup-types";
import {
  SENSITIVE_KEYS_PATTERNS,
  SETTINGS_TO_CAPTURE,
} from "./constants/backup";

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS_PATTERNS.some((pattern) => lowerKey.includes(pattern));
}

function sanitizeValue(obj: unknown, parentKey = ""): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) =>
      sanitizeValue(item, `${parentKey}[${index}]`),
    );
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        continue;
      }
      sanitized[key] = sanitizeValue(value, key);
    }
    return sanitized;
  }

  return obj;
}

export function sanitizeSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeValue(settings) as Record<string, unknown>;
}

export function readExtensions(): ExtensionInfo[] {
  const extensions = vscode.extensions.all;
  const nonBuiltIn = extensions.filter((ext) => !ext.packageJSON.isBuiltin);

  return nonBuiltIn.map((ext) => ({
    id: ext.id,
    version: ext.packageJSON.version || "unknown",
  }));
}

function getGlobalObjectValue(
  inspected: ReturnType<vscode.WorkspaceConfiguration["inspect"]>,
): Record<string, unknown> | undefined {
  if (!inspected?.globalValue || typeof inspected.globalValue !== "object") {
    return undefined;
  }

  return inspected.globalValue as Record<string, unknown>;
}

function isConfigMethodKey(key: string): boolean {
  return (
    key.startsWith("$") ||
    key === "has" ||
    key === "get" ||
    key === "update" ||
    key === "inspect"
  );
}

function readSectionSettings(
  section: string,
): Record<string, unknown> | undefined {
  const sectionConfig = vscode.workspace.getConfiguration(section);
  const globalSectionValue = getGlobalObjectValue(sectionConfig.inspect(""));

  if (globalSectionValue) {
    return globalSectionValue;
  }

  const sectionSettings: Record<string, unknown> = {};
  const configObj = sectionConfig as unknown as Record<string, unknown>;

  for (const key of Object.keys(configObj)) {
    if (isConfigMethodKey(key)) {
      continue;
    }

    const fullInspect = vscode.workspace
      .getConfiguration()
      .inspect(`${section}.${key}`);

    if (fullInspect?.globalValue !== undefined) {
      sectionSettings[key] = fullInspect.globalValue;
    }
  }

  return Object.keys(sectionSettings).length > 0 ? sectionSettings : undefined;
}

export function readSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration();
  const allSettings: Record<string, unknown> = {};

  const globalSettings = getGlobalObjectValue(config.inspect(""));
  if (globalSettings) {
    Object.assign(allSettings, globalSettings);
  }

  for (const section of SETTINGS_TO_CAPTURE) {
    const sectionSettings = readSectionSettings(section);
    if (sectionSettings) {
      allSettings[section] = sectionSettings;
    }
  }

  return allSettings;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replaceAll(/[xy]/g, (c) => {
    const r = Math.trunc(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOSName(): string {
  const platform = process.platform;
  switch (platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

export function createBackupData(): BackupData {
  const extensions = readExtensions();
  const rawSettings = readSettings();
  const settings = sanitizeSettings(rawSettings);

  return {
    _meta: {
      generatedBy: "Ark",
      builtBy: "Evans Elabo",
      tagLine: "Duh Duh",
    },
    id: generateUUID(),
    timestamp: new Date().toISOString(),
    extensions,
    settings,
    machineInfo: {
      os: getOSName(),
      vscodeVersion: vscode.version,
    },
  };
}

export function countNonBuiltInExtensions(): number {
  return vscode.extensions.all.filter((ext) => !ext.packageJSON.isBuiltin)
    .length;
}

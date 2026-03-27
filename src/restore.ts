import * as vscode from "vscode";
import { execSync } from "node:child_process";
import * as os from "node:os";
import { fetchGist } from "./gist";
import { ExtensionInfo } from "./types/backup-types";

// Platform-specific extension patterns
const PLATFORM_SPECIFIC_PATTERNS = [
  "ms-vscode-remote.remote-wsl",
  "ms-vscode-remote.remote-containers",
  "ms-vscode-remote.remote-ssh",
  "ms-vscode.remote-server",
  "ms-windows-ai-studio",
  "ms-wsl",
];

function getCurrentPlatform(): string {
  const platform = os.platform();
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

function isPlatformSpecificExtension(extensionId: string): boolean {
  const lowerId = extensionId.toLowerCase();
  return PLATFORM_SPECIFIC_PATTERNS.some(
    (pattern) =>
      lowerId === pattern.toLowerCase() ||
      lowerId.includes("remote-wsl") ||
      lowerId.includes("remote-containers"),
  );
}

function getCurrentSettings(): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

  // Read common setting sections
  const sections = [
    "editor",
    "workbench",
    "terminal",
    "files",
    "search",
    "debug",
    "git",
    "extensions",
  ];

  for (const section of sections) {
    const sectionConfig = vscode.workspace.getConfiguration(section);
    const inspected = sectionConfig.inspect("");

    if (inspected?.globalValue && typeof inspected.globalValue === "object") {
      settings[section] = inspected.globalValue;
    }
  }

  return settings;
}

function filterPlatformSpecificExtensions(
  extensions: ExtensionInfo[],
  backupPlatform: string,
  currentPlatform: string,
): { compatible: ExtensionInfo[]; platformSpecific: ExtensionInfo[] } {
  if (backupPlatform === currentPlatform) {
    return { compatible: extensions, platformSpecific: [] };
  }

  const compatible: ExtensionInfo[] = [];
  const platformSpecific: ExtensionInfo[] = [];

  for (const ext of extensions) {
    if (isPlatformSpecificExtension(ext.id)) {
      platformSpecific.push(ext);
    } else {
      compatible.push(ext);
    }
  }

  return { compatible, platformSpecific };
}

export async function installExtensions(
  extensions: ExtensionInfo[],
  progress: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];
  const total = extensions.length;

  for (let i = 0; i < extensions.length; i++) {
    const ext = extensions[i];
    progress.report({
      message: `Installing ${ext.id} (${i + 1}/${total})`,
      increment: (1 / total) * 100,
    });

    try {
      execSync(`code --install-extension ${ext.id} --force`, {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 120000,
      });
      succeeded.push(ext.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to install ${ext.id}: ${errorMessage}`);
      failed.push(ext.id);
    }
  }

  return { succeeded, failed };
}

function diffSettings(
  current: Record<string, unknown>,
  backup: Record<string, unknown>,
): { added: string[]; modified: string[]; unchanged: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  function flattenObject(
    obj: Record<string, unknown>,
    prefix = "",
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        Object.assign(
          result,
          flattenObject(value as Record<string, unknown>, fullKey),
        );
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }

  const flatCurrent = flattenObject(current);
  const flatBackup = flattenObject(backup);

  for (const key of Object.keys(flatBackup)) {
    if (!(key in flatCurrent)) {
      added.push(key);
    } else if (
      JSON.stringify(flatCurrent[key]) === JSON.stringify(flatBackup[key])
    ) {
      unchanged.push(key);
    } else {
      modified.push(key);
    }
  }

  return { added, modified, unchanged };
}

async function confirmSettingsRestore(
  current: Record<string, unknown>,
  backup: Record<string, unknown>,
): Promise<boolean> {
  const { added, modified } = diffSettings(current, backup);

  if (added.length === 0 && modified.length === 0) {
    return true; // No changes, proceed silently
  }

  const totalChanges = added.length + modified.length;
  const changesSummary: string[] = [];

  if (added.length > 0) {
    changesSummary.push(`${added.length} new setting(s)`);
  }
  if (modified.length > 0) {
    changesSummary.push(`${modified.length} modified setting(s)`);
  }

  const detailMessage =
    totalChanges <= 5
      ? `Changes: ${[...added, ...modified].join(", ")}`
      : `${changesSummary.join(" and ")} will be applied.`;

  const choice = await vscode.window.showWarningMessage(
    `Ark: Restore will change ${totalChanges} setting(s). ${detailMessage}`,
    { modal: true },
    "Apply Changes",
    "Skip Settings",
  );

  return choice === "Apply Changes";
}

export async function writeSettings(
  settings: Record<string, unknown>,
): Promise<void> {
  const config = vscode.workspace.getConfiguration();

  for (const [section, value] of Object.entries(settings)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [key, subValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const fullKey = `${section}.${key}`;
        try {
          await config.update(
            fullKey,
            subValue,
            vscode.ConfigurationTarget.Global,
          );
        } catch (error) {
          console.error(`Failed to update setting ${fullKey}:`, error);
        }
      }
    } else {
      try {
        await config.update(section, value, vscode.ConfigurationTarget.Global);
      } catch (error) {
        console.error(`Failed to update setting ${section}:`, error);
      }
    }
  }
}

export async function runRestore(
  context: vscode.ExtensionContext,
  pat: string,
): Promise<void> {
  const gistId = context.globalState.get<string>("ark.gistId");

  if (!gistId) {
    throw new Error(
      "No backup found. Please run a backup first or ensure you have the correct GitHub token.",
    );
  }

  const backup = await fetchGist(pat, gistId);
  const currentPlatform = getCurrentPlatform();
  const backupPlatform = backup.machineInfo.os;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Ark: Restoring your setup",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Fetching backup data..." });

      const currentExtensions = new Set(
        vscode.extensions.all
          .filter((ext) => !ext.packageJSON.isBuiltin)
          .map((ext) => ext.id.toLowerCase()),
      );

      let extensionsToInstall = backup.extensions.filter(
        (ext) => !currentExtensions.has(ext.id.toLowerCase()),
      );

      // Check for platform-specific extensions
      const { compatible, platformSpecific } = filterPlatformSpecificExtensions(
        extensionsToInstall,
        backupPlatform,
        currentPlatform,
      );

      if (platformSpecific.length > 0) {
        const skipChoice = await vscode.window.showWarningMessage(
          `${platformSpecific.length} extension(s) may not work on ${currentPlatform} (backup from ${backupPlatform}): ${platformSpecific.map((e) => e.id).join(", ")}. Skip them?`,
          "Skip",
          "Install anyway",
        );

        if (skipChoice === "Skip") {
          extensionsToInstall = compatible;
        }
      }

      if (extensionsToInstall.length > 0) {
        progress.report({
          message: `Installing ${extensionsToInstall.length} extensions...`,
        });
        const { succeeded, failed } = await installExtensions(
          extensionsToInstall,
          progress,
        );

        if (failed.length > 0) {
          vscode.window.showWarningMessage(
            `Ark: ${failed.length} extension(s) failed to install: ${failed.join(", ")}`,
          );
        }

        if (succeeded.length > 0) {
          vscode.window.showInformationMessage(
            `Ark: Successfully installed ${succeeded.length} extension(s)`,
          );
        }
      } else {
        progress.report({ message: "All extensions already installed" });
      }

      progress.report({ message: "Checking settings..." });

      // Get current settings for comparison
      const currentSettings = getCurrentSettings();
      const shouldRestoreSettings = await confirmSettingsRestore(
        currentSettings,
        backup.settings,
      );

      if (shouldRestoreSettings) {
        progress.report({ message: "Restoring settings..." });
        await writeSettings(backup.settings);
      } else {
        progress.report({ message: "Skipping settings restore..." });
      }

      progress.report({ message: "Restore complete!" });
    },
  );

  const backupDate = new Date(backup.timestamp).toLocaleString();
  const reloadChoice = await vscode.window.showInformationMessage(
    `Ark: Restore complete! Backup from ${backupDate} (${backup.machineInfo.os}, VS Code ${backup.machineInfo.vscodeVersion}). Reload window to apply all changes?`,
    "Reload Now",
    "Later",
  );

  if (reloadChoice === "Reload Now") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

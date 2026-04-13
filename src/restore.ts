import * as vscode from "vscode";
import { execSync } from "node:child_process";
import { fetchBackupHistory, fetchGist, getBackupFromHistory } from "./gist";
import {
  BackupHistoryEntry,
  ExtensionInfo,
  ExtensionPlatformTag,
} from "./types/backup-types";
import { getCurrentPlatform, getExtensionPlatformTag } from "./platform";

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
    if (getStoredOrDerivedPlatformTag(ext) === "platform-specific") {
      platformSpecific.push(ext);
    } else {
      compatible.push(ext);
    }
  }

  return { compatible, platformSpecific };
}

function getStoredOrDerivedPlatformTag(
  extension: ExtensionInfo,
): ExtensionPlatformTag {
  return extension.platformTag || getExtensionPlatformTag(extension.id);
}

function getPlatformTagDescription(
  extension: ExtensionInfo,
  backupPlatform: string,
  currentPlatform: string,
): string {
  const platformTag = getStoredOrDerivedPlatformTag(extension);

  if (platformTag === "platform-specific") {
    if (backupPlatform === currentPlatform) {
      return `Platform-specific for ${backupPlatform}`;
    }

    return `Platform-specific from ${backupPlatform}`;
  }

  return "Cross-platform";
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

interface SelectiveRestoreOptions {
  extensions: string[];
  settingsCategories: string[];
}

async function showSelectiveRestoreDialog(
  extensions: ExtensionInfo[],
  settingsObject: Record<string, unknown>,
  backupPlatform: string,
  currentPlatform: string,
): Promise<SelectiveRestoreOptions> {
  // Create quick pick items for extensions
  const extensionItems = extensions.map((ext) => ({
    label: ext.id,
    picked: true,
    description: `v${ext.version}`,
    detail: getPlatformTagDescription(ext, backupPlatform, currentPlatform),
  }));

  // Get settings categories
  const settingsCategories = Object.keys(settingsObject);
  const settingsItems = settingsCategories.map((category) => ({
    label: category,
    picked: true,
    description: "Settings category",
  }));

  // Show extension selector
  const selectedExtensions = await vscode.window.showQuickPick(extensionItems, {
    canPickMany: true,
    title: "Select Extensions to Restore",
    placeHolder:
      "Check extensions you want to restore (all checked by default)",
  });

  // Show settings selector
  const selectedSettings = await vscode.window.showQuickPick(settingsItems, {
    canPickMany: true,
    title: "Select Settings to Restore",
    placeHolder:
      "Check settings categories you want to restore (all checked by default)",
  });

  return {
    extensions: selectedExtensions
      ? selectedExtensions.map((item) => item.label)
      : [],
    settingsCategories: selectedSettings
      ? selectedSettings.map((item) => item.label)
      : [],
  };
}

export async function writeSettings(
  settings: Record<string, unknown>,
  selectedCategories?: string[],
): Promise<void> {
  const config = vscode.workspace.getConfiguration();

  // If specific categories selected, filter to only those
  const categoriesToRestore = selectedCategories
    ? Object.fromEntries(
        Object.entries(settings).filter(([section]) =>
          selectedCategories.includes(section),
        ),
      )
    : settings;

  for (const [section, value] of Object.entries(categoriesToRestore)) {
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
  backupId?: string,
): Promise<void> {
  const gistId = context.globalState.get<string>("ark.gistId");

  if (!gistId) {
    throw new Error(
      "No backup found. Please run a backup first or ensure you have the correct GitHub token.",
    );
  }

  // Fetch backup data - either from history (if backupId provided) or latest
  let backup;
  if (backupId) {
    backup = await getBackupFromHistory(pat, gistId, backupId);
  } else {
    backup = await fetchGist(pat, gistId);
  }

  const currentPlatform = getCurrentPlatform();
  const backupPlatform = backup.machineInfo.os;

  // Show selective restore dialog
  const selectiveRestore = await showSelectiveRestoreDialog(
    backup.extensions,
    backup.settings,
    backupPlatform,
    currentPlatform,
  );

  // If user cancelled selection, abort
  if (
    selectiveRestore.extensions.length === 0 &&
    selectiveRestore.settingsCategories.length === 0
  ) {
    vscode.window.showInformationMessage("Ark: Restore cancelled");
    return;
  }

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

      // Filter to only selected extensions that aren't already installed
      let extensionsToInstall = backup.extensions
        .filter((ext) => selectiveRestore.extensions.includes(ext.id))
        .filter((ext) => !currentExtensions.has(ext.id.toLowerCase()));

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
        progress.report({
          message: "All selected extensions already installed",
        });
      }

      progress.report({ message: "Checking settings..." });

      // Get current settings for comparison
      const currentSettings = getCurrentSettings();

      // Filter backup settings to only selected categories
      const selectedBackupSettings = Object.fromEntries(
        Object.entries(backup.settings).filter(([category]) =>
          selectiveRestore.settingsCategories.includes(category),
        ),
      );

      const shouldRestoreSettings = await confirmSettingsRestore(
        currentSettings,
        selectedBackupSettings,
      );

      if (
        shouldRestoreSettings &&
        selectiveRestore.settingsCategories.length > 0
      ) {
        progress.report({ message: "Restoring settings..." });
        await writeSettings(selectedBackupSettings);
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

interface MissingExtensionCandidate {
  extension: ExtensionInfo;
  lastSeenAt: string;
  lastSeenOn: string;
}

function findMissingExtensionsFromHistory(
  history: BackupHistoryEntry[],
): MissingExtensionCandidate[] {
  const currentExtensions = new Set(
    vscode.extensions.all
      .filter((ext) => !ext.packageJSON.isBuiltin)
      .map((ext) => ext.id.toLowerCase()),
  );

  const missingById = new Map<string, MissingExtensionCandidate>();

  for (const entry of [...history].reverse()) {
    for (const extension of entry.backup.extensions) {
      const extensionId = extension.id.toLowerCase();

      if (currentExtensions.has(extensionId) || missingById.has(extensionId)) {
        continue;
      }

      missingById.set(extensionId, {
        extension,
        lastSeenAt: entry.timestamp,
        lastSeenOn: entry.machineInfo.os,
      });
    }
  }

  return [...missingById.values()].sort((a, b) =>
    a.extension.id.localeCompare(b.extension.id),
  );
}

export async function runRecoverMissingExtensions(
  context: vscode.ExtensionContext,
  pat: string,
): Promise<void> {
  const gistId = context.globalState.get<string>("ark.gistId");

  if (!gistId) {
    throw new Error("No backup history found. Create a backup first.");
  }

  const history = await fetchBackupHistory(pat, gistId);
  const missingExtensions = findMissingExtensionsFromHistory(history.backups);
  const currentPlatform = getCurrentPlatform();

  if (missingExtensions.length === 0) {
    vscode.window.showInformationMessage(
      "Ark: No missing extensions found in your backup history.",
    );
    return;
  }

  const selected = await vscode.window.showQuickPick(
    missingExtensions.map((candidate) => ({
      label: candidate.extension.id,
      picked: true,
      description: `v${candidate.extension.version}`,
      detail: `${getPlatformTagDescription(candidate.extension, candidate.lastSeenOn, currentPlatform)} • last seen ${new Date(candidate.lastSeenAt).toLocaleString()}`,
    })),
    {
      canPickMany: true,
      title: "Recover Missing Extensions",
      placeHolder:
        "Select missing extensions to reinstall from your backup history",
    },
  );

  if (!selected || selected.length === 0) {
    vscode.window.showInformationMessage("Ark: Recovery cancelled");
    return;
  }

  const selectedIds = new Set(selected.map((item) => item.label));
  let extensionsToInstall = missingExtensions
    .filter((candidate) => selectedIds.has(candidate.extension.id))
    .map((candidate) => candidate.extension);

  const platformSpecificSelections = missingExtensions.filter(
    (candidate) =>
      selectedIds.has(candidate.extension.id) &&
      getStoredOrDerivedPlatformTag(candidate.extension) ===
        "platform-specific" &&
      candidate.lastSeenOn !== currentPlatform,
  );

  if (platformSpecificSelections.length > 0) {
    const skipChoice = await vscode.window.showWarningMessage(
      `${platformSpecificSelections.length} selected extension(s) were tagged as platform-specific on another OS: ${platformSpecificSelections.map((entry) => entry.extension.id).join(", ")}. Skip them?`,
      "Skip",
      "Install anyway",
    );

    if (skipChoice === "Skip") {
      const skipped = new Set(
        platformSpecificSelections.map((entry) => entry.extension.id),
      );
      extensionsToInstall = extensionsToInstall.filter(
        (extension) => !skipped.has(extension.id),
      );
    }
  }

  if (extensionsToInstall.length === 0) {
    vscode.window.showInformationMessage(
      "Ark: No compatible missing extensions selected for recovery.",
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Ark: Recovering missing extensions",
      cancellable: false,
    },
    async (progress) => {
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
          `Ark: Recovered ${succeeded.length} missing extension(s).`,
        );
      }
    },
  );
}

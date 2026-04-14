import * as vscode from "vscode";
import { createBackupData, countNonBuiltInExtensions } from "./backup";
import {
  createGist,
  updateGist,
  verifyPat,
  updateBackupHistory,
  fetchBackupHistory,
  fetchGist,
} from "./gist";
import { runRecoverMissingExtensions, runRestore } from "./restore";
import { ArkSidebarProvider } from "./sidebar";
import {
  PAT_SECRET_KEY,
  GIST_ID_KEY,
  LAST_BACKUP_KEY,
  AUTO_BACKUP_DEBOUNCE_MS,
} from "./constants/extension";

let statusBarItem: vscode.StatusBarItem;
let debounceTimer: NodeJS.Timeout | undefined;
let extensionContext: vscode.ExtensionContext;
let sidebarProvider: ArkSidebarProvider;

async function getPat(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  return context.secrets.get(PAT_SECRET_KEY);
}

async function setPat(
  context: vscode.ExtensionContext,
  pat: string,
): Promise<void> {
  await context.secrets.store(PAT_SECRET_KEY, pat);
}

async function promptForPat(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const pat = await vscode.window.showInputBox({
    prompt: 'Enter your GitHub Personal Access Token with "gist" scope',
    placeHolder: "ghp_xxxxxxxxxxxxxxxxxxxx",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "Token cannot be empty";
      }
      return null;
    },
  });

  if (!pat) {
    return undefined;
  }

  const trimmedPat = pat.trim();

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Verifying GitHub token...",
      cancellable: false,
    },
    async () => {
      return verifyPat(trimmedPat);
    },
  );

  if (!result.valid) {
    vscode.window.showErrorMessage(
      `Ark: Invalid GitHub token. ${result.error || "Please check your token and try again."}`,
    );
    return undefined;
  }

  await setPat(context, trimmedPat);
  vscode.window.showInformationMessage("Ark: GitHub token saved securely.");
  return trimmedPat;
}

async function ensurePat(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  let pat = await getPat(context);

  if (!pat) {
    pat = await promptForPat(context);
  }

  return pat;
}

async function handleBackup(context: vscode.ExtensionContext): Promise<void> {
  try {
    const pat = await ensurePat(context);
    if (!pat) {
      vscode.window.showWarningMessage(
        "Ark: Backup cancelled. GitHub token is required.",
      );
      return;
    }

    updateStatusBarBacking();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Ark: Creating backup...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Collecting extensions and settings..." });
        const backup = createBackupData();

        const existingGistId = context.globalState.get<string>(GIST_ID_KEY);

        if (existingGistId) {
          progress.report({ message: "Updating existing backup..." });
          try {
            await updateGist(pat, existingGistId, backup);
            progress.report({ message: "Updating backup history..." });
            await updateBackupHistory(pat, existingGistId, backup);
          } catch (error) {
            if (error instanceof Error && error.message.includes("404")) {
              vscode.window.showWarningMessage(
                "Ark: Previous backup not found on GitHub. Creating a new backup.",
              );
            } else {
              throw error;
            }

            progress.report({
              message: "Creating new backup (previous gist not found)...",
            });
            const newGistId = await createGist(pat, backup);
            await context.globalState.update(GIST_ID_KEY, newGistId);
            progress.report({ message: "Updating backup history..." });
            await updateBackupHistory(pat, newGistId, backup);
          }
        } else {
          progress.report({ message: "Creating new backup..." });
          const gistId = await createGist(pat, backup);
          await context.globalState.update(GIST_ID_KEY, gistId);
          progress.report({ message: "Updating backup history..." });
          await updateBackupHistory(pat, gistId, backup);
        }

        progress.report({ message: "Backup complete!" });
      },
    );

    await context.globalState.update(LAST_BACKUP_KEY, Date.now());
    updateStatusBar();

    const extensionCount = countNonBuiltInExtensions();
    vscode.window.showInformationMessage(
      `Ark: Backup complete! Saved ${extensionCount} extensions and your settings.`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Ark: Backup failed. ${errorMessage}`);
  }
}

async function handleRestore(context: vscode.ExtensionContext): Promise<void> {
  try {
    const pat = await ensurePat(context);
    if (!pat) {
      vscode.window.showWarningMessage(
        "Ark: Restore cancelled. GitHub token is required.",
      );
      return;
    }

    await runRestore(context, pat);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Ark: Restore failed. ${errorMessage}`);
  }
}

async function handleSetPat(context: vscode.ExtensionContext): Promise<void> {
  try {
    const pat = await promptForPat(context);
    if (pat) {
      vscode.window.showInformationMessage(
        "Ark: GitHub token updated successfully.",
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Ark: Failed to set token. ${errorMessage}`);
  }
}

async function handleRestoreFromHistory(
  context: vscode.ExtensionContext,
  backupId: string,
): Promise<void> {
  try {
    const pat = await ensurePat(context);
    if (!pat) {
      vscode.window.showWarningMessage(
        "Ark: Restore cancelled. GitHub token is required.",
      );
      return;
    }

    await runRestore(context, pat, backupId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Ark: Restore failed. ${errorMessage}`);
  }
}

async function handleRecoverMissingExtensions(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const pat = await ensurePat(context);
    if (!pat) {
      vscode.window.showWarningMessage(
        "Ark: Recovery cancelled. GitHub token is required.",
      );
      return;
    }

    await runRecoverMissingExtensions(context, pat);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Ark: Recovery failed. ${errorMessage}`);
  }
}

async function handleViewBackupHistory(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const pat = await ensurePat(context);
    if (!pat) {
      vscode.window.showWarningMessage("Ark: GitHub token is required.");
      return;
    }

    const gistId = context.globalState.get<string>(GIST_ID_KEY);
    if (!gistId) {
      vscode.window.showInformationMessage(
        "Ark: No backups found. Create a backup first.",
      );
      return;
    }

    const history = await fetchBackupHistory(pat, gistId);

    if (history.backups.length === 0) {
      vscode.window.showInformationMessage("Ark: No backup history found.");
      return;
    }

    // Reverse to show newest first
    const backups = [...history.backups].reverse();

    const quickPickItems = backups.map((entry) => {
      const date = new Date(entry.timestamp).toLocaleString();
      return {
        label: `📅 ${date}`,
        description: `${entry.extensionCount} extensions, ${entry.settingsCount} settings (${entry.machineInfo.os})`,
        backupId: entry.id,
      };
    });

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      title: "Select Backup to Restore",
      placeHolder: "Choose a backup version",
    });

    if (selected && "backupId" in selected) {
      await handleRestoreFromHistory(context, selected.backupId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Ark: Failed to view history. ${errorMessage}`,
    );
  }
}

async function checkForNewMachine(
  context: vscode.ExtensionContext,
): Promise<void> {
  const extensionCount = countNonBuiltInExtensions();
  const gistId = context.globalState.get<string>(GIST_ID_KEY);
  const pat = await getPat(context);

  if (extensionCount < 3 && gistId && pat) {
    const choice = await vscode.window.showInformationMessage(
      "Looks like a new or wiped machine. Restore your previous setup?",
      "Restore now",
      "Dismiss",
    );

    if (choice === "Restore now") {
      await handleRestore(context);
    }
  }
}

function formatTimeSince(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hr ago`;
  } else {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }
}

function updateStatusBar(): void {
  const lastBackup = extensionContext.globalState.get<number>(LAST_BACKUP_KEY);

  if (lastBackup) {
    statusBarItem.text = `$(cloud-upload) Ark: ${formatTimeSince(lastBackup)}`;
    statusBarItem.tooltip = `Last backup: ${new Date(lastBackup).toLocaleString()}\nClick to backup now`;
  } else {
    statusBarItem.text = "$(cloud-upload) Ark: No backup";
    statusBarItem.tooltip = "Click to create your first backup";
  }

  statusBarItem.show();
}

function updateStatusBarBacking(): void {
  statusBarItem.text = "$(sync~spin) Ark: Backing up...";
  statusBarItem.tooltip = "Backup in progress...";
  statusBarItem.show();
}

function showBackupCompleteNotification(
  extensionCount: number,
  settingsCount: number,
): void {
  const message = `✅ Backup complete! ${extensionCount} extensions, ${settingsCount} settings saved.`;
  vscode.window.showInformationMessage(`Ark: ${message}`);
}

async function performSilentBackup(): Promise<void> {
  try {
    const pat = await getPat(extensionContext);
    if (!pat) {
      return; // No token, skip silent backup
    }

    updateStatusBarBacking();

    const backup = createBackupData();
    const existingGistId =
      extensionContext.globalState.get<string>(GIST_ID_KEY);

    if (existingGistId) {
      try {
        await updateGist(pat, existingGistId, backup);
        await updateBackupHistory(pat, existingGistId, backup);
      } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
          const newGistId = await createGist(pat, backup);
          await extensionContext.globalState.update(GIST_ID_KEY, newGistId);
          await updateBackupHistory(pat, newGistId, backup);
        } else {
          throw error;
        }
      }
    } else {
      const gistId = await createGist(pat, backup);
      await extensionContext.globalState.update(GIST_ID_KEY, gistId);
      await updateBackupHistory(pat, gistId, backup);
    }

    await extensionContext.globalState.update(LAST_BACKUP_KEY, Date.now());
    updateStatusBar();
    sidebarProvider.refresh();

    // Show completion notification with details
    const extensionCount = countNonBuiltInExtensions();
    const settingsCount = Object.keys(backup.settings).length;
    showBackupCompleteNotification(extensionCount, settingsCount);
  } catch (error) {
    console.error("Ark: Silent backup failed:", error);
  }
}

function scheduleAutoBackup(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  statusBarItem.text = "$(sync~spin) Ark: Backing up...";

  debounceTimer = setTimeout(async () => {
    await performSilentBackup();
    debounceTimer = undefined;
  }, AUTO_BACKUP_DEBOUNCE_MS);
}

function setupAutoBackupTriggers(context: vscode.ExtensionContext): void {
  // Listen for extension changes
  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    scheduleAutoBackup();
  });

  // Listen for configuration changes
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(() => {
    scheduleAutoBackup();
  });

  context.subscriptions.push(extensionChangeListener, configChangeListener);
}

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "ark.backup";
  context.subscriptions.push(statusBarItem);

  // Register sidebar webview provider
  sidebarProvider = new ArkSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ArkSidebarProvider.viewType,
      sidebarProvider,
    ),
  );

  const backupCommand = vscode.commands.registerCommand(
    "ark.backup",
    async () => {
      await handleBackup(context);
      sidebarProvider.refresh();
    },
  );

  const restoreCommand = vscode.commands.registerCommand("ark.restore", () => {
    handleRestore(context);
  });

  const setPatCommand = vscode.commands.registerCommand(
    "ark.setPat",
    async () => {
      await handleSetPat(context);
      sidebarProvider.refresh();
    },
  );

  const refreshSidebarCommand = vscode.commands.registerCommand(
    "ark.refreshSidebar",
    () => {
      sidebarProvider.refresh();
    },
  );

  const restoreFromHistoryCommand = vscode.commands.registerCommand(
    "ark.restoreFromHistory",
    async (backupId: string) => {
      await handleRestoreFromHistory(context, backupId);
      sidebarProvider.refresh();
    },
  );

  const viewHistoryCommand = vscode.commands.registerCommand(
    "ark.viewHistory",
    async () => {
      await handleViewBackupHistory(context);
    },
  );

  const recoverMissingExtensionsCommand = vscode.commands.registerCommand(
    "ark.recoverMissingExtensions",
    async () => {
      await handleRecoverMissingExtensions(context);
      sidebarProvider.refresh();
    },
  );

  const setGistIdCommand = vscode.commands.registerCommand(
    "ark.setGistId",
    async () => {
      try {
        const pat = await ensurePat(context);
        if (!pat) {
          vscode.window.showWarningMessage(
            "Ark: Setting Gist ID cancelled. GitHub token is required.",
          );
          return;
        }

        const gistId = await vscode.window.showInputBox({
          prompt: "Paste the Gist ID (from the Gist URL)",
          placeHolder: "e.g. 1a2b3c4d5e6f7g8h9i",
          ignoreFocusOut: true,
          validateInput: (v) =>
            v && v.trim().length ? null : "Gist ID required",
        });

        if (!gistId) {
          return;
        }

        const trimmed = gistId.trim();

        // Verify the gist contains the expected backup file
        try {
          await fetchGist(pat, trimmed);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Ark: Unable to verify Gist ID: ${msg}`,
          );
          return;
        }

        await context.globalState.update(GIST_ID_KEY, trimmed);
        vscode.window.showInformationMessage("Ark: Gist ID saved.");
        sidebarProvider.refresh();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Ark: Failed to set Gist ID. ${errorMessage}`,
        );
      }
    },
  );

  context.subscriptions.push(
    backupCommand,
    restoreCommand,
    setPatCommand,
    refreshSidebarCommand,
    restoreFromHistoryCommand,
    viewHistoryCommand,
    recoverMissingExtensionsCommand,
  );

  // Setup auto-backup triggers
  setupAutoBackupTriggers(context);

  // Update status bar on activation
  updateStatusBar();

  // Check for new machine
  checkForNewMachine(context);
}

export function deactivate(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
}

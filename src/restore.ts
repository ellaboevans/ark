import * as vscode from "vscode";
import { execSync } from "node:child_process";
import { fetchGist } from "./gist";
import { ExtensionInfo } from "./types/backup-types";

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

      const extensionsToInstall = backup.extensions.filter(
        (ext) => !currentExtensions.has(ext.id.toLowerCase()),
      );

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

      progress.report({ message: "Restoring settings..." });
      await writeSettings(backup.settings);

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

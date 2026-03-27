import * as vscode from "vscode";
import { createBackupData, countNonBuiltInExtensions } from "./backup";
import { createGist, updateGist, verifyPat } from "./gist";
import { runRestore } from "./restore";
import { PAT_SECRET_KEY, GIST_ID_KEY } from "./constants/extension";

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
          }
        } else {
          progress.report({ message: "Creating new backup..." });
          const gistId = await createGist(pat, backup);
          await context.globalState.update(GIST_ID_KEY, gistId);
        }

        progress.report({ message: "Backup complete!" });
      },
    );

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

export function activate(context: vscode.ExtensionContext): void {
  const backupCommand = vscode.commands.registerCommand("ark.backup", () => {
    handleBackup(context);
  });

  const restoreCommand = vscode.commands.registerCommand("ark.restore", () => {
    handleRestore(context);
  });

  const setPatCommand = vscode.commands.registerCommand("ark.setPat", () => {
    handleSetPat(context);
  });

  context.subscriptions.push(backupCommand, restoreCommand, setPatCommand);

  checkForNewMachine(context);
}

export function deactivate(): void {
  // Cleanup if needed
}

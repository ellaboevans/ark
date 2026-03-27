import {
  GIST_FILENAME,
  GITHUB_API_BASE,
  HISTORY_FILENAME,
} from "./constants/gist";
import {
  BackupData,
  BackupHistory,
  BackupHistoryEntry,
} from "./types/backup-types";
import {
  GistCreatePayload,
  GistResponse,
  GistUpdatePayload,
} from "./types/gist-types";

async function makeGitHubRequest<T>(
  url: string,
  pat: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Ark-VSCode-Extension",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function serializeBackupContent(backup: BackupData): string {
  return JSON.stringify(backup, null, 2);
}

function parseBackupContent(content: string): BackupData {
  const jsonContent = content.trimStart().startsWith("//")
    ? content
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//"))
        .join("\n")
        .trim()
    : content;

  return JSON.parse(jsonContent) as BackupData;
}

export async function createGist(
  pat: string,
  backup: BackupData,
): Promise<string> {
  const payload: GistCreatePayload = {
    description: "Ark VS Code backup",
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: serializeBackupContent(backup),
      },
    },
  };

  const response = await makeGitHubRequest<GistResponse>(
    `${GITHUB_API_BASE}/gists`,
    pat,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return response.id;
}

export async function updateGist(
  pat: string,
  gistId: string,
  backup: BackupData,
): Promise<void> {
  const payload: GistUpdatePayload = {
    description: "Ark VS Code backup",
    files: {
      [GIST_FILENAME]: {
        content: serializeBackupContent(backup),
      },
    },
  };

  await makeGitHubRequest<GistResponse>(
    `${GITHUB_API_BASE}/gists/${gistId}`,
    pat,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchGist(
  pat: string,
  gistId: string,
): Promise<BackupData> {
  const response = await makeGitHubRequest<GistResponse>(
    `${GITHUB_API_BASE}/gists/${gistId}`,
    pat,
    {
      method: "GET",
    },
  );

  const file = response.files[GIST_FILENAME];
  if (!file?.content) {
    throw new Error(`Gist does not contain ${GIST_FILENAME}`);
  }

  return parseBackupContent(file.content);
}

export async function verifyPat(
  pat: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Ark-VSCode-Extension",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        valid: false,
        error: `GitHub API returned ${response.status}: ${errorBody}`,
      };
    }

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `Network error: ${message}` };
  }
}

export async function updateBackupHistory(
  pat: string,
  gistId: string,
  newBackup: BackupData,
): Promise<void> {
  // Try to fetch existing history
  let history: BackupHistory = { backups: [] };

  try {
    history = await fetchBackupHistory(pat, gistId);
  } catch {
    // History file doesn't exist yet, start fresh
    history = { backups: [] };
  }

  // Create new history entry
  const entry: BackupHistoryEntry = {
    id: newBackup.id,
    timestamp: newBackup.timestamp,
    extensionCount: newBackup.extensions.length,
    settingsCount: Object.keys(newBackup.settings).length,
    machineInfo: newBackup.machineInfo,
    backup: newBackup,
  };

  // Add new entry to history
  history.backups.push(entry);

  // Update gist with new history
  const payload: GistUpdatePayload = {
    description: "Ark VS Code backup",
    files: {
      [HISTORY_FILENAME]: {
        content: JSON.stringify(history, null, 2),
      },
    },
  };

  await makeGitHubRequest<GistResponse>(
    `${GITHUB_API_BASE}/gists/${gistId}`,
    pat,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchBackupHistory(
  pat: string,
  gistId: string,
): Promise<BackupHistory> {
  const response = await makeGitHubRequest<GistResponse>(
    `${GITHUB_API_BASE}/gists/${gistId}`,
    pat,
    {
      method: "GET",
    },
  );

  const file = response.files[HISTORY_FILENAME];
  if (!file?.content) {
    throw new Error(`Gist does not contain ${HISTORY_FILENAME}`);
  }

  return JSON.parse(file.content) as BackupHistory;
}

export async function getBackupFromHistory(
  pat: string,
  gistId: string,
  backupId: string,
): Promise<BackupData> {
  const history = await fetchBackupHistory(pat, gistId);
  const entry = history.backups.find((b) => b.id === backupId);

  if (!entry) {
    throw new Error(`Backup with id ${backupId} not found in history`);
  }

  return entry.backup;
}

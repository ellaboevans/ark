import { GIST_FILENAME, GITHUB_API_BASE } from "./constants/gist";
import { BackupData } from "./types/backup-types";
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

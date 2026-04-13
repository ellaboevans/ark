import * as os from "node:os";
import { ExtensionPlatformTag } from "./types/backup-types";

const PLATFORM_SPECIFIC_PATTERNS = [
  "ms-vscode-remote.remote-wsl",
  "ms-vscode-remote.remote-containers",
  "ms-vscode-remote.remote-ssh",
  "ms-vscode.remote-server",
  "ms-windows-ai-studio",
  "ms-wsl",
];

export function getCurrentPlatform(): string {
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

export function isPlatformSpecificExtension(extensionId: string): boolean {
  const lowerId = extensionId.toLowerCase();
  return PLATFORM_SPECIFIC_PATTERNS.some(
    (pattern) =>
      lowerId === pattern.toLowerCase() ||
      lowerId.includes("remote-wsl") ||
      lowerId.includes("remote-containers"),
  );
}

export function getExtensionPlatformTag(
  extensionId: string,
): ExtensionPlatformTag {
  return isPlatformSpecificExtension(extensionId)
    ? "platform-specific"
    : "cross-platform";
}

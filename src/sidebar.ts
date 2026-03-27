import * as vscode from "vscode";
import { GIST_ID_KEY, LAST_BACKUP_KEY } from "./constants/extension";
import { countNonBuiltInExtensions } from "./backup";

export class ArkSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ark.sidebarView";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionContext: vscode.ExtensionContext) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this._getHtmlContent();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "backup":
          await vscode.commands.executeCommand("ark.backup");
          this.refresh();
          break;
        case "restore":
          await vscode.commands.executeCommand("ark.restore");
          break;
        case "setToken":
          await vscode.commands.executeCommand("ark.setPat");
          this.refresh();
          break;
      }
    });
  }

  public refresh(): void {
    if (this._view) {
      this._view.webview.html = this._getHtmlContent();
    }
  }

  private _getHtmlContent(): string {
    const lastBackup =
      this._extensionContext.globalState.get<number>(LAST_BACKUP_KEY);
    const gistId = this._extensionContext.globalState.get<string>(GIST_ID_KEY);
    const extensionCount = countNonBuiltInExtensions();

    const lastBackupDisplay = lastBackup
      ? new Date(lastBackup).toLocaleString()
      : "Never";

    const timeSince = lastBackup ? this._formatTimeSince(lastBackup) : null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 16px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .stat-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .stat-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .status-row:last-child {
      border-bottom: none;
    }
    .status-label {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .status-value {
      font-weight: 500;
      font-size: 12px;
    }
    .status-ok {
      color: var(--vscode-charts-green);
    }
    .status-warning {
      color: var(--vscode-charts-yellow);
    }
    .status-none {
      color: var(--vscode-descriptionForeground);
    }
    button {
      width: 100%;
      padding: 10px 16px;
      margin-bottom: 8px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-link {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      padding: 8px 0;
      text-align: left;
    }
    .time-ago {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-title">Current Status</div>
    <div class="stat-card">
      <div class="stat-value">${extensionCount}</div>
      <div class="stat-label">Extensions installed</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Last Backup</div>
    <div class="stat-card">
      <div class="status-row">
        <span class="status-label">Status</span>
        <span class="status-value ${gistId ? "status-ok" : "status-none"}">
          ${gistId ? "Backed up" : "No backup"}
        </span>
      </div>
      <div class="status-row">
        <span class="status-label">Time</span>
        <span class="status-value">${lastBackupDisplay}</span>
      </div>
      ${timeSince ? `<div class="time-ago">${timeSince}</div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Actions</div>
    <button class="btn-primary" onclick="backup()">
      Backup Now
    </button>
    <button class="btn-secondary" onclick="restore()" ${gistId ? "" : "disabled"}>
      Restore from Backup
    </button>
    <button class="btn-link" onclick="setToken()">
      ${gistId ? "Update" : "Set"} GitHub Token
    </button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    function backup() {
      vscode.postMessage({ command: 'backup' });
    }
    
    function restore() {
      vscode.postMessage({ command: 'restore' });
    }
    
    function setToken() {
      vscode.postMessage({ command: 'setToken' });
    }
  </script>
</body>
</html>`;
  }

  private _formatTimeSince(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return "Just now";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    } else {
      return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    }
  }
}

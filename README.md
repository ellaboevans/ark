# Ark — Disaster recovery for developers

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.80.0%2B-blue)](https://code.visualstudio.com/)

> **Back before you knew it was gone.**
>
> Ark is a disaster recovery tool for VS Code. Backup your extensions and settings to a private GitHub Gist so you can recover your complete development environment in seconds—after a wipe, reset, or move to a new machine.

## Why Ark?

Losing your VS Code setup is frustrating. You don't just lose extensions; you lose your entire workflow, key bindings, language configurations, and years of tweaks. Hours pass before everything feels right again.

Ark puts you back in control. Your backup is always there, private, and just one click away.

## Features

**Smart Backup**

- Automatically backs up all installed extensions and your settings
- Triggers on extension changes or settings updates (with smart 30-second debounce to avoid thrashing)
- Silent auto-backups keep your setup fresh

**Security First**

- GitHub Personal Access Token stored securely using VS Code's SecretStorage API
- Backups stored as **private** GitHub Gists (no data leaves GitHub)
- Sensitive settings automatically stripped (tokens, passwords, API keys, etc.)

  **One-Click Restore**

- Reinstalls all extensions and restores settings on new machines
- Automatic detection of fresh/wiped machines with prompt to restore
- Cross-platform support with platform-specific extension warnings (WSL, Remote, etc.)
- Settings conflict resolution with preview before overwrite

**Beautiful Sidebar**

- View backup status at a glance
- See extension counts and last backup time
- One-click actions for backup, restore, and token management

## Requirements

- **VS Code** 1.80.0 or higher
- **GitHub Account** with a Personal Access Token (PAT) with `gist` scope

## Quick Start

### 1. Create GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Name it something like `"Ark - VS Code Backup"`
4. Select **`gist`** scope only
5. Click **"Generate token"** and **copy it** (you won't see it again)

### 2. Configure Ark

1. Open Command Palette: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Run: **`Ark: Set GitHub token`**
3. Paste your token and press Enter

### 3. Create Your First Backup

1. Open Command Palette
2. Run: **`Ark: Backup now`**
3. Done! Your extensions and settings are now backed up

## Commands

| Command                      | Keyboard Shortcut | Description                                          |
| ---------------------------- | ----------------- | ---------------------------------------------------- |
| **Ark: Backup now**          | —                 | Create or update your backup immediately             |
| **Ark: Restore from backup** | —                 | Restore all extensions and settings from your backup |
| **Ark: Set GitHub token**    | —                 | Set or update your GitHub Personal Access Token      |

## How It Works

### Backup

When you run a backup, Ark:

1. Reads all installed non-built-in extensions
2. Reads your VS Code settings
3. Removes sensitive data (tokens, passwords, API keys)
4. Creates or updates a private GitHub Gist with the backup

### Restore

When you restore, Ark:

1. Fetches your backup from GitHub
2. Detects any platform differences (Mac/Windows/Linux)
3. Warns about platform-specific extensions (WSL, Remote)
4. Shows a preview of settings changes
5. Requires confirmation before applying changes
6. Installs missing extensions
7. Applies settings and prompts you to reload

### Auto-Detection

Fresh or wiped machine detected? Ark automatically prompts you to restore if:

- Fewer than 3 non-built-in extensions are installed
- A backup exists in your GitHub account

## Security & Privacy

**Your data is yours:**

- Tokens are stored securely using VS Code's built-in SecretStorage
- Backups are **always private** GitHub Gists
- Sensitive settings are automatically removed

**Automatically stripped settings:**

- `token`, `key`, `secret`, `password`
- `apikey`, `api_key`, `credential`
- `auth`, `bearer`, `jwt`

## What Gets Backed Up

```json
{
  "_meta": {
    "generatedBy": "Ark",
    "builtBy": "Evans Elabo",
    "tagLine": "Back before you knew it was gone."
  },
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-27T10:00:00.000Z",
  "extensions": [
    { "id": "esbenp.prettier-vscode", "version": "10.1.0" },
    { "id": "dbaeumer.vscode-eslint", "version": "2.4.4" }
  ],
  "settings": {
    "editor": { "fontSize": 14, "formatOnSave": true },
    "workbench": { "colorTheme": "One Dark Pro" }
  },
  "machineInfo": {
    "os": "macOS",
    "vscodeVersion": "1.87.0"
  }
}
```

## Keyboard Shortcuts

You can bind your own shortcuts to Ark commands in VS Code:

1. Open Command Palette: `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Run: `Preferences: Open Keyboard Shortcuts (JSON)`
3. Add:
   ```json
   {
     "key": "cmd+shift+b",
     "command": "ark.backup"
   },
   {
     "key": "cmd+shift+r",
     "command": "ark.restore"
   }
   ```

## Troubleshooting

**"Invalid GitHub token"**

- Ensure your token has the `gist` scope
- Check that you copied the entire token (no extra spaces)
- Generate a new token if needed

**"Restore failed" / "Gist not found"**

- Verify your GitHub token is still valid
- Check that your Gist wasn't deleted on GitHub
- Try creating a new backup to establish a fresh Gist ID

**Extensions won't install**

- Some extensions require VS Code restart to appear
- Check extension-specific permissions (Remote, WSL, etc.)
- Try installing the extension manually to troubleshoot

## Contributing

Found a bug? Have a feature idea?

- [Report an issue](https://github.com/ellaboevans/ark/issues)
- [View the source](https://github.com/ellaboevans/ark)

## License

MIT © [Evans Elabo](https://github.com/ellaboevans)

---

**Ark** — Disaster recovery for developers. Built with ❤️ for the times when everything goes wrong.

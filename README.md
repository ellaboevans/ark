# Ark

Backup and restore your VS Code extensions and settings to a private GitHub Gist.

## Features

- **Backup**: Saves all your installed extensions and sanitized settings to a private GitHub Gist
- **Restore**: Reinstalls extensions and restores settings from your backup on a new machine
- **Secure**: GitHub Personal Access Token is stored securely using VS Code's SecretStorage API
- **Privacy**: Automatically strips sensitive settings (tokens, keys, passwords, etc.) from backups

## Requirements

- VS Code 1.80.0 or higher
- A GitHub Personal Access Token with `gist` scope

## Getting Started

1. Generate a GitHub Personal Access Token:
   - Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Give it a name (e.g., "Ark")
   - Select the `gist` scope
   - Click "Generate token" and copy it

2. Set your token in VS Code:
   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Run `Ark: Set GitHub token`
   - Paste your token

3. Create your first backup:
   - Open Command Palette
   - Run `Ark: Backup now`

## Commands

| Command                           | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `Ark: Backup now`          | Create or update your backup                     |
| `Ark: Restore from backup` | Restore extensions and settings from your backup |
| `Ark: Set GitHub token`    | Set or update your GitHub Personal Access Token  |

## Automatic Restore Prompt

When Ark detects fewer than 3 non-built-in extensions installed (indicating a fresh VS Code installation), it will automatically prompt you to restore your previous setup if a backup exists.

## Privacy & Security

- Your GitHub token is stored securely using VS Code's SecretStorage API (never in settings.json)
- Backups are stored as **private** GitHub Gists
- Settings containing sensitive keys are automatically stripped:
  - token, key, secret, password
  - apikey, api_key, credential
  - auth, bearer, jwt

## Backup Format

```json
{
  "id": "uuid-v4",
  "timestamp": "2026-03-27T10:00:00Z",
  "extensions": [{ "id": "esbenp.prettier-vscode", "version": "10.1.0" }],
  "settings": { "editor.fontSize": 14 },
  "machineInfo": {
    "os": "macOS",
    "vscodeVersion": "1.87.0"
  }
}
```

## License

MIT

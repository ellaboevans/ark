# Changelog

All notable changes to the Ark extension will be documented in this file.

## [1.3.0] - 2026-04-13

### Added

- **Cross-platform extension tagging** in backups so each saved extension is explicitly marked as `cross-platform` or `platform-specific`
- **Missing extension recovery** flow that scans backup history and lets users reinstall only extensions that disappeared unexpectedly
- Platform tag details in restore and recovery pickers so users can make safer choices when restoring across macOS, Windows, and Linux

### Improved

- Restore now uses stored extension tags, while remaining backward-compatible with older backups that do not have tags yet
- TypeScript configuration updated for modern Node 16 module resolution and explicit VS Code/Node ambient types
- Cross-OS restore flow is more intentional, with clearer warnings before reinstalling extensions tagged for another platform

## [1.2.1] - 2026-03-27

### Added

- Screenshots and demo GIF in README for better marketplace visibility
- Professional media assets showcasing sidebar, selective restore, and features in action

## [1.2.0] - 2026-03-27

### Added

- **Visual Backup Feedback**: Real-time status updates when backups occur
  - Status bar shows spinning animation during backup operations
  - Toast notification appears on backup completion with extension/settings count
  - Applies to both manual and auto-backups
  - Clear visual distinction between pending and in-progress states

### Improved

- Better user confidence that auto-backup is working silently
- Immediate visual feedback on backup completion
- Enhanced UX with status bar icon animations

## [1.1.0] - 2026-03-27

### Added

- **Selective Restore**: Users can now choose which extensions and settings categories to restore during the restore process, instead of restoring everything at once
  - Interactive checkbox dialogs for extensions and settings
  - All items checked by default for convenience
  - Uncheck specific items to skip them during restore
- **Backup History & Versioning**: Full backup version history stored in GitHub Gist
  - Every backup is automatically saved to history
  - New command: `Ark: View backup history` to browse all previous backups
  - Restore from any point in time with a single click
  - Each backup shows: date, extension count, settings count, and machine OS info
- New command: `ark.viewHistory` - View and restore from backup history

### Improved

- Better restore flow with selective restore options
- History automatically maintained - no manual management needed
- All backups preserved indefinitely for disaster recovery scenarios

### Fixed

- N/A

## [1.0.0] - 2026-03-27

### Initial Release

- Auto-backup every 30 seconds with GitHub Gist storage
- Secure token storage using VS Code's SecretStorage
- One-click restore on new machines
- Beautiful sidebar UI with backup status
- Platform-aware (detects WSL, Remote extensions)
- Settings diff and conflict resolution with user confirmation
- Smart extension filtering for platform compatibility
- Auto-detect new machines and prompt restore
- Status bar item showing last backup time

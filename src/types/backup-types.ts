export interface ExtensionInfo {
  id: string;
  version: string;
}

export interface MachineInfo {
  os: string;
  vscodeVersion: string;
}

export interface BackupMetadata {
  generatedBy: string;
  builtBy: string;
  tagLine: string;
}

export interface BackupData {
  _meta: BackupMetadata;
  id: string;
  timestamp: string;
  extensions: ExtensionInfo[];
  settings: Record<string, unknown>;
  machineInfo: MachineInfo;
}

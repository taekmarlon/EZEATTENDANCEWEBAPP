import { QueryPreset, School } from '../types';

export interface WorkspaceBackupPayload {
  app: 'EZ Center Portal';
  version: number;
  exportedAt: string;
  schools: School[];
  presets: QueryPreset[];
}

export function createWorkspaceBackupJson(schools: School[], presets: QueryPreset[]): string {
  const payload: WorkspaceBackupPayload = {
    app: 'EZ Center Portal',
    version: 1,
    exportedAt: new Date().toISOString(),
    schools,
    presets,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseWorkspaceBackupJson(raw: string): {
  schools: School[];
  presets: QueryPreset[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file format.');
  }

  const record = parsed as Partial<WorkspaceBackupPayload>;
  if (record.app !== 'EZ Center Portal' || !Array.isArray(record.schools)) {
    throw new Error('This file is not an EZ Center Portal backup.');
  }

  return {
    schools: record.schools,
    presets: Array.isArray(record.presets) ? record.presets : [],
  };
}

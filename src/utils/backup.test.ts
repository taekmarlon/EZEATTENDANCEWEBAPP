import { describe, it, expect } from 'vitest';
import { createWorkspaceBackupJson, parseWorkspaceBackupJson } from './backup';
import { School, QueryPreset } from '../types';

describe('workspace backup utilities', () => {
  it('round-trips schools (including logos) and query presets', () => {
    const schools: School[] = [
      {
        id: 'sch-1',
        name: 'Eastwood School',
        logo: 'data:image/jpeg;base64,eastwoodlogo',
        specializations: [],
      },
    ];
    const presets: QueryPreset[] = [
      {
        id: 'pre-1',
        name: 'Honors',
        dataset: 'students',
        schoolId: 'all',
        specId: 'all',
        dateStart: '',
        dateEnd: '',
        rules: [],
        sortField: 'studentName',
        sortDir: 'asc',
      },
    ];

    const raw = createWorkspaceBackupJson(schools, presets);
    const parsed = parseWorkspaceBackupJson(raw);

    expect(parsed.schools).toHaveLength(1);
    expect(parsed.schools[0].name).toBe('Eastwood School');
    expect(parsed.schools[0].logo).toBe('data:image/jpeg;base64,eastwoodlogo');
    expect(parsed.presets).toHaveLength(1);
    expect(parsed.presets[0].name).toBe('Honors');
  });

  it('rejects malformed or non-EZ-Center backup payloads', () => {
    expect(() => parseWorkspaceBackupJson('not json')).toThrow();
    expect(() => parseWorkspaceBackupJson(JSON.stringify({ hello: 'world' }))).toThrow();
  });
});

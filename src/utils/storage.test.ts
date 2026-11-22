import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearPersistedData,
  loadPersistedSchools,
  savePersistedSchools,
  loadPersistedPresets,
  savePersistedPresets,
} from './storage';
import { School, QueryPreset } from '../types';

describe('IndexedDB storage & migration', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearPersistedData();
  });

  it('migrates legacy localStorage schools into IndexedDB on initial load', async () => {
    const legacySchools: School[] = [
      {
        id: 'sch-1',
        name: 'Legacy High',
        specializations: [],
      },
    ];
    localStorage.setItem('ez-center-portal-data', JSON.stringify(legacySchools));

    const loaded = await loadPersistedSchools();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Legacy High');
    // Subsequent loads read from IndexedDB even after localStorage is cleared
    localStorage.removeItem('ez-center-portal-data');
    const secondLoad = await loadPersistedSchools();
    expect(secondLoad).toHaveLength(1);
    expect(secondLoad[0].id).toBe('sch-1');
  });

  it('persists large school datasets with logos and presets in IndexedDB', async () => {
    const bigLogo = 'data:image/jpeg;base64,' + 'A'.repeat(40000);
    const schools: School[] = [
      { id: 's1', name: 'Alpha School', logo: bigLogo, specializations: [] },
    ];
    const presets: QueryPreset[] = [
      {
        id: 'p1',
        name: 'Custom',
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

    await savePersistedSchools(schools);
    await savePersistedPresets(presets);

    const loadedSchools = await loadPersistedSchools();
    const loadedPresets = await loadPersistedPresets();

    expect(loadedSchools[0].logo).toBe(bigLogo);
    expect(loadedPresets[0].name).toBe('Custom');
  });
});

import { describe, it, expect } from 'vitest';
import { buildDatasetRows, evaluateRule, filterAndSortQueryRows } from './query';
import { School } from '../types';

const sampleSchools: School[] = [
  {
    id: 'sch-1',
    name: 'Lincoln High',
    specializations: [
      {
        id: 'sp-1',
        name: 'Coding',
        teacherName: 'Mr. Reyes',
        rubricCriteria: [{ id: 'c1', name: 'Logic' }],
        students: [
          {
            id: 'st-1',
            name: 'Ana Cruz',
            rollNo: '1001',
            gradeLevel: 'Grade 10',
            gender: 'Female',
            contactNo: '0917',
            teacherName: 'Mr. Reyes',
            attendance: { '2026-11-18': 'Present', '2026-11-19': 'Absent' },
            evaluations: [
              { id: 'ev-1', date: '2026-11-19', scores: { c1: 5, 'orphaned-id': 1 } },
            ],
          },
        ],
      },
    ],
  },
];

describe('query engine utilities', () => {
  it('evaluates text, numeric, and emptiness operators accurately', () => {
    expect(evaluateRule('Grade 10', { id: '1', field: 'gradeLevel', operator: 'contains', value: '10' })).toBe(true);
    expect(evaluateRule('Absent', { id: '2', field: 'status', operator: 'equals', value: 'absent' })).toBe(true);
    expect(evaluateRule(80, { id: '3', field: 'attendancePct', operator: 'gte', value: '80' })).toBe(true);
    expect(evaluateRule(79, { id: '4', field: 'attendancePct', operator: 'lte', value: '79' })).toBe(true);
    expect(evaluateRule('', { id: '5', field: 'contactNo', operator: 'is_empty', value: '' })).toBe(true);
    expect(evaluateRule('0917', { id: '6', field: 'contactNo', operator: 'not_empty', value: '' })).toBe(true);
  });

  it('builds student summary rows ignoring orphaned criterion scores', () => {
    const rows = buildDatasetRows(sampleSchools, {
      dataset: 'students',
      schoolId: 'all',
      specId: 'all',
      dateStart: '',
      dateEnd: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].values.attendancePct).toBe(50);
    expect(rows[0].values.rubricAvg).toBe(5);
  });

  it('excludes orphaned criterion IDs from evaluations dataset and sorts cleanly', () => {
    const rows = buildDatasetRows(sampleSchools, {
      dataset: 'evaluations',
      schoolId: 'all',
      specId: 'all',
      dateStart: '',
      dateEnd: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].values.criterionName).toBe('Logic');
    expect(rows[0].values.score).toBe(5);

    const sorted = filterAndSortQueryRows(rows, [], 'score', 'desc');
    expect(sorted).toHaveLength(1);
  });
});

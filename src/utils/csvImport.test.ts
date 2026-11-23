import { describe, it, expect } from 'vitest';
import { parseCsvGrid, parseStudentsCsv } from './csvImport';

describe('csvImport', () => {
  it('parses quoted cells and embedded commas properly', () => {
    const grid = parseCsvGrid(
      '\uFEFFStudent Name,Grade Level,Contact No.\r\n"Santos, Maria",Grade 8,"0917-555-0192"\r\n'
    );
    expect(grid).toEqual([
      ['Student Name', 'Grade Level', 'Contact No.'],
      ['Santos, Maria', 'Grade 8', '0917-555-0192'],
    ]);
  });

  it('imports students cleanly without requiring a Roll / ID No. column', () => {
    const csv = [
      'Student Name,Grade Level,Gender,Contact No.,Section',
      'Ana Reyes,Grade 7,Female,09171234567,Einstein',
      'Ben Cruz,Grade 9,Male,,Newton',
      ',Grade 10,Male,,',
    ].join('\n');

    const result = parseStudentsCsv(
      csv,
      [{ id: 'section', label: 'Section' }],
      'Coach Marlon'
    );

    expect(result.error).toBeUndefined();
    expect(result.skippedRows).toBe(1);
    expect(result.students).toHaveLength(2);
    expect(result.students[0]).toEqual({
      name: 'Ana Reyes',
      rollNo: '',
      gradeLevel: 'Grade 7',
      gender: 'Female',
      contactNo: '09171234567',
      teacherName: 'Coach Marlon',
      customFields: { section: 'Einstein' },
    });
    expect(result.students[1].rollNo).toBe('');
  });

  it('returns helpful error when Student Name column is absent', () => {
    const res = parseStudentsCsv('Roll No,Grade\n001,Grade 5');
    expect(res.students).toHaveLength(0);
    expect(res.error).toMatch(/Student Name/i);
  });
});

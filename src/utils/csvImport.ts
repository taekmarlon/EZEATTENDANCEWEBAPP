import { CustomStudentField, StudentProfileInput } from '../types';

export interface CsvParseResult {
  students: StudentProfileInput[];
  skippedRows: number;
  error?: string;
}

/**
 * Parses RFC-4180 CSV text into a 2D array of trimmed strings.
 * Supports UTF-8 BOM, CRLF/LF newlines, quoted cells, embedded commas/newlines, and escaped quotes ("").
 */
export function parseCsvGrid(raw: string): string[][] {
  const clean = raw.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HEADER_ALIASES: Record<string, 'name' | 'rollNo' | 'gradeLevel' | 'gender' | 'contactNo' | 'teacherName'> = {
  'student name': 'name',
  name: 'name',
  'full name': 'name',
  student: 'name',
  'roll card no': 'rollNo',
  'roll id no': 'rollNo',
  'roll id': 'rollNo',
  'roll no': 'rollNo',
  'roll number': 'rollNo',
  roll: 'rollNo',
  'id no': 'rollNo',
  'id number': 'rollNo',
  'student id': 'rollNo',
  id: 'rollNo',
  'grade level': 'gradeLevel',
  grade: 'gradeLevel',
  level: 'gradeLevel',
  'year level': 'gradeLevel',
  year: 'gradeLevel',
  gender: 'gender',
  sex: 'gender',
  'contact no': 'contactNo',
  contact: 'contactNo',
  'contact number': 'contactNo',
  phone: 'contactNo',
  'phone no': 'contactNo',
  mobile: 'contactNo',
  'teacher name': 'teacherName',
  teacher: 'teacherName',
  'assigned teacher': 'teacherName',
};

/**
 * Parses CSV text into StudentProfileInput rows.
 * Only "Student Name" is required; "Roll / ID No." and all other metadata columns are optional.
 */
export function parseStudentsCsv(
  raw: string,
  customFields: CustomStudentField[] = [],
  defaultTeacherName = ''
): CsvParseResult {
  const grid = parseCsvGrid(raw);
  if (grid.length < 2) {
    return {
      students: [],
      skippedRows: 0,
      error: 'CSV file must contain a header row and at least one student row.',
    };
  }

  const headers = grid[0];
  const standardIndex = new Map<
    'name' | 'rollNo' | 'gradeLevel' | 'gender' | 'contactNo' | 'teacherName',
    number
  >();
  const customIndices: { fieldId: string; index: number }[] = [];

  headers.forEach((rawHeader, idx) => {
    const norm = normalizeHeader(rawHeader);
    const stdKey = HEADER_ALIASES[norm];
    if (stdKey && !standardIndex.has(stdKey)) {
      standardIndex.set(stdKey, idx);
      return;
    }
    const matchedCustom = customFields.find(
      (f) => normalizeHeader(f.label) === norm || normalizeHeader(f.id) === norm
    );
    if (matchedCustom) {
      customIndices.push({ fieldId: matchedCustom.id, index: idx });
    }
  });

  if (!standardIndex.has('name')) {
    return {
      students: [],
      skippedRows: 0,
      error: 'Missing required "Student Name" column header in CSV.',
    };
  }

  const students: StudentProfileInput[] = [];
  let skippedRows = 0;

  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r];
    const getCol = (key: 'name' | 'rollNo' | 'gradeLevel' | 'gender' | 'contactNo' | 'teacherName') => {
      const idx = standardIndex.get(key);
      return idx !== undefined ? (cols[idx] || '').trim() : '';
    };

    const name = getCol('name');
    if (!name) {
      skippedRows++;
      continue;
    }

    const customValues: Record<string, string> = {};
    for (const { fieldId, index } of customIndices) {
      const val = (cols[index] || '').trim();
      if (val) customValues[fieldId] = val;
    }

    students.push({
      name,
      rollNo: getCol('rollNo'),
      gradeLevel: getCol('gradeLevel'),
      gender: getCol('gender'),
      contactNo: getCol('contactNo'),
      teacherName: getCol('teacherName') || defaultTeacherName.trim(),
      customFields: Object.keys(customValues).length > 0 ? customValues : undefined,
    });
  }

  if (students.length === 0) {
    return {
      students: [],
      skippedRows,
      error: 'No valid student rows with a Student Name were found in the CSV.',
    };
  }

  return { students, skippedRows };
}

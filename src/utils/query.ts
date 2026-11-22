import { format, subDays } from 'date-fns';
import {
  QueryDataset,
  QueryOperator,
  QueryPreset,
  QueryRule,
  School,
  Specialization,
  Student,
} from '../types';

export interface FieldMeta {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
}

export const DATASET_FIELDS: Record<QueryDataset, FieldMeta[]> = {
  students: [
    { key: 'studentName', label: 'Student Name', type: 'text' },
    { key: 'rollNo', label: 'Roll / ID No.', type: 'text' },
    { key: 'gradeLevel', label: 'Grade Level', type: 'text' },
    { key: 'gender', label: 'Gender', type: 'text' },
    { key: 'contactNo', label: 'Contact No.', type: 'text' },
    { key: 'teacherName', label: 'Teacher Name', type: 'text' },
    { key: 'schoolName', label: 'School', type: 'text' },
    { key: 'specName', label: 'Specialization', type: 'text' },
    { key: 'attendancePct', label: 'Attendance %', type: 'number' },
    { key: 'presentDays', label: 'Present Days', type: 'number' },
    { key: 'absentDays', label: 'Absent Days', type: 'number' },
    { key: 'rubricAvg', label: 'Rubric Avg (1–5)', type: 'number' },
    { key: 'evalCount', label: 'Evaluation Count', type: 'number' },
  ],
  attendance: [
    { key: 'studentName', label: 'Student Name', type: 'text' },
    { key: 'rollNo', label: 'Roll / ID No.', type: 'text' },
    { key: 'gradeLevel', label: 'Grade Level', type: 'text' },
    { key: 'gender', label: 'Gender', type: 'text' },
    { key: 'contactNo', label: 'Contact No.', type: 'text' },
    { key: 'teacherName', label: 'Teacher Name', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'status', label: 'Status (Present / Absent)', type: 'text' },
    { key: 'schoolName', label: 'School', type: 'text' },
    { key: 'specName', label: 'Specialization', type: 'text' },
  ],
  evaluations: [
    { key: 'studentName', label: 'Student Name', type: 'text' },
    { key: 'rollNo', label: 'Roll / ID No.', type: 'text' },
    { key: 'gradeLevel', label: 'Grade Level', type: 'text' },
    { key: 'gender', label: 'Gender', type: 'text' },
    { key: 'teacherName', label: 'Teacher Name', type: 'text' },
    { key: 'date', label: 'Evaluation Date', type: 'date' },
    { key: 'criterionName', label: 'Rubric Criterion', type: 'text' },
    { key: 'score', label: 'Score (1–5)', type: 'number' },
    { key: 'schoolName', label: 'School', type: 'text' },
    { key: 'specName', label: 'Specialization', type: 'text' },
  ],
};

export const OPERATORS: { value: QueryOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'not_empty', label: 'is not empty' },
];

export function getBuiltInPresets(): QueryPreset[] {
  const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  return [
    {
      id: 'builtin-low-att',
      name: 'Attendance Below 80%',
      isBuiltIn: true,
      dataset: 'students',
      schoolId: 'all',
      specId: 'all',
      dateStart: '',
      dateEnd: '',
      rules: [{ id: 'r1', field: 'attendancePct', operator: 'lte', value: '79' }],
      sortField: 'attendancePct',
      sortDir: 'asc',
    },
    {
      id: 'builtin-top-rubric',
      name: 'Top Performers (Rubric ≥ 4.0)',
      isBuiltIn: true,
      dataset: 'students',
      schoolId: 'all',
      specId: 'all',
      dateStart: '',
      dateEnd: '',
      rules: [{ id: 'r2', field: 'rubricAvg', operator: 'gte', value: '4' }],
      sortField: 'rubricAvg',
      sortDir: 'desc',
    },
    {
      id: 'builtin-recent-absences',
      name: 'Absences (Last 7 Days)',
      isBuiltIn: true,
      dataset: 'attendance',
      schoolId: 'all',
      specId: 'all',
      dateStart: sevenDaysAgo,
      dateEnd: '',
      rules: [{ id: 'r3', field: 'status', operator: 'equals', value: 'Absent' }],
      sortField: 'date',
      sortDir: 'desc',
    },
    {
      id: 'builtin-needs-eval',
      name: 'Needs Evaluation',
      isBuiltIn: true,
      dataset: 'students',
      schoolId: 'all',
      specId: 'all',
      dateStart: '',
      dateEnd: '',
      rules: [{ id: 'r4', field: 'evalCount', operator: 'equals', value: '0' }],
      sortField: 'studentName',
      sortDir: 'asc',
    },
  ];
}

export interface QueryRow {
  rowKey: string;
  school: School;
  spec: Specialization;
  student: Student;
  values: Record<string, string | number | null>;
}

export function evaluateRule(rawVal: string | number | null | undefined, rule: QueryRule): boolean {
  const isEmpty = rawVal === null || rawVal === undefined || String(rawVal).trim() === '';
  if (rule.operator === 'is_empty') return isEmpty;
  if (rule.operator === 'not_empty') return !isEmpty;
  if (isEmpty) return false;

  const strVal = String(rawVal).toLowerCase();
  const targetStr = rule.value.trim().toLowerCase();

  if (rule.operator === 'contains') return strVal.includes(targetStr);
  if (rule.operator === 'equals') return strVal === targetStr;
  if (rule.operator === 'not_equals') return strVal !== targetStr;

  const numVal = Number(rawVal);
  const targetNum = Number(rule.value);
  if (!Number.isNaN(numVal) && !Number.isNaN(targetNum)) {
    if (rule.operator === 'gte') return numVal >= targetNum;
    if (rule.operator === 'lte') return numVal <= targetNum;
  } else {
    if (rule.operator === 'gte') return strVal >= targetStr;
    if (rule.operator === 'lte') return strVal <= targetStr;
  }
  return true;
}

export interface BuildQueryOptions {
  dataset: QueryDataset;
  schoolId: string;
  specId: string;
  dateStart: string;
  dateEnd: string;
}

export function buildDatasetRows(schools: School[], opts: BuildQueryOptions): QueryRow[] {
  const { dataset, schoolId, specId, dateStart, dateEnd } = opts;
  const out: QueryRow[] = [];

  for (const school of schools) {
    if (schoolId !== 'all' && school.id !== schoolId) continue;
    for (const spec of school.specializations) {
      if (specId !== 'all' && spec.id !== specId) continue;
      const criteriaMap = new Map<string, string>(
        spec.rubricCriteria.map((c) => [c.id, c.name])
      );

      for (const student of spec.students) {
        const teacherName = student.teacherName || spec.teacherName || '';

        if (dataset === 'students') {
          let presentDays = 0;
          let absentDays = 0;
          Object.entries(student.attendance || {}).forEach(([date, status]) => {
            if (dateStart && date < dateStart) return;
            if (dateEnd && date > dateEnd) return;
            if (status === 'Present') presentDays++;
            if (status === 'Absent') absentDays++;
          });
          const totalDays = presentDays + absentDays;
          const attendancePct =
            totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null;

          const evalScores: number[] = [];
          let evalCount = 0;
          (student.evaluations || []).forEach((ev) => {
            if (dateStart && ev.date < dateStart) return;
            if (dateEnd && ev.date > dateEnd) return;
            let hasValidScore = false;
            Object.entries(ev.scores || {}).forEach(([cId, sc]) => {
              if (!criteriaMap.has(cId)) return;
              if (typeof sc === 'number' && sc > 0) {
                evalScores.push(sc);
                hasValidScore = true;
              }
            });
            if (hasValidScore) evalCount++;
          });
          const rubricAvg =
            evalScores.length > 0
              ? Number((evalScores.reduce((a, b) => a + b, 0) / evalScores.length).toFixed(2))
              : null;

          out.push({
            rowKey: `${school.id}-${spec.id}-${student.id}`,
            school,
            spec,
            student,
            values: {
              studentName: student.name,
              rollNo: student.rollNo,
              gradeLevel: student.gradeLevel || '',
              gender: student.gender || '',
              contactNo: student.contactNo || '',
              teacherName,
              schoolName: school.name,
              specName: spec.name,
              attendancePct,
              presentDays,
              absentDays,
              rubricAvg,
              evalCount,
            },
          });
        } else if (dataset === 'attendance') {
          Object.entries(student.attendance || {}).forEach(([date, status]) => {
            if (dateStart && date < dateStart) return;
            if (dateEnd && date > dateEnd) return;
            out.push({
              rowKey: `${student.id}-att-${date}`,
              school,
              spec,
              student,
              values: {
                studentName: student.name,
                rollNo: student.rollNo,
                gradeLevel: student.gradeLevel || '',
                gender: student.gender || '',
                contactNo: student.contactNo || '',
                teacherName,
                date,
                status: String(status),
                schoolName: school.name,
                specName: spec.name,
              },
            });
          });
        } else {
          (student.evaluations || []).forEach((ev) => {
            if (dateStart && ev.date < dateStart) return;
            if (dateEnd && ev.date > dateEnd) return;
            Object.entries(ev.scores || {}).forEach(([cId, score]) => {
              const criterionName = criteriaMap.get(cId);
              if (!criterionName) return;
              out.push({
                rowKey: `${student.id}-eval-${ev.id}-${cId}`,
                school,
                spec,
                student,
                values: {
                  studentName: student.name,
                  rollNo: student.rollNo,
                  gradeLevel: student.gradeLevel || '',
                  gender: student.gender || '',
                  teacherName,
                  date: ev.date,
                  criterionName,
                  score: Number(score),
                  schoolName: school.name,
                  specName: spec.name,
                },
              });
            });
          });
        }
      }
    }
  }
  return out;
}

export function filterAndSortQueryRows(
  rows: QueryRow[],
  rules: QueryRule[],
  sortField: string,
  sortDir: 'asc' | 'desc'
): QueryRow[] {
  const filtered = rows.filter((row) =>
    rules.every((rule) => {
      if (
        rule.operator !== 'is_empty' &&
        rule.operator !== 'not_empty' &&
        rule.value.trim() === ''
      ) {
        return true;
      }
      return evaluateRule(row.values[rule.field], rule);
    })
  );

  const mult = sortDir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const av = a.values[sortField];
    const bv = b.values[sortField];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

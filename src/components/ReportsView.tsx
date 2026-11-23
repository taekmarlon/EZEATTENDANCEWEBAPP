import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { Download, Printer, ArrowUpDown, FileText, BarChart3 } from 'lucide-react';
import { School, Specialization, Student } from '../types';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { downloadCSV, triggerPrintReport } from '../utils/export';
import { PortraitAvatar } from './Avatar';
import StudentScorecardModal from './StudentScorecardModal';

interface EnrichedStudentRow {
  school: School;
  spec: Specialization;
  student: Student;
  teacherName: string;
  teacherPhoto?: string;
  presentDays: number;
  absentDays: number;
  totalDays: number;
  attendancePct: number | null;
  rubricAvg: number | null;
  evalCount: number;
}

export default function ReportsView({
  defaultSchoolId,
  defaultSpecId,
}: {
  defaultSchoolId: string | null;
  defaultSpecId: string | null;
}) {
  const { schools, systemSettings, permissions } = useStore();
  const { showToast } = useToast();

  const [schoolFilter, setSchoolFilter] = useState<string>(defaultSchoolId || 'all');
  const [specFilter, setSpecFilter] = useState<string>(defaultSpecId || 'all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('all');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'grade' | 'attendance' | 'rubric'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [selectedScorecard, setSelectedScorecard] = useState<EnrichedStudentRow | null>(null);

  const selectedSchoolObj = useMemo(
    () => schools.find((s) => s.id === schoolFilter) || null,
    [schools, schoolFilter]
  );

  const availableSpecs = useMemo(() => {
    if (selectedSchoolObj) return selectedSchoolObj.specializations;
    return schools.flatMap((s) => s.specializations);
  }, [schools, selectedSchoolObj]);

  // Flatten all students in scope before demographic/teacher filters so dropdown options stay helpful
  const baseRows = useMemo<EnrichedStudentRow[]>(() => {
    const list: EnrichedStudentRow[] = [];
    for (const school of schools) {
      if (schoolFilter !== 'all' && school.id !== schoolFilter) continue;
      for (const spec of school.specializations) {
        if (specFilter !== 'all' && spec.id !== specFilter) continue;
        for (const student of spec.students) {
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

          const activeCriteriaIds = new Set(spec.rubricCriteria.map((c) => c.id));
          const scores: number[] = [];
          let evalCount = 0;
          (student.evaluations || []).forEach((ev) => {
            if (dateStart && ev.date < dateStart) return;
            if (dateEnd && ev.date > dateEnd) return;
            let hasValidScore = false;
            Object.entries(ev.scores || {}).forEach(([cId, sc]) => {
              if (!activeCriteriaIds.has(cId)) return;
              if (typeof sc === 'number' && sc > 0) {
                scores.push(sc);
                hasValidScore = true;
              }
            });
            if (hasValidScore) evalCount++;
          });
          const rubricAvg =
            scores.length > 0
              ? scores.reduce((a, b) => a + b, 0) / scores.length
              : null;

          list.push({
            school,
            spec,
            student,
            teacherName: student.teacherName || spec.teacherName || '',
            teacherPhoto: student.teacherPhoto || spec.teacherPhoto,
            presentDays,
            absentDays,
            totalDays,
            attendancePct,
            rubricAvg,
            evalCount,
          });
        }
      }
    }
    return list;
  }, [schools, schoolFilter, specFilter, dateStart, dateEnd]);

  const gradeOptions = useMemo(() => {
    const set = new Set<string>();
    baseRows.forEach((r) => {
      if (r.student.gradeLevel) set.add(r.student.gradeLevel);
    });
    return Array.from(set).sort();
  }, [baseRows]);

  const genderOptions = useMemo(() => {
    const set = new Set<string>();
    baseRows.forEach((r) => {
      if (r.student.gender) set.add(r.student.gender);
    });
    return Array.from(set).sort();
  }, [baseRows]);

  const teacherOptions = useMemo(() => {
    const set = new Set<string>();
    baseRows.forEach((r) => {
      if (r.teacherName) set.add(r.teacherName);
    });
    return Array.from(set).sort();
  }, [baseRows]);

  const filteredRows = useMemo(() => {
    const rows = baseRows.filter((r) => {
      if (gradeFilter !== 'all' && r.student.gradeLevel !== gradeFilter) return false;
      if (genderFilter !== 'all' && r.student.gender !== genderFilter) return false;
      if (teacherFilter !== 'all' && r.teacherName !== teacherFilter) return false;
      return true;
    });

    const mult = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortBy === 'name') return a.student.name.localeCompare(b.student.name) * mult;
      if (sortBy === 'grade')
        return (a.student.gradeLevel || '').localeCompare(b.student.gradeLevel || '') * mult;
      if (sortBy === 'attendance')
        return ((a.attendancePct ?? -1) - (b.attendancePct ?? -1)) * mult;
      return ((a.rubricAvg ?? -1) - (b.rubricAvg ?? -1)) * mult;
    });
  }, [baseRows, gradeFilter, genderFilter, teacherFilter, sortBy, sortDir]);

  // Featured Teacher banner when filtered to a single teacher or specialization with an assigned teacher
  const featuredTeacher = useMemo(() => {
    if (teacherFilter !== 'all') {
      const match = filteredRows.find((r) => r.teacherName === teacherFilter);
      return match
        ? { name: match.teacherName, photo: match.teacherPhoto, context: 'Filtered Teacher' }
        : { name: teacherFilter, photo: undefined, context: 'Filtered Teacher' };
    }
    if (specFilter !== 'all') {
      const spec = availableSpecs.find((sp) => sp.id === specFilter);
      if (spec && (spec.teacherName || spec.teacherPhoto)) {
        return {
          name: spec.teacherName || 'Assigned Teacher',
          photo: spec.teacherPhoto,
          context: spec.name,
        };
      }
    }
    return null;
  }, [teacherFilter, specFilter, filteredRows, availableSpecs]);

  // Aggregate KPIs
  const kpis = useMemo(() => {
    let totalPresent = 0;
    let totalSessions = 0;
    let totalEvals = 0;
    const rubricScores: number[] = [];
    let evaluatedStudents = 0;

    filteredRows.forEach((r) => {
      totalPresent += r.presentDays;
      totalSessions += r.totalDays;
      totalEvals += r.evalCount;
      if (r.evalCount > 0) evaluatedStudents++;
      if (r.rubricAvg !== null) rubricScores.push(r.rubricAvg);
    });

    const attendanceRate =
      totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : null;
    const avgRubric =
      rubricScores.length > 0
        ? rubricScores.reduce((a, b) => a + b, 0) / rubricScores.length
        : null;

    return {
      attendanceRate,
      totalPresent,
      totalSessions,
      studentCount: filteredRows.length,
      avgRubric,
      totalEvals,
      evaluatedStudents,
    };
  }, [filteredRows]);

  // Daily Attendance Trend Chart Data
  const dailyTrendData = useMemo(() => {
    const byDate = new Map<string, { present: number; absent: number }>();
    filteredRows.forEach((row) => {
      Object.entries(row.student.attendance || {}).forEach(([date, status]) => {
        if (dateStart && date < dateStart) return;
        if (dateEnd && date > dateEnd) return;
        const curr = byDate.get(date) || { present: 0, absent: 0 };
        if (status === 'Present') curr.present++;
        if (status === 'Absent') curr.absent++;
        byDate.set(date, curr);
      });
    });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => {
        const total = counts.present + counts.absent;
        return {
          date,
          label: date.slice(5), // MM-DD
          rate: total > 0 ? Math.round((counts.present / total) * 100) : 0,
          present: counts.present,
          absent: counts.absent,
        };
      });
  }, [filteredRows, dateStart, dateEnd]);

  // Rubric Criterion Averages Chart Data
  const criterionChartData = useMemo(() => {
    const byName = new Map<string, { sum: number; count: number }>();
    filteredRows.forEach((row) => {
      const criteriaMap = new Map<string, string>(
        row.spec.rubricCriteria.map((c) => [c.id, c.name])
      );
      (row.student.evaluations || []).forEach((ev) => {
        if (dateStart && ev.date < dateStart) return;
        if (dateEnd && ev.date > dateEnd) return;
        Object.entries(ev.scores || {}).forEach(([cId, sc]) => {
          if (typeof sc !== 'number' || sc <= 0) return;
          const name = criteriaMap.get(cId);
          if (!name) return;
          const curr = byName.get(name) || { sum: 0, count: 0 };
          curr.sum += sc;
          curr.count += 1;
          byName.set(name, curr);
        });
      });
    });

    return Array.from(byName.entries()).map(([name, stat]) => ({
      name,
      average: Number((stat.sum / stat.count).toFixed(2)),
      samples: stat.count,
    }));
  }, [filteredRows, dateStart, dateEnd]);

  const toggleSort = (col: 'name' | 'grade' | 'attendance' | 'rubric') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'name' || col === 'grade' ? 'asc' : 'desc');
    }
  };

  const handleExportReportCSV = () => {
    const headers = [
      'Student Name',
      'Roll/ID No.',
      'School',
      'Specialization',
      'Grade Level',
      'Gender',
      'Contact No.',
      'Teacher Name',
      'Present Days',
      'Absent Days',
      'Attendance %',
      'Rubric Average',
      'Evaluations Logged',
    ];
    const rows = filteredRows.map((r) => [
      r.student.name,
      r.student.rollNo,
      r.school.name,
      r.spec.name,
      r.student.gradeLevel || '',
      r.student.gender || '',
      r.student.contactNo || '',
      r.teacherName,
      r.presentDays,
      r.absentDays,
      r.attendancePct !== null ? `${r.attendancePct}%` : '',
      r.rubricAvg !== null ? r.rubricAvg.toFixed(2) : '',
      r.evalCount,
    ]);
    downloadCSV('EZ_Center_Analytics_Report.csv', headers, rows);
    showToast(`Exported report with ${rows.length} students to CSV.`);
  };

  return (
    <>
      <div
        className={`max-w-6xl mx-auto flex flex-col gap-6 pb-12 print-full-width ${
          selectedScorecard ? 'no-print' : ''
        }`}
      >
        {/* Header + Export Actions */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
              <BarChart3 size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Reports &amp; Analytics
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Attendance trends, rubric averages, student scorecards, and print-ready exports.
              </p>
            </div>
          </div>
          {permissions.canExportReports && (
            <div className="no-print flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleExportReportCSV}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!triggerPrintReport()) {
                    showToast(
                      'System printing is unavailable in the Android app. Use Export CSV or open in Chrome to save PDF.',
                      'info'
                    );
                  }
                }}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Printer size={14} /> Print / Save PDF
              </button>
            </div>
          )}
        </div>

        {/* School Branding Banner when scoped to a single school */}
        {selectedSchoolObj && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 print-break-avoid">
            <PortraitAvatar
              src={selectedSchoolObj.logo}
              name={selectedSchoolObj.name}
              fallbackText={selectedSchoolObj.name.substring(0, 3).toUpperCase()}
              size="md"
              tone="violet"
              className="font-mono"
            />
            <div>
              <div className="text-[11px] font-semibold text-violet-700">
                School Analytics Report
              </div>
              <div className="text-base font-bold text-slate-900">
                {selectedSchoolObj.name}
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="no-print bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              School
            </label>
            <select
              value={schoolFilter}
              onChange={(e) => {
                setSchoolFilter(e.target.value);
                setSpecFilter('all');
                setGradeFilter('all');
                setGenderFilter('all');
                setTeacherFilter('all');
              }}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Schools</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Specialization
            </label>
            <select
              value={specFilter}
              onChange={(e) => setSpecFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Specializations</option>
              {availableSpecs.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Grade Level
            </label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Grades</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Gender
            </label>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Genders</option>
              {genderOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Teacher
            </label>
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Teachers</option>
              {teacherOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Date Range
            </label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                aria-label="Start date"
                className="w-1/2 bg-white border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] font-mono tabular-nums text-slate-800 focus:outline-none focus:border-violet-500"
              />
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                aria-label="End date"
                className="w-1/2 bg-white border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] font-mono tabular-nums text-slate-800 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
        </div>

        {/* Featured Teacher Profile Strip (visible in both screen and PDF report) */}
        {featuredTeacher && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 print-break-avoid">
            <PortraitAvatar
              src={featuredTeacher.photo}
              name={featuredTeacher.name}
              size="lg"
              tone="violet"
            />
            <div>
              <div className="text-xs font-medium text-slate-500">
                Instructor Report · {featuredTeacher.context}
              </div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {featuredTeacher.name}
              </div>
            </div>
          </div>
        )}

        {/* 4-Column KPI Strip */}
        <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 print-break-avoid">
          <div className="p-5">
            <div className="text-xs font-semibold text-slate-500">Overall Attendance Rate</div>
            <div
              className={`text-2xl font-extrabold font-mono tabular-nums mt-1.5 ${
                kpis.attendanceRate === null
                  ? 'text-slate-400'
                  : kpis.attendanceRate >= systemSettings.attendanceThreshold
                  ? 'text-emerald-600'
                  : 'text-rose-600'
              }`}
            >
              {kpis.attendanceRate !== null ? `${kpis.attendanceRate}%` : '--'}
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              {kpis.totalPresent} / {kpis.totalSessions} present logs
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-semibold text-slate-500">Average Rubric Score</div>
            <div className="text-2xl font-extrabold font-mono tabular-nums text-violet-700 mt-1.5">
              {kpis.avgRubric !== null ? `${kpis.avgRubric.toFixed(2)}` : '--'}
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              Out of {systemSettings.rubricMax.toFixed(2)} · {kpis.totalEvals} evaluations
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-semibold text-slate-500">Students in Report</div>
            <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1.5">
              {kpis.studentCount}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {selectedSchoolObj ? selectedSchoolObj.name : `${schools.length} school(s)`}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-semibold text-slate-500">Students Evaluated</div>
            <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1.5">
              {kpis.studentCount > 0
                ? `${Math.round((kpis.evaluatedStudents / kpis.studentCount) * 100)}%`
                : '--'}
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              {kpis.evaluatedStudents} of {kpis.studentCount} scored
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Attendance Trend */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 print-break-avoid">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900">Daily Attendance Trend</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily percentage of present students across logged sessions.
              </p>
            </div>
            {dailyTrendData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                No attendance sessions logged for this filter scope yet.
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrendData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val: unknown, _name: unknown, props: { payload?: { present: number; absent: number } }) => [
                        `${val}% (${props?.payload?.present ?? 0} present, ${props?.payload?.absent ?? 0} absent)`,
                        'Attendance',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="rate"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="#7c3aed"
                      fillOpacity={0.12}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Rubric Criterion Averages */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 print-break-avoid">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900">Rubric Criterion Averages</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mean rubric scores across all criteria on a {systemSettings.rubricMin}.0–
                {systemSettings.rubricMax}.0 scale.
              </p>
            </div>
            {criterionChartData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                No rubric evaluations scored for this filter scope yet.
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={criterionChartData}
                    margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, systemSettings.rubricMax]}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val: unknown) => [
                        `${val} / ${systemSettings.rubricMax.toFixed(2)}`,
                        'Average Score',
                      ]}
                    />
                    <Bar dataKey="average" fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Student Performance & Scorecards Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Student Performance & Scorecards
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any student to open their printable scorecard with student and teacher photos.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {filteredRows.length} student{filteredRows.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredRows.length === 0 ? (
            <div className="py-12 px-6 text-center text-xs text-slate-500">
              No students match the selected filters. Adjust your filters or add students in the
              Attendance view.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-3 px-4 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        Student <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('grade')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        Grade / Gender <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 font-semibold">Contact No.</th>
                    <th className="py-3 px-3 font-semibold">Teacher</th>
                    <th className="py-3 px-3 font-semibold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('attendance')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        Attendance <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 font-semibold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('rubric')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        Rubric Avg <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="no-print py-3 px-4 font-semibold text-right">Scorecard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => (
                    <tr
                      key={`${row.school.id}-${row.spec.id}-${row.student.id}`}
                      onClick={() => setSelectedScorecard(row)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <PortraitAvatar
                            src={row.student.photo}
                            name={row.student.name}
                            size="sm"
                            tone="slate"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {row.student.name}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              <span className="font-mono tabular-nums">{row.student.rollNo}</span>
                              {' · '}
                              {row.school.name} / {row.spec.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        <div>{row.student.gradeLevel || '—'}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.student.gender || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {row.student.contactNo || '—'}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {row.teacherName && (
                            <PortraitAvatar
                              src={row.teacherPhoto}
                              name={row.teacherName}
                              size="xs"
                              tone="violet"
                            />
                          )}
                          <span className="text-slate-700">{row.teacherName || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            row.attendancePct === null
                              ? 'text-slate-400'
                              : row.attendancePct >= systemSettings.attendanceThreshold
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {row.attendancePct !== null ? `${row.attendancePct}%` : '--'}
                        </span>
                        <div className="text-[10px] text-slate-400">
                          {row.presentDays}/{row.totalDays}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-slate-900">
                          {row.rubricAvg !== null ? row.rubricAvg.toFixed(2) : '--'}
                        </span>
                        <div className="text-[10px] text-slate-400">
                          {row.evalCount} eval{row.evalCount === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="no-print py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedScorecard(row);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 rounded-md transition-colors"
                        >
                          <FileText size={13} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedScorecard && (
        <StudentScorecardModal
          school={selectedScorecard.school}
          spec={selectedScorecard.spec}
          student={selectedScorecard.student}
          dateStart={dateStart}
          dateEnd={dateEnd}
          attendanceThreshold={systemSettings.attendanceThreshold}
          rubricMax={systemSettings.rubricMax}
          onClose={() => setSelectedScorecard(null)}
        />
      )}
    </>
  );
}

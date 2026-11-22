import { useMemo } from 'react';
import { X, Printer, Download } from 'lucide-react';
import { School, Specialization, Student } from '../types';
import { PortraitAvatar } from './Avatar';
import { downloadCSV, triggerPrintReport } from '../utils/export';
import { useToast } from '../context/ToastContext';

interface StudentScorecardModalProps {
  school: School;
  spec: Specialization;
  student: Student;
  dateStart?: string;
  dateEnd?: string;
  attendanceThreshold?: number;
  rubricMax?: number;
  onClose: () => void;
}

export default function StudentScorecardModal({
  school,
  spec,
  student,
  dateStart = '',
  dateEnd = '',
  attendanceThreshold = 80,
  rubricMax = 5,
  onClose,
}: StudentScorecardModalProps) {
  const { showToast } = useToast();

  const effectiveTeacherName = student.teacherName || spec.teacherName || '';
  const effectiveTeacherPhoto = student.teacherPhoto || spec.teacherPhoto;

  const attendanceEntries = useMemo(() => {
    return Object.entries(student.attendance || {})
      .filter(([date]) => {
        if (dateStart && date < dateStart) return false;
        if (dateEnd && date > dateEnd) return false;
        return true;
      })
      .sort(([a], [b]) => b.localeCompare(a));
  }, [student.attendance, dateStart, dateEnd]);

  const filteredEvals = useMemo(() => {
    return (student.evaluations || [])
      .filter((ev) => {
        if (dateStart && ev.date < dateStart) return false;
        if (dateEnd && ev.date > dateEnd) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [student.evaluations, dateStart, dateEnd]);

  const presentCount = attendanceEntries.filter(([, s]) => s === 'Present').length;
  const absentCount = attendanceEntries.filter(([, s]) => s === 'Absent').length;
  const totalAttendance = presentCount + absentCount;
  const attendancePct =
    totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

  const criterionAverages = useMemo(() => {
    return spec.rubricCriteria.map((criterion) => {
      const vals: number[] = [];
      filteredEvals.forEach((ev) => {
        const sc = ev.scores[criterion.id];
        if (typeof sc === 'number' && sc > 0) vals.push(sc);
      });
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return {
        id: criterion.id,
        name: criterion.name,
        avg,
        count: vals.length,
      };
    });
  }, [spec.rubricCriteria, filteredEvals]);

  const overallRubricAvg = useMemo(() => {
    const activeIds = new Set(spec.rubricCriteria.map((c) => c.id));
    const allScores: number[] = [];
    filteredEvals.forEach((ev) => {
      Object.entries(ev.scores).forEach(([criterionId, sc]) => {
        if (!activeIds.has(criterionId)) return;
        if (typeof sc === 'number' && sc > 0) allScores.push(sc);
      });
    });
    if (allScores.length === 0) return null;
    return allScores.reduce((a, b) => a + b, 0) / allScores.length;
  }, [filteredEvals, spec.rubricCriteria]);

  const handleExportStudentCSV = () => {
    const headers = [
      'Student Name',
      'Roll/ID No.',
      'School',
      'Specialization',
      'Grade Level',
      'Gender',
      'Contact No.',
      'Teacher Name',
      'Attendance %',
      'Present Days',
      'Absent Days',
      'Overall Rubric Avg',
      ...criterionAverages.map((c) => `Criterion: ${c.name}`),
    ];
    const row = [
      student.name,
      student.rollNo,
      school.name,
      spec.name,
      student.gradeLevel || '',
      student.gender || '',
      student.contactNo || '',
      effectiveTeacherName,
      attendancePct !== null ? `${attendancePct}%` : '',
      presentCount,
      absentCount,
      overallRubricAvg !== null ? overallRubricAvg.toFixed(2) : '',
      ...criterionAverages.map((c) => (c.avg !== null ? c.avg.toFixed(2) : '')),
    ];
    downloadCSV(`${student.name}_Scorecard.csv`, headers, [row]);
    showToast(`Exported scorecard for ${student.name}.`);
  };

  return (
    <div
      className="print-modal-root fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="print-modal-card bg-white w-full max-w-3xl rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Action Bar */}
        <div className="no-print px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-600">
            Student Academic Scorecard
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportStudentCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download size={13} /> CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (!triggerPrintReport()) {
                  showToast(
                    'System printing is unavailable in the Android app. Use CSV export or open in Chrome for PDF.',
                    'info'
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Printer size={13} /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 text-slate-400 hover:text-slate-700 p-1"
              aria-label="Close scorecard"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Scorecard Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 bg-white">
          {/* Institutional Header with Student & Teacher Pictures */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200 print-break-avoid">
            <div className="flex items-start gap-4">
              <PortraitAvatar src={student.photo} name={student.name} size="xl" tone="violet" />
              <div>
                <div className="flex items-center gap-2">
                  <PortraitAvatar
                    src={school.logo}
                    name={school.name}
                    fallbackText={school.name.substring(0, 3).toUpperCase()}
                    size="xs"
                    tone="violet"
                    className="font-mono"
                  />
                  <p className="text-xs font-semibold text-violet-700">
                    EZ Center Portal · {school.name} / {spec.name}
                  </p>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mt-1.5 leading-tight">
                  {student.name}
                </h2>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400">Roll / ID: </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
                      {student.rollNo || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Grade Level: </span>
                    <span className="font-semibold text-slate-800">
                      {student.gradeLevel || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Gender: </span>
                    <span className="font-semibold text-slate-800">
                      {student.gender || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Contact No.: </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
                      {student.contactNo || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Assigned Teacher Card (with Teacher Picture) */}
            <div className="flex items-center gap-3 sm:text-right sm:flex-row-reverse shrink-0 pt-1">
              <PortraitAvatar
                src={effectiveTeacherPhoto}
                name={effectiveTeacherName || 'Teacher'}
                size="lg"
                tone="slate"
              />
              <div>
                <div className="text-[11px] font-semibold text-slate-400">Assigned Teacher</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {effectiveTeacherName || 'Not Assigned'}
                </div>
                {(dateStart || dateEnd) && (
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                    {dateStart || 'Start'} → {dateEnd || 'Present'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-Metric KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 print-break-avoid">
            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Attendance Rate</div>
              <div
                className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                  attendancePct === null
                    ? 'text-slate-400'
                    : attendancePct >= attendanceThreshold
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {attendancePct !== null ? `${attendancePct}%` : '--'}
              </div>
              <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                {presentCount} present · {absentCount} absent
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Logged Sessions</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {totalAttendance}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Attendance days</div>
            </div>

            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Rubric Average</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-violet-700 mt-1">
                {overallRubricAvg !== null ? `${overallRubricAvg.toFixed(2)}` : '--'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Out of {rubricMax.toFixed(2)} scale
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs font-medium text-slate-500">Evaluations</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {filteredEvals.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Scored sessions</div>
            </div>
          </div>

          {/* Rubric Criterion Breakdown */}
          <div className="print-break-avoid">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Rubric Criterion Performance
            </h3>
            {criterionAverages.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 border border-slate-200 rounded-lg text-center">
                No rubric criteria configured for {spec.name}.
              </p>
            ) : (
              <div className="space-y-3 border border-slate-200 rounded-xl p-4">
                {criterionAverages.map((item) => {
                  const pct =
                    item.avg !== null ? Math.min(100, Math.round((item.avg / rubricMax) * 100)) : 0;
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-800">{item.name}</span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {item.avg !== null
                            ? `${item.avg.toFixed(2)} / ${rubricMax.toFixed(2)}`
                            : 'Not scored'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Evaluation History */}
          {filteredEvals.length > 0 && (
            <div className="print-break-avoid">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Evaluation History</h3>
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-3.5 font-semibold">Date</th>
                      {spec.rubricCriteria.map((c) => (
                        <th key={c.id} className="py-2.5 px-3 font-semibold text-right">
                          {c.name}
                        </th>
                      ))}
                      <th className="py-2.5 px-3.5 font-semibold text-right">Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEvals.map((ev) => {
                      const vals = spec.rubricCriteria
                        .map((c) => ev.scores[c.id])
                        .filter((v): v is number => typeof v === 'number' && v > 0);
                      const rowAvg =
                        vals.length > 0
                          ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
                          : '--';
                      return (
                        <tr key={ev.id}>
                          <td className="py-2.5 px-3.5 font-mono tabular-nums text-slate-700">
                            {ev.date}
                          </td>
                          {spec.rubricCriteria.map((c) => (
                            <td
                              key={c.id}
                              className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-800"
                            >
                              {ev.scores[c.id] ?? '—'}
                            </td>
                          ))}
                          <td className="py-2.5 px-3.5 font-mono tabular-nums text-right font-bold text-violet-700">
                            {rowAvg}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Attendance Log History */}
          <div className="print-break-avoid">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Attendance Log ({attendanceEntries.length})
            </h3>
            {attendanceEntries.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 border border-slate-200 rounded-lg text-center">
                No attendance logs recorded for this period.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {attendanceEntries.slice(0, 32).map(([date, status]) => (
                  <div
                    key={date}
                    className="px-3 py-2 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                  >
                    <span className="font-mono tabular-nums text-slate-600">{date}</span>
                    <span
                      className={`font-semibold ${
                        status === 'Present' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

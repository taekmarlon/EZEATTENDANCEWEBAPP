import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, X as XIcon, Trash2 } from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  getDay,
} from 'date-fns';
import { Student, AttendanceStatus } from '../types';
import { useStore } from '../store';
import { PortraitAvatar } from './Avatar';

interface AttendanceModalProps {
  schoolId: string;
  specId: string;
  student: Student;
  defaultTeacherName?: string;
  readOnly?: boolean;
  onClose: () => void;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AttendanceModal({
  schoolId,
  specId,
  student,
  defaultTeacherName,
  readOnly = false,
  onClose,
}: AttendanceModalProps) {
  const { updateAttendance } = useStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeCell, setActiveCell] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const paddedDays: (Date | null)[] = Array(startDayOfWeek).fill(null).concat(daysInMonth);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleAttendanceChange = (date: Date, status: AttendanceStatus | null) => {
    updateAttendance(schoolId, specId, student.id, format(date, 'yyyy-MM-dd'), status);
    setActiveCell(null);
  };

  let presentCount = 0;
  let absentCount = 0;

  daysInMonth.forEach((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const status = student.attendance[dateStr];
    if (status === 'Present') presentCount++;
    if (status === 'Absent') absentCount++;
  });

  const totalLogged = presentCount + absentCount;
  const teacherLabel = student.teacherName || defaultTeacherName || '';

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[540px] rounded-xl shadow-xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center gap-3.5 shrink-0">
          <PortraitAvatar src={student.photo} name={student.name} size="md" tone="violet" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 leading-tight truncate">
              {student.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {[
                student.rollNo ? `ID ${student.rollNo}` : null,
                student.gradeLevel || null,
                teacherLabel || null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Enrolled Student'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1"
            aria-label="Close attendance calendar"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Month Navigator */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-white shrink-0">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <h3 className="font-bold text-sm text-slate-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <button
            type="button"
            onClick={handleNextMonth}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-7 border-t border-l border-slate-200 rounded-lg overflow-visible bg-white">
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="p-2 border-b border-r border-slate-200 text-[11px] font-semibold bg-slate-50 text-center text-slate-500"
              >
                {day}
              </div>
            ))}

            {paddedDays.map((day, index) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="h-12 border-b border-r border-slate-200 bg-slate-50/50"
                  />
                );
              }

              const dateStr = format(day, 'yyyy-MM-dd');
              const status = student.attendance[dateStr];
              const isToday = isSameDay(day, new Date());
              const isActive = activeCell && isSameDay(activeCell, day);
              const colIdx = index % 7;
              const isBottomRows = index >= paddedDays.length - 14;
              const horizClass =
                colIdx <= 1
                  ? 'left-0'
                  : colIdx >= 5
                  ? 'right-0'
                  : 'left-1/2 -translate-x-1/2';
              const vertClass = isBottomRows ? 'bottom-full mb-1.5' : 'top-full mt-1.5';

              return (
                <div
                  key={dateStr}
                  className={`h-12 border-b border-r border-slate-200 flex flex-col items-center justify-center relative transition-colors ${
                    readOnly ? '' : 'cursor-pointer'
                  } ${
                    isToday ? 'bg-violet-50/70' : readOnly ? '' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => {
                    if (!readOnly) setActiveCell(isActive ? null : day);
                  }}
                >
                  <span
                    className={`text-xs font-mono tabular-nums font-semibold ${
                      isToday ? 'text-violet-700' : 'text-slate-700'
                    }`}
                  >
                    {format(day, 'dd')}
                  </span>

                  {status === 'Present' && (
                    <span className="text-emerald-600 font-bold text-[11px] leading-none mt-0.5">
                      P
                    </span>
                  )}
                  {status === 'Absent' && (
                    <span className="text-rose-600 font-bold text-[11px] leading-none mt-0.5">
                      A
                    </span>
                  )}

                  {isActive && (
                    <div
                      className={`absolute ${vertClass} ${horizClass} w-32 bg-slate-900 rounded-lg shadow-xl z-30 overflow-hidden border border-slate-700`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAttendanceChange(day, 'Present');
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-emerald-400 hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Check size={14} /> Present
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAttendanceChange(day, 'Absent');
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-400 hover:bg-slate-800 flex items-center gap-2"
                      >
                        <XIcon size={14} /> Absent
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAttendanceChange(day, null);
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-slate-800 flex items-center gap-2 border-t border-slate-700"
                      >
                        <Trash2 size={14} /> Clear Log
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary Footer */}
          <div className="mt-5 bg-slate-900 rounded-xl p-4 grid grid-cols-3 divide-x divide-slate-800 shrink-0">
            <div className="text-center">
              <p className="text-[11px] text-slate-400 font-medium">Logged</p>
              <p className="text-lg font-bold text-white font-mono tabular-nums mt-0.5">
                {totalLogged}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-slate-400 font-medium">Present</p>
              <p className="text-lg font-bold text-emerald-400 font-mono tabular-nums mt-0.5">
                {presentCount}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-slate-400 font-medium">Absent</p>
              <p className="text-lg font-bold text-rose-400 font-mono tabular-nums mt-0.5">
                {absentCount}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Search,
  Plus,
  Trash2,
  Download,
  Upload,
  Pencil,
  CalendarCheck,
  GraduationCap,
  Phone,
  Hash,
  UserCheck,
  Users,
  ScanFace,
  CheckCircle2,
} from 'lucide-react';
import { School, Specialization, Student, StudentProfileInput } from '../types';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { downloadCSV } from '../utils/export';
import ConfirmModal from './ConfirmModal';
import AttendanceModal from './AttendanceModal';
import StudentFormModal from './StudentFormModal';
import CsvImportModal from './CsvImportModal';
import FaceAttendanceModal from './FaceAttendanceModal';
import { PortraitAvatar } from './Avatar';

interface RosterViewProps {
  school: School;
  spec: Specialization;
}

export default function RosterView({ school, spec }: RosterViewProps) {
  const {
    addStudent,
    addStudentsBulk,
    updateStudent,
    deleteStudent,
    permissions,
    systemSettings,
  } = useStore();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isFaceScanning, setIsFaceScanning] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const faceRecognitionEnabled = systemSettings.faceRecognitionSettings?.enabled ?? true;

  // Reset search & local dialogs when switching specializations
  useEffect(() => {
    setSearchQuery('');
    setIsAdding(false);
    setIsImportingCsv(false);
    setIsFaceScanning(false);
    setEditingStudent(null);
    setDeletingStudent(null);
    setActiveStudentId(null);
  }, [spec.id]);

  const activeStudent = useMemo(
    () => spec.students.find((s) => s.id === activeStudentId) || null,
    [spec.students, activeStudentId]
  );

  const coTeachers = spec.coTeachers && spec.coTeachers.length > 0 ? spec.coTeachers : [];
  const defaultTeacherLabel =
    coTeachers.length > 0
      ? coTeachers.map((t) => t.fullName).join(' & ')
      : spec.teacherName || '';

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return spec.students;
    return spec.students.filter((s) => {
      const teacher = (s.teacherName || defaultTeacherLabel || '').toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.rollNo || '').toLowerCase().includes(q) ||
        (s.gradeLevel || '').toLowerCase().includes(q) ||
        (s.gender || '').toLowerCase().includes(q) ||
        (s.contactNo || '').toLowerCase().includes(q) ||
        teacher.includes(q)
      );
    });
  }, [spec.students, defaultTeacherLabel, searchQuery]);

  const handleSaveStudent = (profile: StudentProfileInput) => {
    if (editingStudent) {
      updateStudent(school.id, spec.id, editingStudent.id, profile);
      showToast(`Updated ${profile.name}.`);
      setEditingStudent(null);
    } else {
      addStudent(school.id, spec.id, profile);
      showToast(`Added ${profile.name} to ${spec.name}.`);
    }
  };

  const handleBulkCsvImport = (importedStudents: StudentProfileInput[]) => {
    const count = addStudentsBulk(school.id, spec.id, importedStudents);
    if (count > 0) {
      showToast(`Imported ${count} student${count === 1 ? '' : 's'} into ${spec.name}.`);
    }
  };

  const calculateAttendance = (student: Student) => {
    let present = 0;
    let absent = 0;
    Object.values(student.attendance).forEach((status) => {
      if (status === 'Present') present++;
      if (status === 'Absent') absent++;
    });
    const total = present + absent;
    if (total === 0) return { percent: null, present, absent, total };
    return { percent: Math.round((present / total) * 100), present, absent, total };
  };

  const handleExportCSV = () => {
    const dateSet = new Set<string>();
    spec.students.forEach((s) => {
      Object.keys(s.attendance).forEach((date) => dateSet.add(date));
    });
    const dates = Array.from(dateSet).sort();

    const headers = [
      'Student Name',
      'Roll/Card No',
      'Grade Level',
      'Gender',
      'Contact No.',
      'Teacher Name',
      'Attendance %',
      ...dates,
    ];
    const rows = spec.students.map((s) => {
      const stats = calculateAttendance(s);
      return [
        s.name,
        s.rollNo,
        s.gradeLevel || '',
        s.gender || '',
        s.contactNo || '',
        s.teacherName || defaultTeacherLabel || '',
        stats.percent !== null ? `${stats.percent}%` : '',
        ...dates.map((d) => s.attendance[d] || ''),
      ];
    });

    downloadCSV(`${school.name}_${spec.name}_Attendance.csv`, headers, rows);
    showToast(`Exported ${spec.students.length} student attendance records to CSV.`);
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-5 pb-10">
      {/* Specialization & Assigned Teacher Banner (read-only; managed in Teachers menu) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {coTeachers.length > 0 ? (
            <div className="flex -space-x-2 shrink-0">
              {coTeachers.map((ct) => (
                <PortraitAvatar
                  key={ct.id}
                  src={ct.avatarUrl}
                  name={ct.fullName}
                  size="md"
                  tone="violet"
                  className="ring-2 ring-white"
                />
              ))}
            </div>
          ) : (
            <PortraitAvatar
              src={spec.teacherPhoto}
              name={spec.teacherName || 'Teacher'}
              size="md"
              tone="violet"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
              <UserCheck size={13} />
              <span>
                {coTeachers.length > 1 ? 'Co-Teachers' : 'Specialization Teacher'} · {spec.name}
              </span>
            </div>
            <div className="text-sm font-bold text-slate-900 mt-0.5 truncate">
              {defaultTeacherLabel || 'No teacher assigned yet'}
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-600 shrink-0">
          <Users size={13} className="text-violet-600" />
          <span>
            {spec.students.length} enrolled student{spec.students.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Search & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-lg">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search name, roll ID, grade, contact, or teacher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 transition-shadow"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {permissions.canLogAttendanceAndGrade && faceRecognitionEnabled && (
            <button
              type="button"
              onClick={() => setIsFaceScanning(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-semibold text-xs transition-colors whitespace-nowrap shadow-sm"
            >
              <ScanFace size={14} className="text-violet-300" /> Face Check-In
            </button>
          )}
          {permissions.canManageStudentsAndAttendance && (
            <button
              type="button"
              onClick={() => setIsImportingCsv(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl hover:bg-emerald-100/80 font-semibold text-xs transition-colors whitespace-nowrap shadow-2xs"
            >
              <Upload size={14} /> Import CSV
            </button>
          )}
          {permissions.canExportReports && (
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={spec.students.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold text-xs transition-colors disabled:opacity-50 whitespace-nowrap shadow-2xs"
            >
              <Download size={14} /> Export CSV
            </button>
          )}
          {permissions.canManageStudentsAndAttendance && (
            <button
              type="button"
              onClick={() => {
                setEditingStudent(null);
                setIsAdding(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 font-semibold text-xs shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus size={14} /> Add Student
            </button>
          )}
        </div>
      </div>

      {/* Student Roster List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs divide-y divide-slate-100 overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-14 px-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center mx-auto mb-3">
              <GraduationCap size={22} />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {spec.students.length === 0
                ? 'No students enrolled in this specialization yet.'
                : 'No students match your current search.'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {spec.students.length === 0
                ? 'Add a student manually or import a roster CSV without requiring Roll/ID numbers.'
                : 'Try searching by student name, roll number, grade level, or teacher name.'}
            </p>
            {spec.students.length === 0 && permissions.canManageStudentsAndAttendance && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportingCsv(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-colors"
                >
                  <Upload size={14} /> Import CSV
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold hover:bg-violet-700 shadow-xs transition-colors"
                >
                  <Plus size={14} /> Add First Student
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredStudents.map((student) => {
            const stats = calculateAttendance(student);
            const isGood =
              stats.percent !== null && stats.percent >= systemSettings.attendanceThreshold;
            const hasData = stats.percent !== null;
            const effectiveTeacher = student.teacherName || defaultTeacherLabel || '';

            return (
              <div
                key={student.id}
                onClick={() => setActiveStudentId(student.id)}
                className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-violet-50/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <PortraitAvatar
                    src={student.photo}
                    name={student.name}
                    size="md"
                    tone="slate"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {student.name}
                      </h3>
                      {(student.faceDescriptors?.length || 0) > 0 && (
                        <span
                          title={`Face ID enrolled (${student.faceDescriptors?.length || 0} sample${
                            (student.faceDescriptors?.length || 0) === 1 ? '' : 's'
                          })`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700 shrink-0"
                        >
                          <ScanFace size={11} />
                          Face ID
                        </span>
                      )}
                      {student.attendance[todayStr] === 'Present' &&
                        student.attendanceMeta?.[todayStr]?.method === 'face_kiosk' && (
                          <span
                            title={
                              typeof student.attendanceMeta?.[todayStr]?.confidence === 'number'
                                ? `Verified by Face Kiosk today (${Math.round(
                                    (student.attendanceMeta?.[todayStr]?.confidence || 0) * 100
                                  )}%)`
                                : 'Verified by Face Kiosk today'
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-700 shrink-0"
                          >
                            <CheckCircle2 size={11} />
                            Face Today
                          </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                      {student.rollNo && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          <Hash size={10} /> {student.rollNo}
                        </span>
                      )}
                      {student.gradeLevel && (
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap size={12} className="text-slate-400" />
                          {student.gradeLevel}
                        </span>
                      )}
                      {student.gender && <span>{student.gender}</span>}
                      {effectiveTeacher && (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <UserCheck size={12} className="text-violet-500" />
                          {effectiveTeacher}
                        </span>
                      )}
                      {student.contactNo && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px]">
                          <Phone size={11} className="text-slate-400" />
                          {student.contactNo}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold font-mono tabular-nums ${
                        !hasData
                          ? 'text-slate-400'
                          : isGood
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {hasData ? `${stats.percent}%` : '--'}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {hasData ? `${stats.present}/${stats.total} present` : 'No logs'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title={permissions.canLogAttendanceAndGrade ? 'Mark attendance' : 'View attendance'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveStudentId(student.id);
                      }}
                      className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                    >
                      <CalendarCheck size={16} />
                    </button>
                    {permissions.canManageStudentsAndAttendance && (
                      <button
                        type="button"
                        title="Edit student profile"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingStudent(student);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {permissions.canDeleteStudents && (
                      <button
                        type="button"
                        title="Delete student"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingStudent(student);
                        }}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <StudentFormModal
        isOpen={isAdding || !!editingStudent}
        mode={editingStudent ? 'edit' : 'add'}
        initialStudent={editingStudent}
        defaultTeacherName={defaultTeacherLabel}
        onSave={handleSaveStudent}
        onClose={() => {
          setIsAdding(false);
          setEditingStudent(null);
        }}
      />

      <CsvImportModal
        isOpen={isImportingCsv}
        schoolName={school.name}
        specName={spec.name}
        defaultTeacherName={defaultTeacherLabel}
        customFields={systemSettings.customStudentFields}
        onImport={handleBulkCsvImport}
        onClose={() => setIsImportingCsv(false)}
      />

      {faceRecognitionEnabled && (
        <FaceAttendanceModal
          isOpen={isFaceScanning}
          school={school}
          spec={spec}
          onClose={() => setIsFaceScanning(false)}
        />
      )}

      <ConfirmModal
        isOpen={!!deletingStudent}
        title="Delete Student"
        confirmText="Delete Student"
        message={
          <p>
            Are you sure you want to delete <strong>{deletingStudent?.name}</strong>? This will
            permanently remove their attendance and rubric records locally.{' '}
            <strong>This action cannot be undone.</strong>
          </p>
        }
        onConfirm={() => {
          if (deletingStudent) {
            deleteStudent(school.id, spec.id, deletingStudent.id);
            showToast(`Deleted ${deletingStudent.name}.`, 'info');
          }
        }}
        onCancel={() => setDeletingStudent(null)}
      />

      {activeStudent && (
        <AttendanceModal
          schoolId={school.id}
          specId={spec.id}
          student={activeStudent}
          defaultTeacherName={defaultTeacherLabel}
          readOnly={!permissions.canLogAttendanceAndGrade}
          onClose={() => setActiveStudentId(null)}
        />
      )}
    </div>
  );
}

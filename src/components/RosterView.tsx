import { useState, useMemo, useEffect, FormEvent } from 'react';
import { Search, Plus, Trash2, Download, Pencil, CalendarCheck, Check } from 'lucide-react';
import { School, Specialization, Student, StudentProfileInput } from '../types';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { downloadCSV } from '../utils/export';
import ConfirmModal from './ConfirmModal';
import AttendanceModal from './AttendanceModal';
import StudentFormModal from './StudentFormModal';
import { PortraitAvatar, PhotoUploader } from './Avatar';

interface RosterViewProps {
  school: School;
  spec: Specialization;
}

export default function RosterView({ school, spec }: RosterViewProps) {
  const {
    addStudent,
    updateStudent,
    deleteStudent,
    updateSpecializationTeacher,
    permissions,
    systemSettings,
  } = useStore();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  // Specialization Teacher inline editor
  const [isEditingTeacher, setIsEditingTeacher] = useState(false);
  const [draftTeacherName, setDraftTeacherName] = useState(spec.teacherName || '');
  const [draftTeacherPhoto, setDraftTeacherPhoto] = useState<string | undefined>(
    spec.teacherPhoto
  );

  // Reset draft & local dialog state when switching specializations
  useEffect(() => {
    setIsEditingTeacher(false);
    setDraftTeacherName(spec.teacherName || '');
    setDraftTeacherPhoto(spec.teacherPhoto);
    setSearchQuery('');
    setIsAdding(false);
    setEditingStudent(null);
    setDeletingStudent(null);
    setActiveStudentId(null);
  }, [spec.id]);

  const activeStudent = useMemo(
    () => spec.students.find((s) => s.id === activeStudentId) || null,
    [spec.students, activeStudentId]
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return spec.students;
    return spec.students.filter((s) => {
      const teacher = (s.teacherName || spec.teacherName || '').toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.rollNo.toLowerCase().includes(q) ||
        (s.gradeLevel || '').toLowerCase().includes(q) ||
        (s.gender || '').toLowerCase().includes(q) ||
        (s.contactNo || '').toLowerCase().includes(q) ||
        teacher.includes(q)
      );
    });
  }, [spec.students, spec.teacherName, searchQuery]);

  const handleOpenTeacherEditor = () => {
    setDraftTeacherName(spec.teacherName || '');
    setDraftTeacherPhoto(spec.teacherPhoto);
    setIsEditingTeacher(true);
  };

  const handleSaveTeacher = (e: FormEvent) => {
    e.preventDefault();
    updateSpecializationTeacher(school.id, spec.id, draftTeacherName.trim(), draftTeacherPhoto);
    setIsEditingTeacher(false);
    showToast('Specialization teacher profile updated.');
  };

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
        s.teacherName || spec.teacherName || '',
        stats.percent !== null ? `${stats.percent}%` : '',
        ...dates.map((d) => s.attendance[d] || ''),
      ];
    });

    downloadCSV(`${school.name}_${spec.name}_Attendance.csv`, headers, rows);
    showToast(`Exported ${spec.students.length} student attendance records to CSV.`);
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

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6 pb-10">
      {/* Assigned Specialization Teacher Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        {isEditingTeacher ? (
          <form
            onSubmit={handleSaveTeacher}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
              <PhotoUploader
                label="Teacher Picture"
                nameForFallback={draftTeacherName || 'Teacher'}
                value={draftTeacherPhoto}
                onChange={setDraftTeacherPhoto}
                size="md"
              />
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Assigned Teacher Name
                </label>
                <input
                  autoFocus
                  type="text"
                  value={draftTeacherName}
                  onChange={(e) => setDraftTeacherName(e.target.value)}
                  placeholder="e.g. Ms. Elena Cruz"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditingTeacher(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
              >
                <Check size={14} /> Save Teacher
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <PortraitAvatar
                src={spec.teacherPhoto}
                name={spec.teacherName || 'Teacher'}
                size="md"
                tone="violet"
              />
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {spec.coTeachers && spec.coTeachers.length > 1
                    ? 'Co-Teachers'
                    : 'Specialization Teacher'}{' '}
                  · {spec.name}
                </div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {spec.coTeachers && spec.coTeachers.length > 0
                    ? spec.coTeachers.map((t) => t.fullName).join(' & ')
                    : spec.teacherName || 'No teacher assigned yet'}
                </div>
              </div>
            </div>
            {permissions.canEditSpecializationTeacher && (
              <button
                type="button"
                onClick={handleOpenTeacherEditor}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Pencil size={13} />
                {spec.teacherName || spec.teacherPhoto ? 'Edit Teacher' : 'Assign Teacher & Photo'}
              </button>
            )}
          </div>
        )}
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
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 transition-shadow"
          />
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {permissions.canExportReports && (
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={spec.students.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold text-xs transition-colors disabled:opacity-50 whitespace-nowrap"
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
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-semibold text-xs shadow-xs transition-colors whitespace-nowrap"
            >
              <Plus size={14} /> Add Student
            </button>
          )}
        </div>
      </div>

      {/* Student Roster List */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-14 px-6">
            <p className="text-sm font-semibold text-slate-700">
              {spec.students.length === 0
                ? 'No students enrolled in this specialization yet.'
                : 'No students match your current search.'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {spec.students.length === 0
                ? 'Add your first student with their photo, grade level, gender, contact number, and teacher.'
                : 'Try searching by student name, roll number, grade level, or teacher name.'}
            </p>
            {spec.students.length === 0 && permissions.canManageStudentsAndAttendance && (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors"
              >
                <Plus size={14} /> Add First Student
              </button>
            )}
          </div>
        ) : (
          filteredStudents.map((student) => {
            const stats = calculateAttendance(student);
            const isGood =
              stats.percent !== null && stats.percent >= systemSettings.attendanceThreshold;
            const hasData = stats.percent !== null;
            const effectiveTeacher = student.teacherName || spec.teacherName || '';

            const metaParts = [
              student.rollNo ? `ID ${student.rollNo}` : null,
              student.gradeLevel || null,
              student.gender || null,
              effectiveTeacher ? `Teacher: ${effectiveTeacher}` : null,
              student.contactNo || null,
            ].filter(Boolean);

            return (
              <div
                key={student.id}
                onClick={() => setActiveStudentId(student.id)}
                className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <PortraitAvatar
                    src={student.photo}
                    name={student.name}
                    size="md"
                    tone="slate"
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {student.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      {metaParts.map((part, idx) => (
                        <span key={`${part}-${idx}`} className="inline-flex items-center gap-2">
                          {idx > 0 && (
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                          )}
                          <span
                            className={
                              part?.startsWith('ID ') || part === student.contactNo
                                ? 'font-mono tabular-nums text-[11px]'
                                : ''
                            }
                          >
                            {part}
                          </span>
                        </span>
                      ))}
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
        defaultTeacherName={spec.teacherName}
        defaultTeacherPhoto={spec.teacherPhoto}
        onSave={handleSaveStudent}
        onClose={() => {
          setIsAdding(false);
          setEditingStudent(null);
        }}
      />

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
          defaultTeacherName={spec.teacherName}
          readOnly={!permissions.canLogAttendanceAndGrade}
          onClose={() => setActiveStudentId(null)}
        />
      )}
    </div>
  );
}

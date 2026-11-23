import { useMemo, useState } from 'react';
import { Search, Building2, GraduationCap, Users } from 'lucide-react';
import { ManagedUser, School, Specialization, Student } from '../types';
import StudentScorecardModal from './StudentScorecardModal';

type DirectoryCategory = 'all' | 'schools' | 'students' | 'teacher' | 'director' | 'admin';

interface AdminDirectoryPanelProps {
  schools: School[];
  managedUsers: ManagedUser[];
  attendanceThreshold: number;
  rubricMax: number;
  onSelectUser: (user: ManagedUser) => void;
}

export default function AdminDirectoryPanel({
  schools,
  managedUsers,
  attendanceThreshold,
  rubricMax,
  onSelectUser,
}: AdminDirectoryPanelProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<DirectoryCategory>('all');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [inspectStudent, setInspectStudent] = useState<{
    school: School;
    spec: Specialization;
    student: Student;
  } | null>(null);

  const q = query.trim().toLowerCase();

  const matchingSchools = useMemo(() => {
    if (category !== 'all' && category !== 'schools') return [];
    return schools.filter((sch) => {
      if (schoolFilter !== 'all' && sch.id !== schoolFilter) return false;
      if (!q) return true;
      return (
        sch.name.toLowerCase().includes(q) ||
        sch.specializations.some((sp) => sp.name.toLowerCase().includes(q))
      );
    });
  }, [schools, category, schoolFilter, q]);

  const matchingStudents = useMemo(() => {
    if (category !== 'all' && category !== 'students') return [];
    const results: { school: School; spec: Specialization; student: Student }[] = [];
    for (const sch of schools) {
      if (schoolFilter !== 'all' && sch.id !== schoolFilter) continue;
      for (const sp of sch.specializations) {
        for (const st of sp.students) {
          if (
            !q ||
            st.name.toLowerCase().includes(q) ||
            st.rollNo.toLowerCase().includes(q) ||
            st.gradeLevel.toLowerCase().includes(q) ||
            sp.name.toLowerCase().includes(q) ||
            sch.name.toLowerCase().includes(q)
          ) {
            results.push({ school: sch, spec: sp, student: st });
          }
        }
      }
    }
    return results;
  }, [schools, category, schoolFilter, q]);

  const matchingUsers = useMemo(() => {
    if (category === 'schools' || category === 'students') return [];
    return managedUsers.filter((u) => {
      if (category !== 'all' && u.role !== category) return false;
      if (schoolFilter !== 'all') {
        if (u.role === 'teacher' && !u.assignments.some((a) => a.schoolId === schoolFilter)) {
          return false;
        }
      }
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [managedUsers, category, schoolFilter, q]);

  return (
    <div className="space-y-5">
      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all schools, students, roll IDs, teachers, directors, and admins..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-violet-500"
            />
          </div>
          <select
            aria-label="Directory school filter"
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
          >
            <option value="all">All Schools</option>
            {schools.map((sch) => (
              <option key={sch.id} value={sch.id}>
                {sch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['all', 'All Entities'],
              ['schools', 'Schools'],
              ['students', 'Students'],
              ['teacher', 'Teachers'],
              ['director', 'Directors'],
              ['admin', 'Admins'],
            ] as [DirectoryCategory, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                category === key
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Schools */}
      {matchingSchools.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
            <Building2 size={15} className="text-violet-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Schools ({matchingSchools.length})
            </h4>
          </div>
          <div className="divide-y divide-slate-100">
            {matchingSchools.map((sch) => {
              const totalStudents = sch.specializations.reduce(
                (acc, sp) => acc + sp.students.length,
                0
              );
              return (
                <div
                  key={sch.id}
                  className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{sch.name}</div>
                    <div className="text-slate-500">
                      {sch.specializations.map((sp) => sp.name).join(', ') || 'No specializations'}
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600">
                    {sch.specializations.length} specs · {totalStudents} students
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Users (Teachers, Directors, Admins) */}
      {matchingUsers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
            <Users size={15} className="text-violet-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Accounts: Teachers, Directors &amp; Admins ({matchingUsers.length})
            </h4>
          </div>
          <div className="divide-y divide-slate-100">
            {matchingUsers.map((u) => (
              <div
                key={u.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{u.fullName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                      {u.role}
                    </span>
                  </div>
                  <div className="text-slate-500">{u.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectUser(u)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                >
                  Inspect / Edit Access
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Students */}
      {matchingStudents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
            <GraduationCap size={15} className="text-violet-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Students ({matchingStudents.length})
            </h4>
          </div>
          <div className="divide-y divide-slate-100">
            {matchingStudents.map(({ school, spec, student }) => (
              <div
                key={student.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">
                    {student.name}{' '}
                    <span className="font-mono text-[11px] text-slate-400">
                      ({student.rollNo})
                    </span>
                  </div>
                  <div className="text-slate-500">
                    {school.name} · {spec.name}
                    {student.gradeLevel ? ` · ${student.gradeLevel}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectStudent({ school, spec, student })}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Inspect Scorecard
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {matchingSchools.length === 0 &&
        matchingUsers.length === 0 &&
        matchingStudents.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
            No matching schools, students, or accounts found.
          </div>
        )}

      {inspectStudent && (
        <StudentScorecardModal
          school={inspectStudent.school}
          spec={inspectStudent.spec}
          student={inspectStudent.student}
          dateStart=""
          dateEnd=""
          attendanceThreshold={attendanceThreshold}
          rubricMax={rubricMax}
          onClose={() => setInspectStudent(null)}
        />
      )}
    </div>
  );
}

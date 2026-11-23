import { useMemo, useState } from 'react';
import {
  Search,
  Building2,
  UserCheck,
  GraduationCap,
  X,
  ArrowRight,
  FileBarChart2,
  BookOpen,
} from 'lucide-react';
import { ManagedUser, School, Specialization, Student } from '../types';
import { PortraitAvatar } from './Avatar';
import StudentScorecardModal from './StudentScorecardModal';

type SearchCategory = 'all' | 'schools' | 'teachers' | 'students';

interface GlobalSearchModalProps {
  isOpen: boolean;
  schools: School[];
  managedUsers: ManagedUser[];
  attendanceThreshold: number;
  rubricMax: number;
  onSelectClass: (schoolId: string, specId: string | null) => void;
  onOpenTeachersTab: () => void;
  onClose: () => void;
}

export default function GlobalSearchModal({
  isOpen,
  schools,
  managedUsers,
  attendanceThreshold,
  rubricMax,
  onSelectClass,
  onOpenTeachersTab,
  onClose,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [inspectStudent, setInspectStudent] = useState<{
    school: School;
    spec: Specialization;
    student: Student;
  } | null>(null);

  const q = query.trim().toLowerCase();

  const matchingSchools = useMemo(() => {
    if (category !== 'all' && category !== 'schools') return [];
    return schools.filter((sch) => {
      if (!q) return true;
      return (
        sch.name.toLowerCase().includes(q) ||
        sch.specializations.some((sp) => sp.name.toLowerCase().includes(q))
      );
    });
  }, [schools, category, q]);

  const teachers = useMemo(
    () => managedUsers.filter((u) => u.role === 'teacher'),
    [managedUsers]
  );

  const matchingTeachers = useMemo(() => {
    if (category !== 'all' && category !== 'teachers') return [];
    return teachers.filter((t) => {
      if (!q) return true;
      if (t.fullName.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)) {
        return true;
      }
      return t.assignments.some((a) => {
        const sch = schools.find((s) => s.id === a.schoolId);
        const sp = sch?.specializations.find((item) => item.id === a.specializationId);
        return (
          sch?.name.toLowerCase().includes(q) || sp?.name.toLowerCase().includes(q)
        );
      });
    });
  }, [teachers, schools, category, q]);

  const matchingStudents = useMemo(() => {
    if (category !== 'all' && category !== 'students') return [];
    const results: { school: School; spec: Specialization; student: Student }[] = [];
    for (const sch of schools) {
      for (const sp of sch.specializations) {
        for (const st of sp.students) {
          if (
            !q ||
            st.name.toLowerCase().includes(q) ||
            (st.rollNo || '').toLowerCase().includes(q) ||
            (st.gradeLevel || '').toLowerCase().includes(q) ||
            (st.contactNo || '').toLowerCase().includes(q) ||
            (st.teacherName || sp.teacherName || '').toLowerCase().includes(q) ||
            sp.name.toLowerCase().includes(q) ||
            sch.name.toLowerCase().includes(q)
          ) {
            results.push({ school: sch, spec: sp, student: st });
          }
        }
      }
    }
    return results;
  }, [schools, category, q]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-16 bg-slate-900/50 backdrop-blur-xs"
        onClick={onClose}
      >
        <div
          className="bg-white w-full max-w-3xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input Header */}
          <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-violet-50/70 via-white to-white space-y-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <Search size={17} />
              </div>
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search across all Schools, Teachers, and Students..."
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search query"
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close global search"
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-semibold text-slate-600 transition-colors shrink-0"
              >
                Esc
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', 'All Results'],
                  ['schools', `Schools (${matchingSchools.length})`],
                  ['teachers', `Teachers (${matchingTeachers.length})`],
                  ['students', `Students (${matchingStudents.length})`],
                ] as [SearchCategory, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    category === key
                      ? 'bg-violet-600 text-white border-violet-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Results */}
          <div className="p-4 overflow-y-auto space-y-5 bg-slate-50/40">
            {matchingSchools.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <Building2 size={14} className="text-violet-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Schools ({matchingSchools.length})
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {matchingSchools.slice(0, 20).map((sch) => (
                    <div key={sch.id} className="p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PortraitAvatar
                            src={sch.logo}
                            name={sch.name}
                            fallbackText={sch.name.substring(0, 3).toUpperCase()}
                            size="xs"
                            tone="violet"
                            className="font-mono"
                          />
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {sch.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectClass(sch.id, sch.specializations[0]?.id ?? null);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 border border-violet-200 rounded-lg text-[11px] font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                        >
                          Open School <ArrowRight size={12} />
                        </button>
                      </div>
                      {sch.specializations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pl-9">
                          {sch.specializations
                            .filter(
                              (sp) =>
                                !q ||
                                sch.name.toLowerCase().includes(q) ||
                                sp.name.toLowerCase().includes(q)
                            )
                            .slice(0, 8)
                            .map((sp) => (
                              <button
                                key={sp.id}
                                type="button"
                                onClick={() => {
                                  onSelectClass(sch.id, sp.id);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-violet-100 hover:text-violet-800 rounded text-[11px] font-medium text-slate-700 transition-colors"
                              >
                                <BookOpen size={10} />
                                {sp.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {matchingTeachers.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <UserCheck size={14} className="text-emerald-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Teachers ({matchingTeachers.length})
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {matchingTeachers.slice(0, 20).map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PortraitAvatar
                          src={t.avatarUrl}
                          name={t.fullName}
                          size="xs"
                          tone="violet"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{t.fullName}</div>
                          <div className="text-[11px] text-slate-500 truncate">{t.email}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenTeachersTab();
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
                      >
                        View in Teachers <ArrowRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {matchingStudents.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <GraduationCap size={14} className="text-sky-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Students ({matchingStudents.length})
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {matchingStudents.slice(0, 30).map(({ school, spec, student }) => (
                    <div
                      key={student.id}
                      className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PortraitAvatar
                          src={student.photo}
                          name={student.name}
                          size="xs"
                          tone="slate"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">
                            {student.name}
                            {student.rollNo && (
                              <span className="ml-1.5 font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {student.rollNo}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {school.name} · {spec.name}
                            {student.gradeLevel ? ` · ${student.gradeLevel}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectStudent({ school, spec, student })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <FileBarChart2 size={12} /> Scorecard
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectClass(school.id, spec.id);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 border border-violet-200 rounded-lg text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                        >
                          Open Class <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {matchingSchools.length === 0 &&
              matchingTeachers.length === 0 &&
              matchingStudents.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                  No matching schools, teachers, or students found.
                </div>
              )}
          </div>
        </div>
      </div>

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
    </>
  );
}

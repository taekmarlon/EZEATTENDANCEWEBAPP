import { useMemo, useState } from 'react';
import { Search, UserCheck, Users, X, Plus } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { ManagedUser, School, Specialization } from '../types';
import { PortraitAvatar } from './Avatar';

const MAX_CO_TEACHERS = 2;

function getAssignedTeacherIdsForSpec(
  school: School,
  spec: Specialization,
  teachers: ManagedUser[]
): string[] {
  const fromAssignments = teachers
    .filter((t) =>
      t.assignments.some(
        (a) =>
          a.schoolId === school.id &&
          (a.specializationId === spec.id || a.specializationId === null)
      )
    )
    .map((t) => t.id);

  if (fromAssignments.length > 0) {
    return Array.from(new Set(fromAssignments));
  }
  return (spec.coTeachers || []).map((c) => c.id);
}

export default function TeacherRosterView() {
  const { schools, managedUsers, permissions, assignSpecializationTeachers } = useStore();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [selectedTeacherBySpec, setSelectedTeacherBySpec] = useState<Record<string, string>>({});
  const [savingSpecId, setSavingSpecId] = useState<string | null>(null);

  const teachers = useMemo(
    () => managedUsers.filter((u) => u.role === 'teacher'),
    [managedUsers]
  );

  const activeTeachers = useMemo(
    () => teachers.filter((t) => t.isActive),
    [teachers]
  );

  const allSpecializations = useMemo(
    () =>
      schools.flatMap((sch) =>
        sch.specializations.map((sp) => ({
          schoolId: sch.id,
          schoolName: sch.name,
          specId: sp.id,
          specName: sp.name,
        }))
      ),
    [schools]
  );

  const filteredSchools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return schools
      .filter((s) => schoolFilter === 'all' || s.id === schoolFilter)
      .map((s) => {
        if (!q) return s;
        const schoolMatch = s.name.toLowerCase().includes(q);
        if (schoolMatch) return s;
        const matchedSpecs = s.specializations.filter((sp) => {
          const specMatch = sp.name.toLowerCase().includes(q);
          const teacherMatch = (sp.coTeachers || []).some((ct) =>
            ct.fullName.toLowerCase().includes(q)
          );
          return specMatch || teacherMatch;
        });
        return { ...s, specializations: matchedSpecs };
      })
      .filter((s) => s.specializations.length > 0 || !q);
  }, [schools, schoolFilter, searchQuery]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teachers.filter((t) => {
      if (schoolFilter !== 'all') {
        const teachesSchool = t.assignments.some((a) => a.schoolId === schoolFilter);
        if (!teachesSchool) return false;
      }
      if (!q) return true;
      if (
        t.fullName.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q)
      ) {
        return true;
      }
      return t.assignments.some((a) => {
        const sch = schools.find((s) => s.id === a.schoolId);
        const sp = sch?.specializations.find((item) => item.id === a.specializationId);
        return (
          sch?.name.toLowerCase().includes(q) ||
          sp?.name.toLowerCase().includes(q)
        );
      });
    });
  }, [teachers, schoolFilter, searchQuery, schools]);

  const handleAssignTeacher = async (school: School, spec: Specialization) => {
    const candidateId = selectedTeacherBySpec[spec.id] || '';
    if (!candidateId) return;

    const currentExplicitIds = teachers
      .filter((t) =>
        t.assignments.some(
          (a) => a.schoolId === school.id && a.specializationId === spec.id
        )
      )
      .map((t) => t.id);

    const effectiveCount = getAssignedTeacherIdsForSpec(school, spec, activeTeachers).length;
    if (effectiveCount >= MAX_CO_TEACHERS) {
      showToast('Maximum of 2 co-teachers already assigned to this specialization.', 'error');
      return;
    }

    const nextIds = Array.from(new Set([...currentExplicitIds, candidateId]));
    setSavingSpecId(spec.id);
    try {
      await assignSpecializationTeachers(school.id, spec.id, nextIds);
      setSelectedTeacherBySpec((prev) => ({ ...prev, [spec.id]: '' }));
      showToast(`Assigned co-teacher to ${school.name} · ${spec.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign teacher.', 'error');
    } finally {
      setSavingSpecId(null);
    }
  };

  const handleRemoveTeacher = async (
    school: School,
    spec: Specialization,
    teacherIdToRemove: string
  ) => {
    const currentExplicitIds = teachers
      .filter((t) =>
        t.assignments.some(
          (a) => a.schoolId === school.id && a.specializationId === spec.id
        )
      )
      .map((t) => t.id);

    if (!currentExplicitIds.includes(teacherIdToRemove)) {
      showToast(
        'This teacher has school-wide access; update school-wide access in Admin Console.',
        'info'
      );
      return;
    }

    const nextIds = currentExplicitIds.filter((id) => id !== teacherIdToRemove);
    setSavingSpecId(spec.id);
    try {
      await assignSpecializationTeachers(school.id, spec.id, nextIds);
      showToast(`Removed co-teacher from ${school.name} · ${spec.name}.`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update assignment.', 'error');
    } finally {
      setSavingSpecId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-12">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Teacher Roster &amp; Co-Teaching Assignments
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          View all teachers, assigned schools &amp; specializations, and assign up to 2 co-teachers per specialization.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teachers, emails, schools, or specializations..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="min-w-[200px]">
          <select
            aria-label="Filter by School"
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
          >
            <option value="all">All Schools ({schools.length})</option>
            {schools.map((sch) => (
              <option key={sch.id} value={sch.id}>
                {sch.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Specialization Co-Teaching Board */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-violet-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Specialization Co-Teaching Slots (Max 2 Teachers per Specialization)
            </h3>
          </div>
          {!permissions.canAssignTeachersToSpecializations && (
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              Assignment disabled by Admin policy
            </span>
          )}
        </div>

        {filteredSchools.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 text-center">
            No schools or specializations match your filter.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSchools.map((school) => (
              <div key={school.id} className="p-5 space-y-3">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  {school.name}
                </div>
                {school.specializations.length === 0 ? (
                  <p className="text-xs text-slate-400">No specializations added yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {school.specializations.map((spec) => {
                      const assignedIds = getAssignedTeacherIdsForSpec(
                        school,
                        spec,
                        activeTeachers
                      );
                      const assignedCoTeachers = assignedIds.map((id) => {
                        const fromUsers = activeTeachers.find((t) => t.id === id);
                        const fromSpec = (spec.coTeachers || []).find((c) => c.id === id);
                        return {
                          id,
                          fullName: fromUsers?.fullName || fromSpec?.fullName || 'Teacher',
                          avatarUrl: fromUsers?.avatarUrl || fromSpec?.avatarUrl,
                        };
                      });
                      const isFull = assignedCoTeachers.length >= MAX_CO_TEACHERS;
                      const availableCandidates = activeTeachers.filter(
                        (t) => !assignedIds.includes(t.id)
                      );
                      const isSaving = savingSpecId === spec.id;

                      return (
                        <div
                          key={spec.id}
                          className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900">{spec.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isFull
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : assignedCoTeachers.length === 1
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {isFull
                                ? '2/2 Co-Teaching Full'
                                : `${assignedCoTeachers.length}/2 Assigned`}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {assignedCoTeachers.length === 0 ? (
                              <span className="text-xs text-slate-400">
                                No teacher accounts assigned yet
                              </span>
                            ) : (
                              assignedCoTeachers.map((ct) => (
                                <span
                                  key={ct.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                                >
                                  <span>{ct.fullName}</span>
                                  {permissions.canAssignTeachersToSpecializations && (
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => handleRemoveTeacher(school, spec, ct.id)}
                                      aria-label={`Remove ${ct.fullName} from ${spec.name}`}
                                      className="text-slate-400 hover:text-rose-600 transition-colors"
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </span>
                              ))
                            )}
                          </div>

                          {permissions.canAssignTeachersToSpecializations && !isFull && (
                            <div className="flex gap-2">
                              <select
                                aria-label={`Assign co-teacher to ${spec.name}`}
                                value={selectedTeacherBySpec[spec.id] || ''}
                                onChange={(e) =>
                                  setSelectedTeacherBySpec((prev) => ({
                                    ...prev,
                                    [spec.id]: e.target.value,
                                  }))
                                }
                                className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                              >
                                <option value="">Select teacher...</option>
                                {availableCandidates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.fullName} ({t.email})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!selectedTeacherBySpec[spec.id] || isSaving}
                                onClick={() => handleAssignTeacher(school, spec)}
                                aria-label={`Assign to ${spec.name}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-45 whitespace-nowrap"
                              >
                                <Plus size={13} /> Assign
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete Teacher Roster Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <UserCheck size={16} className="text-violet-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Teacher Directory ({filteredTeachers.length})
          </h3>
        </div>

        {filteredTeachers.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 text-center">
            No teachers found matching your filter.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTeachers.map((teacher) => {
              const assignedSpecSet = new Set<string>();
              const schoolWideIds = new Set<string>();
              for (const a of teacher.assignments) {
                if (a.specializationId === null) {
                  schoolWideIds.add(a.schoolId);
                } else {
                  assignedSpecSet.add(a.specializationId);
                }
              }

              const assignedLabels = allSpecializations.filter(
                (item) =>
                  schoolWideIds.has(item.schoolId) || assignedSpecSet.has(item.specId)
              );
              const availableLabels = allSpecializations.filter(
                (item) =>
                  !schoolWideIds.has(item.schoolId) && !assignedSpecSet.has(item.specId)
              );

              return (
                <div key={teacher.id} className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PortraitAvatar
                        src={teacher.avatarUrl}
                        name={teacher.fullName}
                        size="sm"
                        tone="violet"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {teacher.fullName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              teacher.isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {teacher.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">{teacher.email}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Assigned Schools &amp; Specializations ({assignedLabels.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {assignedLabels.length === 0 ? (
                          <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            Unassigned
                          </span>
                        ) : (
                          assignedLabels.map((item) => (
                            <span
                              key={item.specId}
                              className="bg-violet-50 border border-violet-200 text-violet-900 px-2 py-0.5 rounded-md font-medium"
                            >
                              {item.schoolName}: {item.specName}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Available Specializations ({availableLabels.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {availableLabels.length === 0 ? (
                          <span className="text-slate-400">Assigned to all specializations</span>
                        ) : (
                          availableLabels.map((item) => (
                            <span
                              key={item.specId}
                              className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md"
                            >
                              {item.schoolName}: {item.specName}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

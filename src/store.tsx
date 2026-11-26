import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  School,
  RubricEvaluation,
  AttendanceStatus,
  AttendanceVerificationMeta,
  StudentProfileInput,
  QueryPreset,
  SystemSettings,
  ManagedUser,
  AuditLogEntry,
  UserRole,
} from './types';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import {
  DEFAULT_SYSTEM_SETTINGS,
  RolePermissions,
  filterSchoolsForUser,
  getRolePermissions,
} from './services/permissions';
import {
  dbAddRubricCriterion,
  dbAdminDeleteUser,
  dbAdminResetUserPassword,
  dbAssignSpecializationTeachers,
  dbCreateManagedUser,
  dbCreateSchool,
  dbCreateSpecialization,
  dbCreateStudentsBulk,
  dbDeleteEvaluation,
  dbDeleteQueryPreset,
  dbDeleteRubricCriterion,
  dbDeleteSchool,
  dbDeleteSpecialization,
  dbDeleteStudent,
  dbImportSchools,
  dbSaveEvaluation,
  dbSaveQueryPreset,
  dbSetAttendance,
  dbUpdateManagedUserAccess,
  dbUpdateSchool,
  dbUpdateSpecializationTeacher,
  dbUpdateStudentFaceDescriptors,
  dbUpdateSystemSettings,
  dbUpsertStudent,
  fetchWorkspaceSnapshot,
} from './services/supabaseDb';

interface StoreContextType {
  schools: School[];
  savedPresets: QueryPreset[];
  systemSettings: SystemSettings;
  permissions: RolePermissions;
  managedUsers: ManagedUser[];
  auditLogs: AuditLogEntry[];
  isHydrated: boolean;
  isLoadingData: boolean;
  refreshWorkspace: () => Promise<void>;
  addSchool: (name: string, logo?: string) => School;
  deleteSchool: (id: string) => void;
  updateSchool: (id: string, name: string, logo?: string) => void;
  addSpecialization: (schoolId: string, name: string, teacherName?: string) => void;
  deleteSpecialization: (schoolId: string, specId: string) => void;
  updateSpecializationTeacher: (
    schoolId: string,
    specId: string,
    teacherName: string,
    teacherPhoto?: string
  ) => void;
  addStudent: (schoolId: string, specId: string, profile: StudentProfileInput) => void;
  addStudentsBulk: (schoolId: string, specId: string, profiles: StudentProfileInput[]) => number;
  deleteStudent: (schoolId: string, specId: string, studentId: string) => void;
  updateStudent: (
    schoolId: string,
    specId: string,
    studentId: string,
    profile: StudentProfileInput
  ) => void;
  updateStudentFaceDescriptors: (
    schoolId: string,
    specId: string,
    studentId: string,
    descriptors: number[][]
  ) => void;
  updateAttendance: (
    schoolId: string,
    specId: string,
    studentId: string,
    date: string,
    status: AttendanceStatus | null,
    meta?: AttendanceVerificationMeta
  ) => void;
  addRubricCriterion: (schoolId: string, specId: string, name: string) => void;
  deleteRubricCriterion: (schoolId: string, specId: string, criterionId: string) => void;
  saveEvaluation: (
    schoolId: string,
    specId: string,
    studentId: string,
    evaluation: RubricEvaluation
  ) => void;
  deleteEvaluation: (
    schoolId: string,
    specId: string,
    studentId: string,
    evaluationId: string
  ) => void;
  addQueryPreset: (preset: Omit<QueryPreset, 'id'>) => QueryPreset;
  deleteQueryPreset: (presetId: string) => void;
  updateSystemSettings: (next: SystemSettings) => Promise<void>;
  updateManagedUserAccess: (input: {
    userId: string;
    role: UserRole;
    isActive: boolean;
    fullName: string;
    avatarUrl?: string | null;
    assignments: { schoolId: string; specializationId: string | null }[];
  }) => Promise<void>;
  createManagedUserAccount: (input: {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    assignments: { schoolId: string; specializationId: string | null }[];
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  assignSpecializationTeachers: (
    schoolId: string,
    specId: string,
    teacherIds: string[]
  ) => Promise<void>;
  resetUserPassword: (userId: string, newPassword: string) => Promise<void>;
  deleteManagedUser: (userId: string) => Promise<void>;
  importLegacyJsonToCloud: (schoolsToImport: School[]) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { profile, assignments, refreshAccessContext } = useAuth();
  const { showToast } = useToast();

  const [rawSchools, setRawSchools] = useState<School[]>([]);
  const [savedPresets, setSavedPresets] = useState<QueryPreset[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const permissions = useMemo(
    () => getRolePermissions(profile?.role || 'teacher', systemSettings),
    [profile?.role, systemSettings]
  );

  const schools = useMemo(
    () =>
      profile
        ? filterSchoolsForUser(rawSchools, profile.role, assignments)
        : rawSchools,
    [rawSchools, profile, assignments]
  );

  const refreshWorkspace = useCallback(async () => {
    if (!profile) {
      setRawSchools([]);
      setSavedPresets([]);
      setManagedUsers([]);
      setAuditLogs([]);
      setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
      setIsHydrated(true);
      return;
    }

    setIsLoadingData(true);
    try {
      const [, snap] = await Promise.all([
        refreshAccessContext ? refreshAccessContext() : Promise.resolve(),
        fetchWorkspaceSnapshot(profile),
      ]);
      setRawSchools(snap.schools);
      setSavedPresets(snap.presets);
      setSystemSettings(snap.systemSettings);
      setManagedUsers(snap.managedUsers);
      setAuditLogs(snap.auditLogs);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to load data from Supabase.',
        'error'
      );
    } finally {
      setIsLoadingData(false);
      setIsHydrated(true);
    }
  }, [profile, refreshAccessContext, showToast]);

  const profileId = profile?.id ?? null;
  const profileRole = profile?.role ?? null;

  useEffect(() => {
    void refreshWorkspace();
    // Only re-fetch automatically when authenticated user identity or role changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, profileRole]);

  const runDbMutation = useCallback(
    async (task: () => Promise<void>, errorMessage: string) => {
      try {
        await task();
      } catch (err) {
        showToast(err instanceof Error ? err.message : errorMessage, 'error');
        void refreshWorkspace();
      }
    },
    [showToast, refreshWorkspace]
  );

  const addSchool = useCallback(
    (name: string, logo?: string): School => {
      const id = crypto.randomUUID();
      const created: School = {
        id,
        name: name.trim(),
        logo: logo || undefined,
        specializations: [],
      };
      setRawSchools((prev) => [...prev, created]);
      if (profile) {
        void runDbMutation(async () => {
          const uploadedUrl = await dbCreateSchool(profile, id, name, logo);
          if (uploadedUrl && uploadedUrl !== logo) {
            setRawSchools((prev) =>
              prev.map((s) => (s.id === id ? { ...s, logo: uploadedUrl } : s))
            );
          }
          // Re-hydrate so database trigger-seeded default specializations appear immediately
          await refreshWorkspace();
        }, 'Could not create school in Supabase.');
      }
      return created;
    },
    [profile, runDbMutation, refreshWorkspace]
  );

  const deleteSchool = useCallback(
    (id: string) => {
      setRawSchools((prev) => prev.filter((s) => s.id !== id));
      if (profile) {
        void runDbMutation(
          () => dbDeleteSchool(profile, id),
          'Could not delete school from Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const updateSchool = useCallback(
    (id: string, name: string, logo?: string) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, name: name.trim() || s.name, logo: logo || undefined } : s
        )
      );
      if (profile) {
        void runDbMutation(async () => {
          const uploadedUrl = await dbUpdateSchool(profile, id, name, logo);
          if (uploadedUrl && uploadedUrl !== logo) {
            setRawSchools((prev) =>
              prev.map((s) => (s.id === id ? { ...s, logo: uploadedUrl } : s))
            );
          }
        }, 'Could not update school in Supabase.');
      }
    },
    [profile, runDbMutation]
  );

  const addSpecialization = useCallback(
    (schoolId: string, name: string, teacherName = '') => {
      const id = crypto.randomUUID();
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: [
                  ...s.specializations,
                  {
                    id,
                    name: name.trim(),
                    teacherName,
                    students: [],
                    rubricCriteria: [],
                  },
                ],
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbCreateSpecialization(profile, id, schoolId, name, teacherName),
          'Could not create specialization in Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const deleteSpecialization = useCallback(
    (schoolId: string, specId: string) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.filter((sp) => sp.id !== specId),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbDeleteSpecialization(profile, schoolId, specId),
          'Could not delete specialization in Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const updateSpecializationTeacher = useCallback(
    (schoolId: string, specId: string, teacherName: string, teacherPhoto?: string) => {
      setRawSchools((prev) =>
        prev.map((s) => {
          if (s.id !== schoolId) return s;
          return {
            ...s,
            specializations: s.specializations.map((sp) => {
              if (sp.id !== specId) return sp;
              const prevTeacher = sp.teacherName || '';
              return {
                ...sp,
                teacherName,
                teacherPhoto,
                students: sp.students.map((st) => ({
                  ...st,
                  teacherName:
                    !st.teacherName || st.teacherName === prevTeacher
                      ? teacherName
                      : st.teacherName,
                })),
              };
            }),
          };
        })
      );
      if (profile) {
        void runDbMutation(async () => {
          const uploadedUrl = await dbUpdateSpecializationTeacher(
            profile,
            schoolId,
            specId,
            teacherName,
            teacherPhoto
          );
          if (uploadedUrl && uploadedUrl !== teacherPhoto) {
            setRawSchools((prev) =>
              prev.map((s) =>
                s.id !== schoolId
                  ? s
                  : {
                      ...s,
                      specializations: s.specializations.map((sp) =>
                        sp.id === specId ? { ...sp, teacherPhoto: uploadedUrl } : sp
                      ),
                    }
              )
            );
          }
        }, 'Could not update teacher profile in Supabase.');
      }
    },
    [profile, runDbMutation]
  );

  const addStudent = useCallback(
    (schoolId: string, specId: string, studentInput: StudentProfileInput) => {
      const studentId = crypto.randomUUID();
      setRawSchools((prev) =>
        prev.map((s) => {
          if (s.id !== schoolId) return s;
          return {
            ...s,
            specializations: s.specializations.map((sp) => {
              if (sp.id !== specId) return sp;
              return {
                ...sp,
                students: [
                  ...sp.students,
                  {
                    id: studentId,
                    name: studentInput.name.trim(),
                    rollNo: (studentInput.rollNo || '').trim(),
                    gradeLevel: studentInput.gradeLevel.trim(),
                    gender: studentInput.gender.trim(),
                    contactNo: studentInput.contactNo.trim(),
                    teacherName: studentInput.teacherName.trim() || sp.teacherName || '',
                    photo: studentInput.photo || undefined,
                    teacherPhoto: studentInput.teacherPhoto || undefined,
                    faceDescriptors:
                      studentInput.faceDescriptors && studentInput.faceDescriptors.length > 0
                        ? studentInput.faceDescriptors
                        : undefined,
                    faceEnrolledAt:
                      studentInput.faceDescriptors && studentInput.faceDescriptors.length > 0
                        ? new Date().toISOString()
                        : undefined,
                    customFields: studentInput.customFields,
                    attendance: {},
                    evaluations: [],
                  },
                ],
              };
            }),
          };
        })
      );

      if (profile) {
        void runDbMutation(
          () => dbUpsertStudent(profile, 'create', schoolId, specId, studentId, studentInput).then(() => {}),
          'Could not save student to Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const addStudentsBulk = useCallback(
    (schoolId: string, specId: string, studentInputs: StudentProfileInput[]): number => {
      const validInputs = studentInputs.filter((s) => s.name.trim().length > 0);
      if (validInputs.length === 0) return 0;

      const items = validInputs.map((input) => ({
        id: crypto.randomUUID(),
        profile: {
          ...input,
          rollNo: (input.rollNo || '').trim(),
        },
      }));

      setRawSchools((prev) =>
        prev.map((s) => {
          if (s.id !== schoolId) return s;
          return {
            ...s,
            specializations: s.specializations.map((sp) => {
              if (sp.id !== specId) return sp;
              const newStudents = items.map(({ id, profile: st }) => ({
                id,
                name: st.name.trim(),
                rollNo: st.rollNo,
                gradeLevel: st.gradeLevel.trim(),
                gender: st.gender.trim(),
                contactNo: st.contactNo.trim(),
                teacherName: st.teacherName.trim() || sp.teacherName || '',
                customFields: st.customFields,
                attendance: {},
                evaluations: [],
              }));
              return {
                ...sp,
                students: [...sp.students, ...newStudents],
              };
            }),
          };
        })
      );

      if (profile) {
        void runDbMutation(
          () => dbCreateStudentsBulk(profile, schoolId, specId, items),
          'Could not import CSV students to Supabase.'
        );
      }
      return items.length;
    },
    [profile, runDbMutation]
  );

  const deleteStudent = useCallback(
    (schoolId: string, specId: string, studentId: string) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) =>
                  sp.id !== specId
                    ? sp
                    : { ...sp, students: sp.students.filter((st) => st.id !== studentId) }
                ),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbDeleteStudent(profile, schoolId, studentId),
          'Could not delete student from Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const updateStudent = useCallback(
    (schoolId: string, specId: string, studentId: string, studentInput: StudentProfileInput) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) =>
                  sp.id !== specId
                    ? sp
                    : {
                        ...sp,
                        students: sp.students.map((st) =>
                          st.id === studentId
                            ? {
                                ...st,
                                name: studentInput.name.trim(),
                                rollNo: (studentInput.rollNo || '').trim(),
                                gradeLevel: studentInput.gradeLevel.trim(),
                                gender: studentInput.gender.trim(),
                                contactNo: studentInput.contactNo.trim(),
                                teacherName: studentInput.teacherName.trim(),
                                photo: studentInput.photo || undefined,
                                teacherPhoto: studentInput.teacherPhoto || undefined,
                                faceDescriptors:
                                  studentInput.faceDescriptors !== undefined
                                    ? studentInput.faceDescriptors.length > 0
                                      ? studentInput.faceDescriptors
                                      : undefined
                                    : st.faceDescriptors,
                                faceEnrolledAt:
                                  studentInput.faceDescriptors !== undefined
                                    ? studentInput.faceDescriptors.length > 0
                                      ? st.faceEnrolledAt || new Date().toISOString()
                                      : undefined
                                    : st.faceEnrolledAt,
                                customFields: studentInput.customFields,
                              }
                            : st
                        ),
                      }
                ),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbUpsertStudent(profile, 'update', schoolId, specId, studentId, studentInput).then(() => {}),
          'Could not update student in Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const updateStudentFaceDescriptors = useCallback(
    (schoolId: string, specId: string, studentId: string, descriptors: number[][]) => {
      const enrolledAt = descriptors.length > 0 ? new Date().toISOString() : undefined;
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) =>
                  sp.id !== specId
                    ? sp
                    : {
                        ...sp,
                        students: sp.students.map((st) =>
                          st.id === studentId
                            ? {
                                ...st,
                                faceDescriptors: descriptors.length > 0 ? descriptors : undefined,
                                faceEnrolledAt: enrolledAt,
                              }
                            : st
                        ),
                      }
                ),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbUpdateStudentFaceDescriptors(profile, schoolId, studentId, descriptors),
          'Could not save face enrollment to Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const updateAttendance = useCallback(
    (
      schoolId: string,
      specId: string,
      studentId: string,
      date: string,
      status: AttendanceStatus | null,
      meta?: AttendanceVerificationMeta
    ) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) =>
                  sp.id !== specId
                    ? sp
                    : {
                        ...sp,
                        students: sp.students.map((st) => {
                          if (st.id !== studentId) return st;
                          const next = { ...st.attendance };
                          const nextMeta = { ...(st.attendanceMeta || {}) };
                          if (status === null) {
                            delete next[date];
                            delete nextMeta[date];
                          } else {
                            next[date] = status;
                            if (meta) {
                              nextMeta[date] = meta;
                            } else {
                              delete nextMeta[date];
                            }
                          }
                          return {
                            ...st,
                            attendance: next,
                            attendanceMeta:
                              Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
                          };
                        }),
                      }
                ),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbSetAttendance(profile, schoolId, studentId, date, status, meta),
          'Could not save attendance to Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const addRubricCriterion = useCallback(
    (schoolId: string, specId: string, name: string) => {
      const id = crypto.randomUUID();
      let sortOrder = 0;
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) => {
                  if (sp.id !== specId) return sp;
                  sortOrder = sp.rubricCriteria.length;
                  return {
                    ...sp,
                    rubricCriteria: [...sp.rubricCriteria, { id, name: name.trim() }],
                  };
                }),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbAddRubricCriterion(profile, id, schoolId, specId, name, sortOrder),
          'Could not save rubric criterion to Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const deleteRubricCriterion = useCallback(
    (schoolId: string, specId: string, criterionId: string) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) =>
                  sp.id !== specId
                    ? sp
                    : {
                        ...sp,
                        rubricCriteria: sp.rubricCriteria.filter((c) => c.id !== criterionId),
                        students: sp.students.map((st) => ({
                          ...st,
                          evaluations: st.evaluations
                            .map((ev) => {
                              if (!(criterionId in ev.scores)) return ev;
                              const nextScores = { ...ev.scores };
                              delete nextScores[criterionId];
                              return { ...ev, scores: nextScores };
                            })
                            .filter((ev) => Object.keys(ev.scores).length > 0),
                        })),
                      }
                ),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbDeleteRubricCriterion(profile, schoolId, criterionId),
          'Could not delete rubric criterion from Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const saveEvaluation = useCallback(
    (schoolId: string, specId: string, studentId: string, evaluation: RubricEvaluation) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) =>
                  sp.id !== specId
                    ? sp
                    : {
                        ...sp,
                        students: sp.students.map((st) => {
                          if (st.id !== studentId) return st;
                          const idx = st.evaluations.findIndex((e) => e.id === evaluation.id);
                          const next = [...st.evaluations];
                          if (idx >= 0) next[idx] = evaluation;
                          else next.push(evaluation);
                          return { ...st, evaluations: next };
                        }),
                      }
                ),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbSaveEvaluation(profile, schoolId, studentId, evaluation),
          'Could not save rubric grade to Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const deleteEvaluation = useCallback(
    (schoolId: string, specId: string, studentId: string, evaluationId: string) => {
      setRawSchools((prev) =>
        prev.map((s) =>
          s.id !== schoolId
            ? s
            : {
                ...s,
                specializations: s.specializations.map((sp) =>
                  sp.id !== specId
                    ? sp
                    : {
                        ...sp,
                        students: sp.students.map((st) =>
                          st.id !== studentId
                            ? st
                            : {
                                ...st,
                                evaluations: st.evaluations.filter((e) => e.id !== evaluationId),
                              }
                        ),
                      }
                ),
              }
        )
      );
      if (profile) {
        void runDbMutation(
          () => dbDeleteEvaluation(profile, schoolId, evaluationId),
          'Could not delete rubric evaluation from Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const addQueryPreset = useCallback(
    (preset: Omit<QueryPreset, 'id'>): QueryPreset => {
      const created: QueryPreset = { ...preset, id: crypto.randomUUID(), isBuiltIn: false };
      setSavedPresets((prev) => [...prev, created]);
      if (profile) {
        void runDbMutation(
          () => dbSaveQueryPreset(profile.id, created),
          'Could not save query preset to Supabase.'
        );
      }
      return created;
    },
    [profile, runDbMutation]
  );

  const deleteQueryPreset = useCallback(
    (presetId: string) => {
      setSavedPresets((prev) => prev.filter((p) => p.id !== presetId));
      if (profile) {
        void runDbMutation(
          () => dbDeleteQueryPreset(presetId),
          'Could not delete query preset from Supabase.'
        );
      }
    },
    [profile, runDbMutation]
  );

  const updateSystemSettings = useCallback(
    async (next: SystemSettings) => {
      await dbUpdateSystemSettings(profile, next);
      setSystemSettings(next);
    },
    [profile]
  );

  const updateManagedUserAccess = useCallback(
    async (input: {
      userId: string;
      role: UserRole;
      isActive: boolean;
      fullName: string;
      avatarUrl?: string | null;
      assignments: { schoolId: string; specializationId: string | null }[];
    }) => {
      await dbUpdateManagedUserAccess(profile, input);
      await refreshWorkspace();
    },
    [profile, refreshWorkspace]
  );

  const createManagedUserAccount = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      role: UserRole;
      assignments: { schoolId: string; specializationId: string | null }[];
    }) => {
      const result = await dbCreateManagedUser(input, profile);
      await refreshWorkspace();
      return { needsEmailConfirmation: result.needsEmailConfirmation };
    },
    [profile, refreshWorkspace]
  );

  const assignSpecializationTeachers = useCallback(
    async (schoolId: string, specId: string, teacherIds: string[]) => {
      await dbAssignSpecializationTeachers(profile, schoolId, specId, teacherIds);
      await refreshWorkspace();
    },
    [profile, refreshWorkspace]
  );

  const resetUserPassword = useCallback(async (userId: string, newPassword: string) => {
    await dbAdminResetUserPassword(userId, newPassword);
  }, []);

  const deleteManagedUser = useCallback(
    async (userId: string) => {
      await dbAdminDeleteUser(profile, userId);
      await refreshWorkspace();
    },
    [profile, refreshWorkspace]
  );

  const importLegacyJsonToCloud = useCallback(
    async (schoolsToImport: School[]) => {
      await dbImportSchools(profile, schoolsToImport);
      await refreshWorkspace();
    },
    [profile, refreshWorkspace]
  );

  return (
    <StoreContext.Provider
      value={{
        schools,
        savedPresets,
        systemSettings,
        permissions,
        managedUsers,
        auditLogs,
        isHydrated,
        isLoadingData,
        refreshWorkspace,
        addSchool,
        deleteSchool,
        updateSchool,
        addSpecialization,
        deleteSpecialization,
        updateSpecializationTeacher,
        addStudent,
        addStudentsBulk,
        deleteStudent,
        updateStudent,
        updateStudentFaceDescriptors,
        updateAttendance,
        addRubricCriterion,
        deleteRubricCriterion,
        saveEvaluation,
        deleteEvaluation,
        addQueryPreset,
        deleteQueryPreset,
        updateSystemSettings,
        updateManagedUserAccess,
        createManagedUserAccount,
        assignSpecializationTeachers,
        resetUserPassword,
        deleteManagedUser,
        importLegacyJsonToCloud,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}

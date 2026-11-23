import { createEphemeralAuthClient, requireSupabase } from '../lib/supabase';
import {
  AttendanceStatus,
  AuditLogEntry,
  CoTeacherSummary,
  DirectorPermissions,
  ManagedUser,
  QueryPreset,
  RubricEvaluation,
  School,
  Specialization,
  Student,
  StudentProfileInput,
  SystemSettings,
  TeacherAssignment,
  UserProfile,
  UserRole,
} from '../types';
import { DEFAULT_DIRECTOR_PERMISSIONS, DEFAULT_SYSTEM_SETTINGS } from './permissions';

const MEDIA_BUCKET = 'ez-media';

export interface RawWorkspaceRows {
  schools: { id: string; name: string; logo_url?: string | null }[];
  specializations: {
    id: string;
    school_id: string;
    name: string;
    teacher_name?: string | null;
    teacher_photo_url?: string | null;
  }[];
  criteria: {
    id: string;
    school_id: string;
    specialization_id: string;
    name: string;
    sort_order?: number | null;
  }[];
  students: {
    id: string;
    school_id: string;
    specialization_id: string;
    name: string;
    roll_no: string;
    grade_level?: string | null;
    gender?: string | null;
    contact_no?: string | null;
    teacher_name?: string | null;
    photo_url?: string | null;
    teacher_photo_url?: string | null;
    custom_fields?: Record<string, string> | null;
  }[];
  attendance: {
    student_id: string;
    attendance_date: string;
    status: string;
  }[];
  evaluations: {
    id: string;
    student_id: string;
    eval_date: string;
  }[];
  scores: {
    evaluation_id: string;
    criterion_id: string;
    score: number | string;
  }[];
  coTeachersBySpec?: Map<string, CoTeacherSummary[]>;
}

export function assembleWorkspaceSchools(rows: RawWorkspaceRows): School[] {
  const schoolMap = new Map<string, School>();
  const specMap = new Map<string, Specialization>();
  const studentMap = new Map<string, Student>();
  const evalMap = new Map<string, RubricEvaluation>();

  for (const s of rows.schools) {
    const school: School = {
      id: s.id,
      name: s.name,
      logo: s.logo_url || undefined,
      specializations: [],
    };
    schoolMap.set(s.id, school);
  }

  for (const sp of rows.specializations) {
    const school = schoolMap.get(sp.school_id);
    if (!school) continue;
    const coTeachers = rows.coTeachersBySpec?.get(sp.id) || [];
    const fallbackNames = coTeachers.map((t) => t.fullName).join(' & ');
    const spec: Specialization = {
      id: sp.id,
      name: sp.name,
      teacherName: sp.teacher_name || fallbackNames || '',
      teacherPhoto: sp.teacher_photo_url || coTeachers[0]?.avatarUrl || undefined,
      coTeachers: coTeachers.length > 0 ? coTeachers : undefined,
      students: [],
      rubricCriteria: [],
    };
    school.specializations.push(spec);
    specMap.set(sp.id, spec);
  }

  const sortedCriteria = [...rows.criteria].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  for (const cr of sortedCriteria) {
    const spec = specMap.get(cr.specialization_id);
    if (!spec) continue;
    spec.rubricCriteria.push({ id: cr.id, name: cr.name });
  }

  for (const st of rows.students) {
    const spec = specMap.get(st.specialization_id);
    if (!spec) continue;
    const student: Student = {
      id: st.id,
      name: st.name,
      rollNo: st.roll_no,
      gradeLevel: st.grade_level || '',
      gender: st.gender || '',
      contactNo: st.contact_no || '',
      teacherName: st.teacher_name || spec.teacherName || '',
      photo: st.photo_url || undefined,
      teacherPhoto: st.teacher_photo_url || undefined,
      customFields: st.custom_fields || undefined,
      attendance: {},
      evaluations: [],
    };
    spec.students.push(student);
    studentMap.set(st.id, student);
  }

  for (const att of rows.attendance) {
    const student = studentMap.get(att.student_id);
    if (!student) continue;
    if (att.status === 'Present' || att.status === 'Absent') {
      student.attendance[att.attendance_date] = att.status;
    }
  }

  for (const ev of rows.evaluations) {
    const student = studentMap.get(ev.student_id);
    if (!student) continue;
    const evaluation: RubricEvaluation = {
      id: ev.id,
      date: ev.eval_date,
      scores: {},
    };
    student.evaluations.push(evaluation);
    evalMap.set(ev.id, evaluation);
  }

  for (const sc of rows.scores) {
    const evaluation = evalMap.get(sc.evaluation_id);
    if (!evaluation) continue;
    const num = Number(sc.score);
    if (!Number.isNaN(num)) {
      evaluation.scores[sc.criterion_id] = num;
    }
  }

  return Array.from(schoolMap.values());
}

function mapSystemSettingsRow(row: Record<string, unknown> | null): SystemSettings {
  if (!row) return DEFAULT_SYSTEM_SETTINGS;
  return {
    portalName: String(row.portal_name || DEFAULT_SYSTEM_SETTINGS.portalName),
    primaryColor: String(row.primary_color || DEFAULT_SYSTEM_SETTINGS.primaryColor),
    attendanceThreshold: Number(
      row.attendance_threshold ?? DEFAULT_SYSTEM_SETTINGS.attendanceThreshold
    ),
    rubricMin: Number(row.rubric_min ?? DEFAULT_SYSTEM_SETTINGS.rubricMin),
    rubricMax: Number(row.rubric_max ?? DEFAULT_SYSTEM_SETTINGS.rubricMax),
    rubricLabels:
      row.rubric_labels && typeof row.rubric_labels === 'object'
        ? (row.rubric_labels as Record<string, string>)
        : DEFAULT_SYSTEM_SETTINGS.rubricLabels,
    customStudentFields: Array.isArray(row.custom_student_fields)
      ? (row.custom_student_fields as SystemSettings['customStudentFields'])
      : [],
    directorCanEdit:
      typeof row.director_can_edit === 'boolean'
        ? row.director_can_edit
        : DEFAULT_SYSTEM_SETTINGS.directorCanEdit,
    directorPermissions:
      row.director_permissions && typeof row.director_permissions === 'object'
        ? {
            ...DEFAULT_DIRECTOR_PERMISSIONS,
            ...(row.director_permissions as Partial<DirectorPermissions>),
          }
        : DEFAULT_DIRECTOR_PERMISSIONS,
  };
}

function buildCoTeachersBySpecFromUsers(
  specs: { id: string; school_id: string }[],
  users: ManagedUser[]
): Map<string, CoTeacherSummary[]> {
  const bySpec = new Map<string, CoTeacherSummary[]>();
  const activeTeachers = users.filter((u) => u.role === 'teacher' && u.isActive);
  for (const sp of specs) {
    const matched = activeTeachers
      .filter((t) =>
        t.assignments.some(
          (a) =>
            a.schoolId === sp.school_id &&
            (a.specializationId === sp.id || a.specializationId === null)
        )
      )
      .map((t) => ({ id: t.id, fullName: t.fullName, avatarUrl: t.avatarUrl }));
    if (matched.length > 0) {
      bySpec.set(sp.id, matched);
    }
  }
  return bySpec;
}

async function fetchTeacherCoTeachersBySpec(): Promise<Map<string, CoTeacherSummary[]>> {
  const bySpec = new Map<string, CoTeacherSummary[]>();
  try {
    const client = requireSupabase();
    const { data, error } = await client.rpc('list_shared_specialization_teachers');
    if (error || !Array.isArray(data)) return bySpec;
    for (const row of data as {
      specialization_id: string;
      teacher_id: string;
      full_name?: string | null;
      avatar_url?: string | null;
    }[]) {
      const list = bySpec.get(row.specialization_id) || [];
      list.push({
        id: row.teacher_id,
        fullName: row.full_name || 'Teacher',
        avatarUrl: row.avatar_url || undefined,
      });
      bySpec.set(row.specialization_id, list);
    }
  } catch {
    // Graceful fallback before 005_upgrade_rbac_and_coteaching.sql is applied
  }
  return bySpec;
}

export interface WorkspaceSnapshot {
  schools: School[];
  systemSettings: SystemSettings;
  presets: QueryPreset[];
  managedUsers: ManagedUser[];
  auditLogs: AuditLogEntry[];
}

export async function fetchWorkspaceSnapshot(profile: UserProfile): Promise<WorkspaceSnapshot> {
  const client = requireSupabase();

  const [
    settingsRes,
    schoolsRes,
    specsRes,
    criteriaRes,
    studentsRes,
    attRes,
    evalsRes,
    scoresRes,
    presetsRes,
  ] = await Promise.all([
    client.from('system_settings').select('*').eq('id', 1).maybeSingle(),
    client.from('schools').select('id, name, logo_url').order('name'),
    client
      .from('specializations')
      .select('id, school_id, name, teacher_name, teacher_photo_url')
      .order('name'),
    client
      .from('rubric_criteria')
      .select('id, school_id, specialization_id, name, sort_order')
      .order('sort_order'),
    client
      .from('students')
      .select(
        'id, school_id, specialization_id, name, roll_no, grade_level, gender, contact_no, teacher_name, photo_url, teacher_photo_url, custom_fields'
      )
      .order('name'),
    client.from('attendance_logs').select('student_id, attendance_date, status'),
    client.from('rubric_evaluations').select('id, student_id, eval_date'),
    client.from('rubric_scores').select('evaluation_id, criterion_id, score'),
    client.from('query_presets').select('id, name, is_shared, config').order('created_at'),
  ]);

  const presets: QueryPreset[] = (presetsRes.data || []).map((row) => ({
    ...(row.config as Omit<QueryPreset, 'id' | 'name' | 'isShared'>),
    id: row.id,
    name: row.name,
    isShared: Boolean(row.is_shared),
    isBuiltIn: false,
  }));

  let managedUsers: ManagedUser[] = [];
  let auditLogs: AuditLogEntry[] = [];
  let coTeachersBySpec = new Map<string, CoTeacherSummary[]>();

  if (profile.role === 'admin' || profile.role === 'director') {
    const [profilesRes, assignmentsRes, logsRes] = await Promise.all([
      client
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, is_active')
        .order('email'),
      client
        .from('teacher_school_assignments')
        .select('id, teacher_id, school_id, specialization_id'),
      client
        .from('audit_logs')
        .select(
          'id, actor_id, actor_email, actor_role, action, entity_type, entity_id, school_id, metadata, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const assignByTeacher = new Map<string, TeacherAssignment[]>();
    for (const a of assignmentsRes.data || []) {
      const list = assignByTeacher.get(a.teacher_id) || [];
      list.push({
        id: a.id,
        teacherId: a.teacher_id,
        schoolId: a.school_id,
        specializationId: a.specialization_id ?? null,
      });
      assignByTeacher.set(a.teacher_id, list);
    }

    managedUsers = (profilesRes.data || []).map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name || u.email,
      avatarUrl: u.avatar_url || undefined,
      role: u.role as UserRole,
      isActive: Boolean(u.is_active),
      assignments: assignByTeacher.get(u.id) || [],
    }));

    coTeachersBySpec = buildCoTeachersBySpecFromUsers(specsRes.data || [], managedUsers);

    auditLogs = (logsRes.data || []).map((l) => ({
      id: l.id,
      actorId: l.actor_id,
      actorEmail: l.actor_email,
      actorRole: l.actor_role,
      action: l.action,
      entityType: l.entity_type,
      entityId: l.entity_id,
      schoolId: l.school_id,
      metadata: (l.metadata as Record<string, unknown>) || {},
      createdAt: l.created_at,
    }));
  } else {
    coTeachersBySpec = await fetchTeacherCoTeachersBySpec();
  }

  const schools = assembleWorkspaceSchools({
    schools: schoolsRes.data || [],
    specializations: specsRes.data || [],
    criteria: criteriaRes.data || [],
    students: studentsRes.data || [],
    attendance: attRes.data || [],
    evaluations: evalsRes.data || [],
    scores: scoresRes.data || [],
    coTeachersBySpec,
  });

  return {
    schools,
    systemSettings: mapSystemSettingsRow(settingsRes.data as Record<string, unknown> | null),
    presets,
    managedUsers,
    auditLogs,
  };
}

export async function uploadMediaImageIfNeeded(
  pathPrefix: string,
  value?: string
): Promise<string | undefined> {
  if (!value) return undefined;
  if (!value.startsWith('data:')) return value;

  try {
    const client = requireSupabase();
    const res = await fetch(value);
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    const filePath = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from(MEDIA_BUCKET).upload(filePath, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });
    if (error) {
      // Fallback to inline compressed Data URL if Storage bucket is not initialized yet
      return value;
    }
    const { data } = client.storage.from(MEDIA_BUCKET).getPublicUrl(filePath);
    return data.publicUrl || value;
  } catch {
    return value;
  }
}

export async function recordAuditLog(
  actor: UserProfile | null,
  action: string,
  entityType: string,
  entityId: string | null,
  schoolId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!actor) return;
  try {
    const client = requireSupabase();
    await client.from('audit_logs').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      school_id: schoolId,
      metadata,
    });
  } catch {
    // Audit insert failures never block primary academic workflows
  }
}

export async function dbCreateSchool(
  actor: UserProfile | null,
  id: string,
  name: string,
  logo?: string
): Promise<string | undefined> {
  const client = requireSupabase();
  const logoUrl = await uploadMediaImageIfNeeded(`schools/${id}`, logo);
  const { error } = await client.from('schools').insert({
    id,
    name: name.trim(),
    logo_url: logoUrl || null,
    created_by: actor?.id ?? null,
  });
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'CREATE_SCHOOL', 'schools', id, id, { name: name.trim() });
  return logoUrl;
}

export async function dbUpdateSchool(
  actor: UserProfile | null,
  id: string,
  name: string,
  logo?: string
): Promise<string | undefined> {
  const client = requireSupabase();
  const logoUrl = await uploadMediaImageIfNeeded(`schools/${id}`, logo);
  const { error } = await client
    .from('schools')
    .update({
      name: name.trim(),
      logo_url: logoUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'UPDATE_SCHOOL', 'schools', id, id, { name: name.trim() });
  return logoUrl;
}

export async function dbDeleteSchool(actor: UserProfile | null, id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('schools').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'DELETE_SCHOOL', 'schools', id, id);
}

export async function dbCreateSpecialization(
  actor: UserProfile | null,
  id: string,
  schoolId: string,
  name: string,
  teacherName = ''
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('specializations').insert({
    id,
    school_id: schoolId,
    name: name.trim(),
    teacher_name: teacherName.trim(),
  });
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'CREATE_SPECIALIZATION', 'specializations', id, schoolId, { name });
}

export async function dbDeleteSpecialization(
  actor: UserProfile | null,
  schoolId: string,
  specId: string
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('specializations').delete().eq('id', specId);
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'DELETE_SPECIALIZATION', 'specializations', specId, schoolId);
}

export async function dbUpdateSpecializationTeacher(
  actor: UserProfile | null,
  schoolId: string,
  specId: string,
  teacherName: string,
  teacherPhoto?: string
): Promise<string | undefined> {
  const client = requireSupabase();
  const photoUrl = await uploadMediaImageIfNeeded(`teachers/${specId}`, teacherPhoto);
  const { error } = await client
    .from('specializations')
    .update({
      teacher_name: teacherName.trim(),
      teacher_photo_url: photoUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', specId);
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'UPDATE_TEACHER_PROFILE', 'specializations', specId, schoolId, {
    teacherName,
  });
  return photoUrl;
}

export async function dbUpsertStudent(
  actor: UserProfile | null,
  mode: 'create' | 'update',
  schoolId: string,
  specId: string,
  studentId: string,
  profile: StudentProfileInput
): Promise<{ photoUrl?: string; teacherPhotoUrl?: string }> {
  const client = requireSupabase();
  const [photoUrl, teacherPhotoUrl] = await Promise.all([
    uploadMediaImageIfNeeded(`students/${studentId}`, profile.photo),
    uploadMediaImageIfNeeded(`students/${studentId}-teacher`, profile.teacherPhoto),
  ]);

  const row = {
    id: studentId,
    school_id: schoolId,
    specialization_id: specId,
    name: profile.name.trim(),
    roll_no: profile.rollNo.trim(),
    grade_level: profile.gradeLevel.trim(),
    gender: profile.gender.trim(),
    contact_no: profile.contactNo.trim(),
    teacher_name: profile.teacherName.trim(),
    photo_url: photoUrl || null,
    teacher_photo_url: teacherPhotoUrl || null,
    custom_fields: profile.customFields || {},
    updated_at: new Date().toISOString(),
  };

  if (mode === 'create') {
    const { error } = await client
      .from('students')
      .insert({ ...row, created_by: actor?.id ?? null });
    if (error) throw new Error(error.message);
    await recordAuditLog(actor, 'CREATE_STUDENT', 'students', studentId, schoolId, {
      name: row.name,
    });
  } else {
    const { error } = await client.from('students').update(row).eq('id', studentId);
    if (error) throw new Error(error.message);
    await recordAuditLog(actor, 'UPDATE_STUDENT', 'students', studentId, schoolId, {
      name: row.name,
    });
  }

  return { photoUrl, teacherPhotoUrl };
}

export async function dbDeleteStudent(
  actor: UserProfile | null,
  schoolId: string,
  studentId: string
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('students').delete().eq('id', studentId);
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'DELETE_STUDENT', 'students', studentId, schoolId);
}

export async function dbSetAttendance(
  actor: UserProfile | null,
  schoolId: string,
  studentId: string,
  date: string,
  status: AttendanceStatus | null
): Promise<void> {
  const client = requireSupabase();
  if (status === null) {
    const { error } = await client
      .from('attendance_logs')
      .delete()
      .eq('student_id', studentId)
      .eq('attendance_date', date);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from('attendance_logs').upsert(
      {
        student_id: studentId,
        school_id: schoolId,
        attendance_date: date,
        status,
        marked_by: actor?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,attendance_date' }
    );
    if (error) throw new Error(error.message);
  }
  await recordAuditLog(actor, 'MARK_ATTENDANCE', 'attendance_logs', studentId, schoolId, {
    date,
    status: status ?? 'Cleared',
  });
}

export async function dbAddRubricCriterion(
  actor: UserProfile | null,
  id: string,
  schoolId: string,
  specId: string,
  name: string,
  sortOrder: number
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('rubric_criteria').insert({
    id,
    school_id: schoolId,
    specialization_id: specId,
    name: name.trim(),
    sort_order: sortOrder,
    created_by: actor?.id ?? null,
  });
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'CREATE_RUBRIC_CRITERION', 'rubric_criteria', id, schoolId, {
    name: name.trim(),
  });
}

export async function dbDeleteRubricCriterion(
  actor: UserProfile | null,
  schoolId: string,
  criterionId: string
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('rubric_criteria').delete().eq('id', criterionId);
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'DELETE_RUBRIC_CRITERION', 'rubric_criteria', criterionId, schoolId);
}

export async function dbSaveEvaluation(
  actor: UserProfile | null,
  schoolId: string,
  studentId: string,
  evaluation: RubricEvaluation
): Promise<void> {
  const client = requireSupabase();
  const { data: upserted, error: evalErr } = await client
    .from('rubric_evaluations')
    .upsert(
      {
        id: evaluation.id,
        student_id: studentId,
        school_id: schoolId,
        eval_date: evaluation.date,
        graded_by: actor?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,eval_date' }
    )
    .select('id')
    .single();

  if (evalErr || !upserted) throw new Error(evalErr?.message || 'Failed to save evaluation.');

  const evalId = upserted.id;
  await client.from('rubric_scores').delete().eq('evaluation_id', evalId);

  const scoreRows = Object.entries(evaluation.scores).map(([criterionId, score]) => ({
    evaluation_id: evalId,
    criterion_id: criterionId,
    score,
  }));

  if (scoreRows.length > 0) {
    const { error: scoreErr } = await client.from('rubric_scores').insert(scoreRows);
    if (scoreErr) throw new Error(scoreErr.message);
  }

  await recordAuditLog(actor, 'SAVE_EVALUATION', 'rubric_evaluations', evalId, schoolId, {
    studentId,
    date: evaluation.date,
  });
}

export async function dbDeleteEvaluation(
  actor: UserProfile | null,
  schoolId: string,
  evaluationId: string
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('rubric_evaluations').delete().eq('id', evaluationId);
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'DELETE_EVALUATION', 'rubric_evaluations', evaluationId, schoolId);
}

export async function dbSaveQueryPreset(
  ownerId: string,
  preset: QueryPreset
): Promise<void> {
  const client = requireSupabase();
  const { id, name, isShared, ...rest } = preset;
  const { error } = await client.from('query_presets').insert({
    id,
    owner_id: ownerId,
    name,
    is_shared: Boolean(isShared),
    config: rest,
  });
  if (error) throw new Error(error.message);
}

export async function dbDeleteQueryPreset(presetId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('query_presets').delete().eq('id', presetId);
  if (error) throw new Error(error.message);
}

export async function dbUpdateSystemSettings(
  actor: UserProfile | null,
  settings: SystemSettings
): Promise<void> {
  const client = requireSupabase();
  const directorPermissions = settings.directorPermissions || DEFAULT_DIRECTOR_PERMISSIONS;
  const { error } = await client
    .from('system_settings')
    .upsert({
      id: 1,
      portal_name: settings.portalName.trim() || 'EZ Center Portal',
      primary_color: settings.primaryColor,
      attendance_threshold: settings.attendanceThreshold,
      rubric_min: settings.rubricMin,
      rubric_max: settings.rubricMax,
      rubric_labels: settings.rubricLabels,
      custom_student_fields: settings.customStudentFields,
      director_can_edit: settings.directorCanEdit,
      director_permissions: directorPermissions,
      updated_by: actor?.id ?? null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
  await recordAuditLog(actor, 'UPDATE_SETTINGS', 'system_settings', '1', null, {
    portalName: settings.portalName,
    attendanceThreshold: settings.attendanceThreshold,
    rubricRange: `${settings.rubricMin}-${settings.rubricMax}`,
  });
}

export interface CreateManagedUserResult {
  userId: string;
  needsEmailConfirmation: boolean;
}

function isEdgeFunctionUnavailableError(error: {
  name?: string;
  message?: string;
  context?: unknown;
}): boolean {
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
    return true;
  }
  const status = (error.context as { status?: unknown } | undefined)?.status;
  if (typeof status === 'number' && status === 404) {
    return true;
  }
  return /Failed to send a request to the Edge Function|Requested function was not found/i.test(
    error.message || ''
  );
}

async function extractEdgeFunctionError(error: {
  message?: string;
  context?: unknown;
}): Promise<string> {
  const ctx = error.context as { json?: () => Promise<unknown> } | undefined;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = (await ctx.json()) as { error?: string; message?: string } | null;
      if (parsed?.error) return String(parsed.error);
      if (parsed?.message) return String(parsed.message);
    } catch {
      // Fall back to error.message when response body is not JSON.
    }
  }
  return error.message || 'Failed to invoke admin-users Edge Function.';
}

async function applyManagedUserAccess(
  actor: UserProfile | null,
  input: {
    userId: string;
    role: UserRole;
    isActive: boolean;
    fullName: string;
    assignments: { schoolId: string; specializationId: string | null }[];
  },
  auditAction: 'UPDATE_USER_ACCESS' | 'CREATE_USER'
): Promise<void> {
  const client = requireSupabase();
  const { data: updatedProfile, error: profErr } = await client
    .from('profiles')
    .update({
      role: input.role,
      is_active: input.isActive,
      full_name: input.fullName.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.userId)
    .select('id')
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);
  if (!updatedProfile) {
    throw new Error(
      'User profile row was not found. Apply supabase/migrations/004_profile_recovery.sql in Supabase SQL Editor and retry.'
    );
  }

  const { error: delErr } = await client
    .from('teacher_school_assignments')
    .delete()
    .eq('teacher_id', input.userId);
  if (delErr) throw new Error(delErr.message);

  if (input.role === 'teacher' && input.assignments.length > 0) {
    const { error: insErr } = await client.from('teacher_school_assignments').insert(
      input.assignments.map((a) => ({
        teacher_id: input.userId,
        school_id: a.schoolId,
        specialization_id: a.specializationId || null,
        assigned_by: actor?.id ?? null,
      }))
    );
    if (insErr) throw new Error(insErr.message);
  }

  await recordAuditLog(actor, auditAction, 'profiles', input.userId, null, {
    role: input.role,
    isActive: input.isActive,
    assignmentCount: input.assignments.length,
  });
}

export async function dbCreateManagedUser(
  input: {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    assignments: { schoolId: string; specializationId: string | null }[];
  },
  actor: UserProfile | null = null
): Promise<CreateManagedUserResult> {
  const client = requireSupabase();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanName = input.fullName.trim();

  if (!cleanEmail || input.password.length < 8) {
    throw new Error('Valid email and password (min 8 chars) are required.');
  }

  const { data, error } = await client.functions.invoke('admin-users', {
    body: {
      action: 'create_user',
      ...input,
      email: cleanEmail,
      fullName: cleanName,
    },
  });

  if (!error) {
    if (data?.error) throw new Error(String(data.error));
    return { userId: String(data?.userId || ''), needsEmailConfirmation: false };
  }

  if (!isEdgeFunctionUnavailableError(error)) {
    throw new Error(await extractEdgeFunctionError(error));
  }

  // Fallback when the optional 'admin-users' Edge Function is not deployed:
  // register with an isolated non-persistent client so the Admin session stays active,
  // then apply role, name, and assignments via Admin RLS policies.
  const ephemeral = createEphemeralAuthClient();
  const { data: signUpData, error: signUpErr } = await ephemeral.auth.signUp({
    email: cleanEmail,
    password: input.password,
    options: { data: { full_name: cleanName } },
  });

  if (signUpErr) {
    if (/signups not allowed/i.test(signUpErr.message)) {
      throw new Error(
        'Public signups are disabled in Supabase Auth Settings. Either enable "Allow new users to sign up" or deploy the admin-users Edge Function.'
      );
    }
    throw new Error(signUpErr.message);
  }

  const createdUser = signUpData.user;
  if (!createdUser) {
    throw new Error('Failed to create user account in Supabase Auth.');
  }
  if (Array.isArray(createdUser.identities) && createdUser.identities.length === 0) {
    throw new Error('An account with this email already exists.');
  }

  await applyManagedUserAccess(
    actor,
    {
      userId: createdUser.id,
      role: input.role,
      isActive: true,
      fullName: cleanName,
      assignments: input.assignments,
    },
    'CREATE_USER'
  );

  return {
    userId: createdUser.id,
    needsEmailConfirmation: !signUpData.session,
  };
}

export async function dbUpdateManagedUserAccess(
  actor: UserProfile | null,
  input: {
    userId: string;
    role: UserRole;
    isActive: boolean;
    fullName: string;
    assignments: { schoolId: string; specializationId: string | null }[];
  }
): Promise<void> {
  await applyManagedUserAccess(actor, input, 'UPDATE_USER_ACCESS');
}

export async function dbAssignSpecializationTeachers(
  actor: UserProfile | null,
  schoolId: string,
  specId: string,
  teacherIds: string[]
): Promise<void> {
  const uniqueIds = Array.from(new Set(teacherIds.filter(Boolean)));
  if (uniqueIds.length > 2) {
    throw new Error('At most 2 co-teachers can be assigned to a single specialization.');
  }

  const client = requireSupabase();
  const { data: existingRows, error: fetchErr } = await client
    .from('teacher_school_assignments')
    .select('teacher_id')
    .eq('specialization_id', specId);
  if (fetchErr) throw new Error(fetchErr.message);

  const existingIds = new Set(
    (existingRows || []).map((row) => String((row as { teacher_id: string }).teacher_id))
  );
  const targetIds = new Set(uniqueIds);

  const removedIds = Array.from(existingIds).filter((id) => !targetIds.has(id));
  const addedIds = uniqueIds.filter((id) => !existingIds.has(id));

  if (removedIds.length > 0) {
    const { error: delErr } = await client
      .from('teacher_school_assignments')
      .delete()
      .eq('specialization_id', specId)
      .in('teacher_id', removedIds);
    if (delErr) throw new Error(delErr.message);
  }

  if (addedIds.length > 0) {
    const { error: insErr } = await client.from('teacher_school_assignments').insert(
      addedIds.map((teacherId) => ({
        teacher_id: teacherId,
        school_id: schoolId,
        specialization_id: specId,
        assigned_by: actor?.id ?? null,
      }))
    );
    if (insErr) throw new Error(insErr.message);
  }

  await recordAuditLog(actor, 'ASSIGN_SPECIALIZATION_TEACHERS', 'specializations', specId, schoolId, {
    teacherIds: uniqueIds,
  });
}

async function invokeAdminUsersFunction(
  body: Record<string, unknown>,
  unavailableHint: string
): Promise<Record<string, unknown>> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('admin-users', { body });
  if (error) {
    if (isEdgeFunctionUnavailableError(error)) {
      throw new Error(unavailableHint);
    }
    throw new Error(await extractEdgeFunctionError(error));
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return (data as Record<string, unknown>) || {};
}

export async function dbAdminResetUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  if (!userId || newPassword.length < 8) {
    throw new Error('User ID and a new password (min 8 characters) are required.');
  }
  await invokeAdminUsersFunction(
    { action: 'reset_password', userId, password: newPassword },
    'Admin password reset requires the deployed "admin-users" Supabase Edge Function (see docs/SUPABASE_SETUP.md).'
  );
}

export async function dbAdminDeleteUser(
  actor: UserProfile | null,
  userId: string
): Promise<void> {
  if (!userId) throw new Error('User ID is required.');
  if (actor?.id && actor.id === userId) {
    throw new Error('You cannot delete your own active Admin account.');
  }
  await invokeAdminUsersFunction(
    { action: 'delete_user', userId },
    'Deleting user accounts requires the deployed "admin-users" Supabase Edge Function (see docs/SUPABASE_SETUP.md).'
  );
}

export async function dbImportSchools(
  actor: UserProfile | null,
  schoolsToImport: School[]
): Promise<void> {
  const client = requireSupabase();
  for (const sch of schoolsToImport) {
    await dbCreateSchool(actor, sch.id, sch.name, sch.logo);

    // Fetch trigger-seeded specializations so imported data reuses them without duplicating names
    const { data: existingSpecs } = await client
      .from('specializations')
      .select('id, name')
      .eq('school_id', sch.id);
    const existingSpecIdByName = new Map<string, string>();
    for (const row of existingSpecs || []) {
      existingSpecIdByName.set(String(row.name || '').trim().toLowerCase(), row.id);
    }

    for (const sp of sch.specializations) {
      const normalizedSpecName = sp.name.trim().toLowerCase();
      const matchedId = existingSpecIdByName.get(normalizedSpecName);
      const targetSpecId = matchedId || sp.id;
      if (matchedId) {
        if (sp.teacherName?.trim() || sp.teacherPhoto) {
          await dbUpdateSpecializationTeacher(
            actor,
            sch.id,
            targetSpecId,
            sp.teacherName || '',
            sp.teacherPhoto
          );
        }
      } else {
        await dbCreateSpecialization(actor, targetSpecId, sch.id, sp.name, sp.teacherName || '');
        existingSpecIdByName.set(normalizedSpecName, targetSpecId);
        if (sp.teacherPhoto) {
          await dbUpdateSpecializationTeacher(
            actor,
            sch.id,
            targetSpecId,
            sp.teacherName || '',
            sp.teacherPhoto
          );
        }
      }
      for (let idx = 0; idx < sp.rubricCriteria.length; idx++) {
        const c = sp.rubricCriteria[idx];
        await dbAddRubricCriterion(actor, c.id, sch.id, targetSpecId, c.name, idx);
      }
      for (const st of sp.students) {
        await dbUpsertStudent(actor, 'create', sch.id, targetSpecId, st.id, {
          name: st.name,
          rollNo: st.rollNo,
          gradeLevel: st.gradeLevel,
          gender: st.gender,
          contactNo: st.contactNo,
          teacherName: st.teacherName,
          photo: st.photo,
          teacherPhoto: st.teacherPhoto,
          customFields: st.customFields,
        });
        for (const [date, status] of Object.entries(st.attendance || {})) {
          await dbSetAttendance(actor, sch.id, st.id, date, status);
        }
        for (const ev of st.evaluations || []) {
          await dbSaveEvaluation(actor, sch.id, st.id, ev);
        }
      }
    }
  }
}

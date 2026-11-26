export type AttendanceStatus = 'Present' | 'Absent';

export type UserRole = 'teacher' | 'director' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  isActive: boolean;
}

export interface TeacherAssignment {
  id?: number;
  teacherId: string;
  schoolId: string;
  specializationId: string | null; // null = all specializations in school
}

export interface ManagedUser extends UserProfile {
  assignments: TeacherAssignment[];
}

export interface DirectorPermissions {
  canCreateSchools: boolean;
  canEditSchools: boolean;
  canDeleteSchools: boolean;
  canCreateSpecializations: boolean;
  canEditSpecializations: boolean;
  canDeleteSpecializations: boolean;
  canAssignTeachers: boolean;
  canManageStudents: boolean;
  canDeleteStudents: boolean;
  canManageAttendanceAndRubrics: boolean;
  canConfigureRubrics: boolean;
  canDeleteEvaluationsOrCriteria: boolean;
  canExportReports: boolean;
}

export interface CustomStudentField {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface FaceRecognitionSettings {
  enabled: boolean;
  matchThreshold: number;
  requireLiveness: boolean;
  requireBlinkChallenge: boolean;
  cooldownSeconds: number;
  soundEnabled: boolean;
}

export interface SystemSettings {
  portalName: string;
  primaryColor: string;
  attendanceThreshold: number;
  rubricMin: number;
  rubricMax: number;
  rubricLabels: Record<string, string>;
  customStudentFields: CustomStudentField[];
  directorCanEdit: boolean;
  directorPermissions?: DirectorPermissions;
  faceRecognitionSettings?: FaceRecognitionSettings;
}

export interface AuditLogEntry {
  id: number;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  schoolId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
}

export interface RubricEvaluation {
  id: string;
  date: string; // YYYY-MM-DD
  scores: Record<string, number>; // criterionId -> score
}

export type AttendanceVerificationMethod = 'manual' | 'face_kiosk';

export interface AttendanceVerificationMeta {
  method: AttendanceVerificationMethod;
  confidence?: number;
}

export interface Student {
  id: string;
  name: string;
  rollNo: string;
  gradeLevel: string;
  gender: string;
  contactNo: string;
  teacherName: string;
  photo?: string;
  teacherPhoto?: string;
  faceDescriptors?: number[][];
  faceEnrolledAt?: string;
  customFields?: Record<string, string>;
  attendance: Record<string, AttendanceStatus>; // date string "YYYY-MM-DD"
  attendanceMeta?: Record<string, AttendanceVerificationMeta>;
  evaluations: RubricEvaluation[];
}

export interface CoTeacherSummary {
  id: string;
  fullName: string;
  avatarUrl?: string;
}

export interface Specialization {
  id: string;
  name: string;
  teacherName?: string;
  teacherPhoto?: string;
  coTeachers?: CoTeacherSummary[];
  students: Student[];
  rubricCriteria: RubricCriterion[];
}

export interface School {
  id: string;
  name: string;
  logo?: string;
  specializations: Specialization[];
}

export type QueryDataset = 'students' | 'attendance' | 'evaluations';

export type QueryOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'gte'
  | 'lte'
  | 'is_empty'
  | 'not_empty';

export interface QueryRule {
  id: string;
  field: string;
  operator: QueryOperator;
  value: string;
}

export interface QueryPreset {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  isShared?: boolean;
  dataset: QueryDataset;
  schoolId: string; // 'all' or specific school ID
  specId: string; // 'all' or specific spec ID
  dateStart: string; // YYYY-MM-DD or ''
  dateEnd: string; // YYYY-MM-DD or ''
  rules: QueryRule[];
  sortField: string;
  sortDir: 'asc' | 'desc';
}

export type WorkspaceTab = 'roster' | 'rubrics' | 'teachers' | 'reports' | 'query' | 'admin';

export interface StudentProfileInput {
  name: string;
  rollNo?: string;
  gradeLevel: string;
  gender: string;
  contactNo: string;
  teacherName: string;
  photo?: string;
  teacherPhoto?: string;
  faceDescriptors?: number[][];
  customFields?: Record<string, string>;
}

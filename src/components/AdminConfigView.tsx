import { useState, useRef, useMemo, ChangeEvent, FormEvent } from 'react';
import {
  Users,
  Sliders,
  ShieldAlert,
  UserPlus,
  Save,
  HardDriveUpload,
  HardDriveDownload,
  Plus,
  Trash2,
  Check,
  RefreshCw,
  Search,
  KeyRound,
  Camera,
  UserCog,
  ShieldCheck,
  Mail,
  Lock,
  User,
  X,
  ScanFace,
  Shield,
} from 'lucide-react';
import { format } from 'date-fns';
import { useStore } from '../store';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  DEFAULT_DIRECTOR_PERMISSIONS,
  DEFAULT_FACE_RECOGNITION_SETTINGS,
} from '../services/permissions';
import {
  DirectorPermissions,
  ManagedUser,
  School,
  SystemSettings,
  TeacherAssignment,
  UserRole,
} from '../types';
import { createWorkspaceBackupJson, parseWorkspaceBackupJson } from '../utils/backup';
import { downloadTextFile } from '../utils/export';
import { loadPersistedSchools } from '../utils/storage';
import { PortraitAvatar, PhotoUploader } from './Avatar';
import ConfirmModal from './ConfirmModal';
import AdminDirectoryPanel from './AdminDirectoryPanel';

type AdminSubTab = 'users' | 'directory' | 'settings' | 'audit';

const DIRECTOR_PERMISSION_FIELDS: { key: keyof DirectorPermissions; label: string }[] = [
  { key: 'canCreateSchools', label: 'Create Schools' },
  { key: 'canEditSchools', label: 'Edit School Names & Logos' },
  { key: 'canDeleteSchools', label: 'Delete Schools (Requires typing DELETE)' },
  { key: 'canCreateSpecializations', label: 'Add Specializations' },
  { key: 'canEditSpecializations', label: 'Edit Specialization Teacher Details' },
  { key: 'canDeleteSpecializations', label: 'Delete Specializations (Requires typing DELETE)' },
  { key: 'canAssignTeachers', label: 'Assign Teachers / Co-Teachers to Specializations' },
  { key: 'canManageStudents', label: 'Add & Edit Student Profiles' },
  { key: 'canDeleteStudents', label: 'Delete Students (Requires typing DELETE)' },
  { key: 'canManageAttendanceAndRubrics', label: 'Log Attendance & Score Rubric Evaluations' },
  { key: 'canConfigureRubrics', label: 'Add Rubric Criteria' },
  { key: 'canDeleteEvaluationsOrCriteria', label: 'Delete Rubric Criteria & Evaluations' },
  { key: 'canExportReports', label: 'Export CSV & Print Reports' },
];

const THEME_SWATCHES = [
  { label: 'Violet', hex: '#6d28d9' },
  { label: 'Royal Blue', hex: '#2563eb' },
  { label: 'Emerald', hex: '#059669' },
  { label: 'Crimson', hex: '#dc2626' },
  { label: 'Slate', hex: '#0f172a' },
];

function toggleSchoolWideAssignmentList(
  prev: TeacherAssignment[],
  teacherId: string,
  schoolId: string
): TeacherAssignment[] {
  const hasWide = prev.some((a) => a.schoolId === schoolId && a.specializationId === null);
  const filtered = prev.filter((a) => a.schoolId !== schoolId);
  if (hasWide) return filtered;
  return [...filtered, { teacherId, schoolId, specializationId: null }];
}

function toggleSpecAssignmentList(
  prev: TeacherAssignment[],
  teacherId: string,
  schoolId: string,
  specId: string
): TeacherAssignment[] {
  const withoutWide = prev.filter(
    (a) => !(a.schoolId === schoolId && a.specializationId === null)
  );
  const exists = withoutWide.some(
    (a) => a.schoolId === schoolId && a.specializationId === specId
  );
  if (exists) {
    return withoutWide.filter(
      (a) => !(a.schoolId === schoolId && a.specializationId === specId)
    );
  }
  return [...withoutWide, { teacherId, schoolId, specializationId: specId }];
}

function summarizeTeacherAssignments(
  assignments: TeacherAssignment[],
  schools: School[]
): { schoolId: string; schoolName: string; labels: string[] }[] {
  const bySchool = new Map<string, { schoolWide: boolean; specIds: string[] }>();
  for (const a of assignments) {
    const entry = bySchool.get(a.schoolId) || { schoolWide: false, specIds: [] };
    if (a.specializationId === null) {
      entry.schoolWide = true;
    } else if (!entry.specIds.includes(a.specializationId)) {
      entry.specIds.push(a.specializationId);
    }
    bySchool.set(a.schoolId, entry);
  }

  const out: { schoolId: string; schoolName: string; labels: string[] }[] = [];
  for (const [schoolId, entry] of bySchool.entries()) {
    const school = schools.find((s) => s.id === schoolId);
    const schoolName = school?.name || 'Unknown School';
    const labels = entry.schoolWide
      ? ['All Specializations']
      : entry.specIds.map(
          (id) => school?.specializations.find((sp) => sp.id === id)?.name || 'Specialization'
        );
    out.push({ schoolId, schoolName, labels });
  }
  return out;
}

function TeacherAssignmentMatrix({
  title,
  schools,
  assignments,
  onToggleSchoolWide,
  onToggleSpec,
}: {
  title: string;
  schools: School[];
  assignments: TeacherAssignment[];
  onToggleSchoolWide: (schoolId: string) => void;
  onToggleSpec: (schoolId: string, specId: string) => void;
}) {
  const schoolCount = new Set(assignments.map((a) => a.schoolId)).size;

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-800">{title}</p>
        <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
          {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} selected (multiple allowed)
        </span>
      </div>
      {schools.length === 0 ? (
        <p className="text-xs text-slate-500">Create schools first in the sidebar.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {schools.map((school) => {
            const hasWide = assignments.some(
              (a) => a.schoolId === school.id && a.specializationId === null
            );
            return (
              <div
                key={school.id}
                className="border border-slate-200 rounded-lg p-3.5 space-y-2 bg-white"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">{school.name}</span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={hasWide}
                      onChange={() => onToggleSchoolWide(school.id)}
                    />
                    All Specializations
                  </label>
                </div>
                {school.specializations.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    No specializations added yet — choose All Specializations or add one in the sidebar.
                  </p>
                ) : (
                  <div className="space-y-1 pl-1">
                    {school.specializations.map((spec) => {
                      const specChecked =
                        hasWide ||
                        assignments.some(
                          (a) => a.schoolId === school.id && a.specializationId === spec.id
                        );
                      return (
                        <label
                          key={spec.id}
                          className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            disabled={hasWide}
                            checked={specChecked}
                            onChange={() => onToggleSpec(school.id, spec.id)}
                          />
                          <span>{spec.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminConfigView() {
  const {
    schools,
    systemSettings,
    managedUsers,
    auditLogs,
    refreshWorkspace,
    updateSystemSettings,
    updateManagedUserAccess,
    createManagedUserAccount,
    resetUserPassword,
    deleteManagedUser,
    importLegacyJsonToCloud,
  } = useStore();
  const auth = useAuth();
  const { showToast } = useToast();

  const [subTab, setSubTab] = useState<AdminSubTab>('users');

  // Create user modal / inline state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('teacher');
  const [newAssignments, setNewAssignments] = useState<TeacherAssignment[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Registered Users filter & Edit modal state
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | UserRole>('all');
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [userEditMode, setUserEditMode] = useState<'profile' | 'access'>('access');
  const [draftRole, setDraftRole] = useState<UserRole>('teacher');
  const [draftActive, setDraftActive] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | undefined>(undefined);
  const [draftAssignments, setDraftAssignments] = useState<TeacherAssignment[]>([]);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);

  // System customization draft
  const [draftSettings, setDraftSettings] = useState<SystemSettings>(systemSettings);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [deletingField, setDeletingField] = useState<{ id: string; label: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return managedUsers.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [managedUsers, userSearch, userRoleFilter]);

  const openUserEditor = (user: ManagedUser, mode: 'profile' | 'access' = 'access') => {
    setShowCreateUser(false);
    setEditingUser(user);
    setUserEditMode(mode);
    setDraftRole(user.role);
    setDraftActive(user.isActive);
    setDraftName(user.fullName);
    setDraftAvatarUrl(user.avatarUrl);
    setDraftAssignments(user.assignments);
    setResetNewPassword('');
    setResetConfirmPassword('');
  };

  const toggleNewSchoolWideAssignment = (schoolId: string) => {
    setNewAssignments((prev) => toggleSchoolWideAssignmentList(prev, '', schoolId));
  };

  const toggleNewSpecAssignment = (schoolId: string, specId: string) => {
    setNewAssignments((prev) => toggleSpecAssignmentList(prev, '', schoolId, specId));
  };

  const toggleSchoolWideAssignment = (schoolId: string) => {
    setDraftAssignments((prev) =>
      toggleSchoolWideAssignmentList(prev, editingUser?.id || '', schoolId)
    );
  };

  const toggleSpecAssignment = (schoolId: string, specId: string) => {
    setDraftAssignments((prev) =>
      toggleSpecAssignmentList(prev, editingUser?.id || '', schoolId, specId)
    );
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Initial password must be at least 8 characters.', 'error');
      return;
    }
    if (newPassword !== newConfirmPassword) {
      showToast('Password and Confirm Password do not match.', 'error');
      return;
    }
    setIsCreatingUser(true);
    const assignedScopes =
      newRole === 'teacher'
        ? newAssignments.map((a) => ({
            schoolId: a.schoolId,
            specializationId: a.specializationId ?? null,
          }))
        : [];
    try {
      const res = await createManagedUserAccount({
        email: newEmail,
        password: newPassword,
        fullName: newFullName,
        role: newRole,
        assignments: assignedScopes,
      });
      showToast(
        res?.needsEmailConfirmation
          ? `Created ${newRole} account for ${newEmail}. Disable "Confirm email" in Supabase Auth or deploy admin-users Edge Function for instant login.`
          : `Created ${newRole} account for ${newEmail}.`
      );
      setNewEmail('');
      setNewPassword('');
      setNewConfirmPassword('');
      setNewFullName('');
      setNewAssignments([]);
      setShowCreateUser(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create user.', 'error');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleAdminResetPassword = async () => {
    if (!editingUser) return;
    if (resetNewPassword.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      showToast('New password and Confirm Password do not match.', 'error');
      return;
    }
    setIsResettingPassword(true);
    try {
      await resetUserPassword(editingUser.id, resetNewPassword);
      showToast(`Password reset for ${editingUser.email}. They can log in immediately.`);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reset user password.', 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSaveUserAccess = async () => {
    if (!editingUser) return;
    if (!draftName.trim()) {
      showToast('Full Name cannot be empty.', 'error');
      return;
    }
    setIsSavingUser(true);
    try {
      await updateManagedUserAccess({
        userId: editingUser.id,
        role: draftRole,
        isActive: draftActive,
        fullName: draftName,
        avatarUrl: draftAvatarUrl ?? null,
        assignments: draftRole === 'teacher' ? draftAssignments : [],
      });
      showToast(
        userEditMode === 'profile'
          ? `Updated profile & photo for ${draftName.trim()}.`
          : `Updated role and school/specialization access for ${editingUser.email}.`
      );
      setEditingUser(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update user.', 'error');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await updateSystemSettings(draftSettings);
      showToast('Saved system configuration.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save system settings.', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddCustomField = () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    setDraftSettings((prev) => ({
      ...prev,
      customStudentFields: [
        ...prev.customStudentFields.filter((f) => f.id !== id),
        { id, label, placeholder: `Enter ${label.toLowerCase()}...` },
      ],
    }));
    setNewFieldLabel('');
  };

  const handleImportJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (jsonInputRef.current) jsonInputRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setIsImporting(true);
      try {
        const parsed = parseWorkspaceBackupJson(String(reader.result || ''));
        await importLegacyJsonToCloud(parsed.schools);
        showToast(`Migrated ${parsed.schools.length} school(s) into Supabase.`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Import failed.', 'error');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleMigrateIndexedDb = async () => {
    setIsImporting(true);
    try {
      const legacy = await loadPersistedSchools();
      if (legacy.length === 0) {
        showToast('No legacy local browser data found to migrate.', 'info');
        return;
      }
      await importLegacyJsonToCloud(legacy);
      showToast(`Migrated ${legacy.length} local school(s) to Supabase.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Migration failed.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Admin Configuration &amp; Governance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage Teacher/Director/Admin accounts, teacher profile photos, permissions, and audit logs.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshWorkspace()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 shadow-2xs"
        >
          <RefreshCw size={13} /> Sync Now
        </button>
      </div>

      {/* Admin Sub-Navigation */}
      <div className="inline-flex flex-wrap p-1 bg-slate-100 rounded-xl gap-1 self-start">
        {[
          { id: 'users' as AdminSubTab, label: 'Users & Access', icon: Users },
          { id: 'directory' as AdminSubTab, label: 'Global Directory', icon: Search },
          { id: 'settings' as AdminSubTab, label: 'System Customization', icon: Sliders },
          { id: 'audit' as AdminSubTab, label: 'Audit & Data', icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSubTab(tab.id);
                if (tab.id === 'settings') setDraftSettings(systemSettings);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: USERS & SPECIALIZATION ACCESS */}
      {subTab === 'users' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                  <Users size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Registered Users ({managedUsers.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Edit teacher names/photos and manage school &amp; specialization access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setShowCreateUser((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold hover:bg-violet-700 shadow-xs transition-colors"
              >
                <UserPlus size={14} /> Add User Account
              </button>
            </div>

            {/* Search & Role Filter inside Registered Users */}
            <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter users by name or email..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'teacher', 'director', 'admin'] as const).map((roleKey) => (
                  <button
                    key={roleKey}
                    type="button"
                    onClick={() => setUserRoleFilter(roleKey)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      userRoleFilter === roleKey
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {roleKey === 'all'
                      ? 'All'
                      : roleKey.charAt(0).toUpperCase() + roleKey.slice(1) + 's'}
                  </button>
                ))}
              </div>
            </div>

            {showCreateUser && (
              <form
                onSubmit={handleCreateUser}
                className="p-5 bg-slate-50 border-b border-slate-200 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                  <div>
                    <label
                      htmlFor="create-user-fullname"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="create-user-fullname"
                      type="text"
                      required
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="e.g. Mr. Carlos Reyes"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="create-user-email"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Email
                    </label>
                    <input
                      id="create-user-email"
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="teacher@school.edu"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="create-user-password"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Initial Password (min 8)
                    </label>
                    <input
                      id="create-user-password"
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="create-user-confirm-password"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Confirm Password
                    </label>
                    <input
                      id="create-user-confirm-password"
                      type="password"
                      required
                      minLength={8}
                      value={newConfirmPassword}
                      onChange={(e) => setNewConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="create-user-role"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Role
                    </label>
                    <select
                      id="create-user-role"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                    >
                      <option value="teacher">Teacher</option>
                      <option value="director">Director</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isCreatingUser ? 'Creating...' : 'Create Account'}
                  </button>
                </div>

                {newPassword && newConfirmPassword && newPassword !== newConfirmPassword && (
                  <p className="text-xs font-medium text-rose-700">
                    Passwords do not match. Re-enter matching passwords to continue.
                  </p>
                )}

                {newRole === 'teacher' && (
                  <TeacherAssignmentMatrix
                    title="Assign Initial Schools & Specializations (Optional — 2+ Supported)"
                    schools={schools}
                    assignments={newAssignments}
                    onToggleSchoolWide={toggleNewSchoolWideAssignment}
                    onToggleSpec={toggleNewSpecAssignment}
                  />
                )}
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No matching registered users found.
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const assignmentSummary =
                    user.role === 'teacher'
                      ? summarizeTeacherAssignments(user.assignments, schools)
                      : [];
                  return (
                    <div
                      key={user.id}
                      className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-violet-50/25 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <PortraitAvatar
                          src={user.avatarUrl}
                          name={user.fullName}
                          size="md"
                          tone={user.role === 'director' ? 'slate' : 'violet'}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {user.fullName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                user.role === 'admin'
                                  ? 'bg-violet-100 text-violet-800'
                                  : user.role === 'director'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {user.role}
                            </span>
                            {!user.isActive && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                            <Mail size={11} className="text-slate-400 shrink-0" />
                            <span>{user.email}</span>
                          </div>
                          {user.role === 'teacher' && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {assignmentSummary.length === 0 ? (
                                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                  No schools or specializations assigned yet
                                </span>
                              ) : (
                                assignmentSummary.map((group) => (
                                  <span
                                    key={group.schoolId}
                                    className="text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md"
                                  >
                                    {group.schoolName}: {group.labels.join(', ')}
                                  </span>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openUserEditor(user, 'profile')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-xs font-semibold text-violet-800 hover:bg-violet-100/80 transition-colors"
                        >
                          <Camera size={13} /> Edit Name &amp; Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => openUserEditor(user, 'access')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <ShieldCheck size={13} /> Configure Role &amp; Access
                        </button>
                        {auth?.profile?.id !== user.id && (
                          <button
                            type="button"
                            onClick={() => setDeletingUser(user)}
                            aria-label={`Delete user ${user.email}`}
                            title="Delete User Account"
                            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {editingUser && (
            <div
              className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => !isSavingUser && setEditingUser(null)}
            >
              <div
                className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50/80 via-white to-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                      {userEditMode === 'profile' ? <Camera size={17} /> : <UserCog size={17} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {userEditMode === 'profile'
                          ? `Edit Name & Profile Photo: ${editingUser.fullName}`
                          : `Configure Access & Security: ${editingUser.email}`}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {userEditMode === 'profile'
                          ? 'Update display name and portrait image shown in roster & scorecards.'
                          : 'Update profile photo, role, active status, assignments, and password.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    aria-label="Close user editor"
                    className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5">
                  {/* Profile Photo & Full Name (always shown for both modes) */}
                  <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-4">
                    <PhotoUploader
                      label="Profile Photo"
                      nameForFallback={draftName || editingUser.email}
                      value={draftAvatarUrl}
                      onChange={setDraftAvatarUrl}
                      size="lg"
                    />

                    <div
                      className={
                        userEditMode === 'access'
                          ? 'grid grid-cols-1 sm:grid-cols-3 gap-4'
                          : 'space-y-3'
                      }
                    >
                      <div>
                        <label
                          htmlFor="admin-edit-user-fullname"
                          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1"
                        >
                          <User size={12} className="text-violet-600" /> Full Name
                        </label>
                        <input
                          id="admin-edit-user-fullname"
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>

                      {userEditMode === 'access' && (
                        <>
                          <div>
                            <label
                              htmlFor="admin-edit-user-role"
                              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1"
                            >
                              <ShieldCheck size={12} className="text-slate-400" /> Role
                            </label>
                            <select
                              id="admin-edit-user-role"
                              value={draftRole}
                              onChange={(e) => setDraftRole(e.target.value as UserRole)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                            >
                              <option value="teacher">Teacher</option>
                              <option value="director">Director</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <div className="flex items-end pb-1.5">
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={draftActive}
                                onChange={(e) => setDraftActive(e.target.checked)}
                                className="rounded border-slate-300 text-violet-600"
                              />
                              Account Active
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {userEditMode === 'access' && draftRole === 'teacher' && (
                    <TeacherAssignmentMatrix
                      title="Assigned Schools & Specializations (Teacher Scope — 2+ Supported)"
                      schools={schools}
                      assignments={draftAssignments}
                      onToggleSchoolWide={toggleSchoolWideAssignment}
                      onToggleSpec={toggleSpecAssignment}
                    />
                  )}

                  {userEditMode === 'access' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center gap-2">
                        <Lock size={14} className="text-violet-600" />
                        <h5 className="text-xs font-bold text-slate-900">
                          Admin Password Reset ({editingUser.email})
                        </h5>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Set a new login password below to immediately override access (requires
                        deployed admin-users Edge Function).
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                        <div>
                          <label
                            htmlFor="admin-reset-new-password"
                            className="block text-[11px] font-semibold text-slate-600 mb-1"
                          >
                            New Password (min 8)
                          </label>
                          <input
                            id="admin-reset-new-password"
                            type="password"
                            minLength={8}
                            value={resetNewPassword}
                            onChange={(e) => setResetNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="admin-reset-confirm-password"
                            className="block text-[11px] font-semibold text-slate-600 mb-1"
                          >
                            Confirm New Password
                          </label>
                          <input
                            id="admin-reset-confirm-password"
                            type="password"
                            minLength={8}
                            value={resetConfirmPassword}
                            onChange={(e) => setResetConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={isResettingPassword || !resetNewPassword}
                          onClick={handleAdminResetPassword}
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                        >
                          <KeyRound size={13} />
                          {isResettingPassword ? 'Resetting...' : 'Reset User Password'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingUser}
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingUser || !draftName.trim()}
                    onClick={handleSaveUserAccess}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 shadow-xs"
                  >
                    <Check size={14} />
                    {isSavingUser
                      ? 'Saving...'
                      : userEditMode === 'profile'
                      ? 'Save Profile & Photo'
                      : 'Save Access'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GLOBAL ADMIN DIRECTORY & SEARCH */}
      {subTab === 'directory' && (
        <AdminDirectoryPanel
          schools={schools}
          managedUsers={managedUsers}
          attendanceThreshold={systemSettings.attendanceThreshold}
          rubricMax={systemSettings.rubricMax}
          onSelectUser={(u) => {
            setSubTab('users');
            openUserEditor(u);
          }}
        />
      )}

      {/* TAB 3: SYSTEM CUSTOMIZATION & DIRECTOR PERMISSIONS */}
      {subTab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="cfg-portal-name"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Portal Brand Title
              </label>
              <input
                id="cfg-portal-name"
                type="text"
                value={draftSettings.portalName}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, portalName: e.target.value }))
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="cfg-threshold"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Attendance Pass Threshold (%)
              </label>
              <input
                id="cfg-threshold"
                type="number"
                min={1}
                max={100}
                value={draftSettings.attendanceThreshold}
                onChange={(e) =>
                  setDraftSettings((prev) => ({
                    ...prev,
                    attendanceThreshold: Number(e.target.value) || 80,
                  }))
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="cfg-rubric-min"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Rubric Minimum Score
              </label>
              <input
                id="cfg-rubric-min"
                type="number"
                min={0}
                max={9}
                value={draftSettings.rubricMin}
                onChange={(e) =>
                  setDraftSettings((prev) => ({
                    ...prev,
                    rubricMin: Number(e.target.value),
                  }))
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="cfg-rubric-max"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Rubric Maximum Score
              </label>
              <input
                id="cfg-rubric-max"
                type="number"
                min={2}
                max={10}
                value={draftSettings.rubricMax}
                onChange={(e) =>
                  setDraftSettings((prev) => ({
                    ...prev,
                    rubricMax: Math.max(prev.rubricMin + 1, Number(e.target.value) || 5),
                  }))
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Portal Accent Color
            </span>
            <div className="flex flex-wrap gap-2">
              {THEME_SWATCHES.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  onClick={() => setDraftSettings((prev) => ({ ...prev, primaryColor: sw.hex }))}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                    draftSettings.primaryColor === sw.hex
                      ? 'border-slate-900 bg-slate-100'
                      : 'border-slate-200'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: sw.hex }}
                  />
                  {sw.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <label className="inline-flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={draftSettings.directorCanEdit}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, directorCanEdit: e.target.checked }))
                }
              />
              Enable Director Write Privileges (uncheck for completely read-only Directors)
            </label>

            {draftSettings.directorCanEdit && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Granular Director Permissions
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Fine-tune exactly which create, edit, assign, delete, and export actions
                    Directors can perform (enforced in Supabase RLS &amp; UI).
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {DIRECTOR_PERMISSION_FIELDS.map(({ key, label }) => {
                    const currentPerms =
                      draftSettings.directorPermissions || DEFAULT_DIRECTOR_PERMISSIONS;
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-white border border-slate-200 rounded-lg px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(currentPerms[key])}
                          onChange={(e) =>
                            setDraftSettings((prev) => ({
                              ...prev,
                              directorPermissions: {
                                ...(prev.directorPermissions || DEFAULT_DIRECTOR_PERMISSIONS),
                                [key]: e.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Face Recognition Attendance & Anti-Spoofing */}
          {(() => {
            const faceConfig =
              draftSettings.faceRecognitionSettings || DEFAULT_FACE_RECOGNITION_SETTINGS;
            const patchFaceConfig = (
              patch: Partial<typeof DEFAULT_FACE_RECOGNITION_SETTINGS>
            ) =>
              setDraftSettings((prev) => ({
                ...prev,
                faceRecognitionSettings: {
                  ...(prev.faceRecognitionSettings || DEFAULT_FACE_RECOGNITION_SETTINGS),
                  ...patch,
                },
              }));

            return (
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                    <ScanFace size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Face Recognition Attendance &amp; Anti-Spoofing
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Runs 100% on-device (offline WebGL/CPU) across Android APK, Web, and iOS PWA
                      with zero per-scan API fees.
                    </p>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={faceConfig.enabled}
                    onChange={(e) => patchFaceConfig({ enabled: e.target.checked })}
                  />
                  Enable On-Device Face Recognition Attendance
                </label>

                {faceConfig.enabled && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="cfg-face-threshold"
                          className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5"
                        >
                          <span>Face Match Sensitivity Threshold</span>
                          <span className="font-mono text-violet-700">
                            {Math.round(faceConfig.matchThreshold * 100)}%
                          </span>
                        </label>
                        <input
                          id="cfg-face-threshold"
                          type="range"
                          min={0.5}
                          max={0.8}
                          step={0.01}
                          value={faceConfig.matchThreshold}
                          onChange={(e) =>
                            patchFaceConfig({
                              matchThreshold: Math.min(
                                0.85,
                                Math.max(0.45, Number(e.target.value) || 0.62)
                              ),
                            })
                          }
                          className="w-full accent-violet-600"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Recommended: 62%. Higher values make verification stricter.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="cfg-face-cooldown"
                          className="block text-xs font-semibold text-slate-700 mb-1.5"
                        >
                          Re-Scan Cooldown (Seconds)
                        </label>
                        <input
                          id="cfg-face-cooldown"
                          type="number"
                          min={2}
                          max={60}
                          value={faceConfig.cooldownSeconds}
                          onChange={(e) =>
                            patchFaceConfig({
                              cooldownSeconds: Math.min(
                                60,
                                Math.max(2, Number(e.target.value) || 15)
                              ),
                            })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Prevents repeat chime/write triggers while a student remains in camera
                          view.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={faceConfig.requireLiveness}
                          onChange={(e) => patchFaceConfig({ requireLiveness: e.target.checked })}
                        />
                        <span>
                          <strong className="block text-slate-900">
                            Passive Liveness &amp; Anti-Spoof Guard
                          </strong>
                          <span className="text-[11px] text-slate-500">
                            Blocks printed photos and phone screens automatically (under 1.5s
                            walk-up scan).
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={faceConfig.requireBlinkChallenge}
                          onChange={(e) =>
                            patchFaceConfig({ requireBlinkChallenge: e.target.checked })
                          }
                        />
                        <span>
                          <strong className="block text-slate-900">
                            Require Active Eye-Blink Confirmation
                          </strong>
                          <span className="text-[11px] text-slate-500">
                            Prompts each student to blink naturally before marking Present.
                          </span>
                        </span>
                      </label>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={faceConfig.soundEnabled}
                        onChange={(e) => patchFaceConfig({ soundEnabled: e.target.checked })}
                      />
                      Play Audio Confirmation Chime on Check-In
                    </label>

                    <div className="flex items-start gap-2 rounded-lg bg-amber-50/80 border border-amber-200 px-3 py-2.5 text-[11px] text-amber-900">
                      <Shield size={14} className="text-amber-700 shrink-0 mt-0.5" />
                      <span>
                        <strong>Kiosk Best Practices:</strong> Mount the phone/tablet at eye level in
                        even front lighting (avoid bright doorways behind students), and enable{' '}
                        <strong>Screen Pinning</strong> (Android) or{' '}
                        <strong>Guided Access</strong> (iOS) in Kiosk Mode.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Custom Student Fields */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-800">Custom Student Profile Fields</h4>
              <p className="text-[11px] text-slate-500">
                Add extra fields (e.g., Section, Adviser, Guardian Name) shown on Student Forms.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {draftSettings.customStudentFields.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-md text-xs font-semibold text-slate-700"
                >
                  {f.label}
                  <button
                    type="button"
                    onClick={() => setDeletingField({ id: f.id, label: f.label })}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label={`Remove field ${f.label}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 max-w-sm">
              <input
                type="text"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="New field label (e.g. Section)"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={handleAddCustomField}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                <Plus size={13} /> Add Field
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              <Save size={14} /> {isSavingSettings ? 'Saving...' : 'Save System Settings'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: AUDIT LOGS & DATA MIGRATION */}
      {subTab === 'audit' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Data Migration &amp; Backup (.JSON)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Migrate legacy local browser data or JSON backups into Supabase, or export a full
                cloud snapshot.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={jsonInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportJson}
                className="hidden"
              />
              <button
                type="button"
                disabled={isImporting}
                onClick={handleMigrateIndexedDb}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <HardDriveUpload size={13} /> Migrate Local Browser Data
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => jsonInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <HardDriveUpload size={13} /> Import JSON to Supabase
              </button>
              <button
                type="button"
                onClick={() => {
                  const json = createWorkspaceBackupJson(schools, []);
                  void downloadTextFile(
                    `EZ-Center-Supabase-Export-${format(new Date(), 'yyyy-MM-dd')}.json`,
                    json,
                    'application/json;charset=utf-8;'
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                <HardDriveDownload size={13} /> Export JSON
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Recent Audit Logs ({auditLogs.length})
              </h3>
            </div>
            {auditLogs.length === 0 ? (
              <p className="p-6 text-xs text-slate-500 text-center">No audit entries logged yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                      <th className="py-2.5 px-4 font-semibold">Actor</th>
                      <th className="py-2.5 px-4 font-semibold">Role</th>
                      <th className="py-2.5 px-4 font-semibold">Action</th>
                      <th className="py-2.5 px-4 font-semibold">Entity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800">{log.actorEmail || '—'}</td>
                        <td className="py-2.5 px-4 uppercase font-bold text-[10px] text-slate-600">
                          {log.actorRole || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-violet-700">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{log.entityType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deletingUser}
        title="Delete User Account"
        confirmText="Delete User"
        message={
          <p>
            Are you sure you want to permanently delete <strong>{deletingUser?.email}</strong>? All
            school/specialization assignments for this user will be removed.
          </p>
        }
        onConfirm={async () => {
          if (!deletingUser) return;
          try {
            await deleteManagedUser(deletingUser.id);
            if (editingUser?.id === deletingUser.id) {
              setEditingUser(null);
            }
            showToast(`Deleted user ${deletingUser.email}.`, 'info');
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to delete user.', 'error');
          }
        }}
        onCancel={() => setDeletingUser(null)}
      />

      <ConfirmModal
        isOpen={!!deletingField}
        title="Remove Custom Student Field"
        confirmText="Remove Field"
        message={
          <p>
            Are you sure you want to remove the custom field{' '}
            <strong>{deletingField?.label}</strong> from system settings?
          </p>
        }
        onConfirm={() => {
          if (deletingField) {
            setDraftSettings((prev) => ({
              ...prev,
              customStudentFields: prev.customStudentFields.filter(
                (item) => item.id !== deletingField.id
              ),
            }));
          }
        }}
        onCancel={() => setDeletingField(null)}
      />
    </div>
  );
}

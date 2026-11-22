import { useState, useRef, ChangeEvent, FormEvent } from 'react';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { ManagedUser, School, SystemSettings, TeacherAssignment, UserRole } from '../types';
import { createWorkspaceBackupJson, parseWorkspaceBackupJson } from '../utils/backup';
import { downloadTextFile } from '../utils/export';
import { loadPersistedSchools } from '../utils/storage';

type AdminSubTab = 'users' | 'settings' | 'audit';

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
    importLegacyJsonToCloud,
  } = useStore();
  const { showToast } = useToast();

  const [subTab, setSubTab] = useState<AdminSubTab>('users');

  // Create user modal / inline state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('teacher');
  const [newAssignments, setNewAssignments] = useState<TeacherAssignment[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Edit user access state
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [draftRole, setDraftRole] = useState<UserRole>('teacher');
  const [draftActive, setDraftActive] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [draftAssignments, setDraftAssignments] = useState<TeacherAssignment[]>([]);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // System customization draft
  const [draftSettings, setDraftSettings] = useState<SystemSettings>(systemSettings);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  const openUserEditor = (user: ManagedUser) => {
    setShowCreateUser(false);
    setEditingUser(user);
    setDraftRole(user.role);
    setDraftActive(user.isActive);
    setDraftName(user.fullName);
    setDraftAssignments(user.assignments);
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
          ? `Created ${newRole} account for ${newEmail}. Disable "Confirm email" in Supabase Auth or have them confirm before signing in.`
          : `Created ${newRole} account for ${newEmail}.`
      );
      setNewEmail('');
      setNewPassword('');
      setNewFullName('');
      setNewAssignments([]);
      setShowCreateUser(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create user.', 'error');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleSaveUserAccess = async () => {
    if (!editingUser) return;
    setIsSavingUser(true);
    try {
      await updateManagedUserAccess({
        userId: editingUser.id,
        role: draftRole,
        isActive: draftActive,
        fullName: draftName,
        assignments: draftRole === 'teacher' ? draftAssignments : [],
      });
      showToast(`Updated role and school/specialization access for ${editingUser.email}.`);
      setEditingUser(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update user access.', 'error');
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
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Admin Configuration &amp; Governance
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Teacher/Director/Admin accounts, assign specific schools &amp; specializations,
            customize grading scales, and review audit logs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshWorkspace()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
        >
          <RefreshCw size={13} /> Sync Now
        </button>
      </div>

      {/* Admin Sub-Navigation */}
      <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1 self-start">
        {[
          { id: 'users' as AdminSubTab, label: 'Users & Access', icon: Users },
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
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Registered Users ({managedUsers.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Teachers can only access the exact schools and specializations assigned here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setShowCreateUser((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700"
              >
                <UserPlus size={14} /> Add User Account
              </button>
            </div>

            {showCreateUser && (
              <form
                onSubmit={handleCreateUser}
                className="p-5 bg-slate-50 border-b border-slate-200 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="e.g. Mr. Carlos Reyes"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="teacher@school.edu"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Initial Password (min 8)
                    </label>
                    <input
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
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Role
                    </label>
                    <select
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
              {managedUsers.map((user) => {
                const assignmentSummary =
                  user.role === 'teacher'
                    ? summarizeTeacherAssignments(user.assignments, schools)
                    : [];
                return (
                  <div
                    key={user.id}
                    className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{user.fullName}</span>
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
                      <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
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
                    <button
                      type="button"
                      onClick={() => openUserEditor(user)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Configure Role &amp; Access
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {editingUser && (
            <div className="bg-white border border-violet-200 rounded-xl p-6 space-y-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Edit Access: {editingUser.email}
                  </h4>
                  <p className="text-xs text-slate-500">
                    Update role, active status, and assigned school specializations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                  <select
                    value={draftRole}
                    onChange={(e) => setDraftRole(e.target.value as UserRole)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
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
              </div>

              {draftRole === 'teacher' && (
                <TeacherAssignmentMatrix
                  title="Assigned Schools & Specializations (Teacher Scope — 2+ Supported)"
                  schools={schools}
                  assignments={draftAssignments}
                  onToggleSchoolWide={toggleSchoolWideAssignment}
                  onToggleSpec={toggleSpecAssignment}
                />
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingUser}
                  onClick={handleSaveUserAccess}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  <Check size={14} /> {isSavingUser ? 'Saving...' : 'Save Access'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SYSTEM CUSTOMIZATION */}
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

          <div className="pt-2 border-t border-slate-100">
            <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={draftSettings.directorCanEdit}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, directorCanEdit: e.target.checked }))
                }
              />
              Allow Directors to add/edit schools, students, attendance &amp; rubrics (uncheck for
              read-only Director oversight)
            </label>
          </div>

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
                    onClick={() =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        customStudentFields: prev.customStudentFields.filter(
                          (item) => item.id !== f.id
                        ),
                      }))
                    }
                    className="text-slate-400 hover:text-rose-600"
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
    </div>
  );
}

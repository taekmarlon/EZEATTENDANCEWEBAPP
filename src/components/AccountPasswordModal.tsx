import { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  KeyRound,
  User,
  Mail,
  ShieldCheck,
  Building2,
  X,
  Loader2,
  Check,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PhotoUploader } from './Avatar';
import { School } from '../types';

interface AccountPasswordModalProps {
  isOpen: boolean;
  schools?: School[];
  onAfterSaveProfile?: () => Promise<void> | void;
  initialTab?: 'profile' | 'password';
  onClose: () => void;
}

export default function AccountPasswordModal({
  isOpen,
  schools = [],
  onAfterSaveProfile,
  initialTab = 'profile',
  onClose,
}: AccountPasswordModalProps) {
  const { profile, assignments, changeOwnPassword, updateOwnProfile } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>(initialTab);

  // My Profile state
  const [draftName, setDraftName] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<string | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const profileId = profile?.id;
  const profileFullName = profile?.fullName || '';
  const profileAvatarUrl = profile?.avatarUrl;

  useEffect(() => {
    if (!isOpen || !profileId) return;
    setActiveTab(initialTab);
    setDraftName(profileFullName);
    setDraftAvatar(profileAvatarUrl);
    setProfileError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    // Re-initialize only when modal opens or active user changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab, profileId]);

  const assignmentLabels = useMemo(() => {
    if (!profile || profile.role !== 'teacher') return [];
    const labels: string[] = [];
    for (const a of assignments) {
      const sch = schools.find((s) => s.id === a.schoolId);
      if (!sch) continue;
      if (a.specializationId === null) {
        labels.push(`${sch.name}: All Specializations`);
      } else {
        const sp = sch.specializations.find((item) => item.id === a.specializationId);
        if (sp) labels.push(`${sch.name}: ${sp.name}`);
      }
    }
    return labels;
  }, [profile, assignments, schools]);

  if (!isOpen || !profile) return null;

  const isBusy = isSavingProfile || isSavingPassword;

  const resetAndClose = () => {
    if (isBusy) return;
    setProfileError(null);
    setPasswordError(null);
    onClose();
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    const cleanName = draftName.trim();
    if (!cleanName) {
      setProfileError('Full Name cannot be empty.');
      return;
    }
    if (!updateOwnProfile) {
      setProfileError('Profile editing is unavailable in offline/test mode.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateOwnProfile(cleanName, draftAvatar);
      if (onAfterSaveProfile) {
        await onAfterSaveProfile();
      }
      showToast('Your profile name and photo have been saved.');
      onClose();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSubmitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and Confirm Password do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Choose a new password that differs from your current password.');
      return;
    }

    if (!changeOwnPassword) {
      setPasswordError('Password update is unavailable in offline/test mode.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      showToast('Your account password has been updated.');
      onClose();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

  return (
    <div
      className="no-print fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={resetAndClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50/80 via-white to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
              {activeTab === 'profile' ? <User size={17} /> : <KeyRound size={17} />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {profile.role === 'teacher' ? 'My Teacher Profile & Security' : 'My Profile & Account Settings'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {profile.email} · {roleLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={resetAndClose}
            aria-label="Close profile modal"
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sub-Tabs: My Profile | Change Password */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 bg-slate-50/70 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'profile'
                ? 'bg-white text-violet-700 shadow-2xs border border-violet-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User size={14} /> My Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'password'
                ? 'bg-white text-violet-700 shadow-2xs border border-violet-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound size={14} /> Change Password
          </button>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleSaveProfile} className="p-5 overflow-y-auto space-y-4">
            {profileError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {profileError}
              </div>
            )}

            <div className="pb-4 border-b border-slate-100">
              <PhotoUploader
                label="Profile Picture"
                nameForFallback={draftName || profile.email}
                value={draftAvatar}
                onChange={setDraftAvatar}
                size="lg"
              />
            </div>

            <div>
              <label
                htmlFor="my-profile-fullname"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"
              >
                <User size={13} className="text-violet-600" />
                <span>Full Name</span>
              </label>
              <input
                id="my-profile-fullname"
                type="text"
                required
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <Mail size={12} /> Email Address
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-1 truncate">
                  {profile.email}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <ShieldCheck size={12} /> Account Role
                </div>
                <div className="text-xs font-bold text-violet-700 mt-1 uppercase">
                  {roleLabel}
                </div>
              </div>
            </div>

            {profile.role === 'teacher' && (
              <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Building2 size={13} className="text-violet-600" />
                  Assigned Schools &amp; Specializations ({assignmentLabels.length})
                </div>
                {assignmentLabels.length === 0 ? (
                  <p className="text-[11px] text-amber-800">
                    No specializations assigned yet. Contact a Director or Admin.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {assignmentLabels.map((lbl) => (
                      <span
                        key={lbl}
                        className="px-2 py-0.5 bg-white border border-violet-200 text-violet-900 rounded-md text-[11px] font-medium"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSavingProfile}
                onClick={resetAndClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingProfile || !draftName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 shadow-xs"
              >
                {isSavingProfile ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Save My Profile
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitPassword} className="p-5 overflow-y-auto space-y-4">
            {passwordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {passwordError}
              </div>
            )}

            <div>
              <label
                htmlFor="account-current-password"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"
              >
                <Lock size={12} className="text-slate-400" />
                <span>Current Password</span>
              </label>
              <input
                id="account-current-password"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="account-new-password"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"
              >
                <KeyRound size={12} className="text-slate-400" />
                <span>New Password (min 8 characters)</span>
              </label>
              <input
                id="account-new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="account-confirm-password"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"
              >
                <KeyRound size={12} className="text-slate-400" />
                <span>Confirm New Password</span>
              </label>
              <input
                id="account-confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSavingPassword}
                onClick={resetAndClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingPassword}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 shadow-xs"
              >
                {isSavingPassword && <Loader2 size={13} className="animate-spin" />}
                Update Password
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import { useState, FormEvent } from 'react';
import { KeyRound, X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface AccountPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountPasswordModal({ isOpen, onClose }: AccountPasswordModalProps) {
  const { profile, changeOwnPassword } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !profile) return null;

  const resetAndClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and Confirm Password do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a new password that differs from your current password.');
      return;
    }

    if (!changeOwnPassword) {
      setError('Password update is unavailable in offline/test mode.');
      return;
    }

    setIsSaving(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      showToast('Your account password has been updated.');
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
      onClick={() => !isSaving && resetAndClose()}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <KeyRound size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Account &amp; Password Settings</h3>
              <p className="text-[11px] text-slate-500">
                {profile.fullName} · {profile.email} ({profile.role})
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={resetAndClose}
            aria-label="Close password modal"
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="account-current-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Current Password
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
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              New Password (min 8 characters)
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
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Confirm New Password
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
              disabled={isSaving}
              onClick={resetAndClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {isSaving && <Loader2 size={13} className="animate-spin" />}
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

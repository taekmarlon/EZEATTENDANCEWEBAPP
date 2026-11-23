import { ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, Cloud, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  requireDeleteConfirmation?: boolean;
  isBusy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  requireDeleteConfirmation,
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const auth = useAuth();
  const [typedWord, setTypedWord] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setTypedWord('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const role = auth?.profile?.role;
  const needsDeleteWord =
    requireDeleteConfirmation ?? (isDanger && (role === 'admin' || role === 'director'));
  const isConfirmedPhrase = !needsDeleteWord || typedWord.trim() === 'DELETE';

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
      onClick={() => !isBusy && onCancel()}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isDanger ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'
              }`}
            >
              {isDanger ? <AlertTriangle size={18} /> : <Cloud size={18} />}
            </div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
            aria-label="Close confirmation dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 text-slate-600 text-sm leading-relaxed space-y-4">
          <div>{message}</div>
          {needsDeleteWord && (
            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-lg space-y-2">
              <label
                htmlFor="confirm-delete-word"
                className="block text-xs font-semibold text-rose-900"
              >
                Type <span className="font-mono font-bold">DELETE</span> to confirm permanent removal
              </label>
              <input
                id="confirm-delete-word"
                type="text"
                autoComplete="off"
                value={typedWord}
                onChange={(e) => setTypedWord(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-white border border-rose-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          )}
        </div>
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isBusy || !isConfirmedPhrase}
            onClick={async () => {
              if (!isConfirmedPhrase) return;
              await onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors shadow-xs disabled:opacity-50 whitespace-nowrap ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {isBusy ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

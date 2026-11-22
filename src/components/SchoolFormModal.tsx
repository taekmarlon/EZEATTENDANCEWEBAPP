import { useState, useEffect, FormEvent } from 'react';
import { X } from 'lucide-react';
import { School } from '../types';
import { PhotoUploader } from './Avatar';

interface SchoolFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  initialSchool?: School | null;
  onSave: (name: string, logo?: string) => void;
  onClose: () => void;
}

export default function SchoolFormModal({
  isOpen,
  mode,
  initialSchool,
  onSave,
  onClose,
}: SchoolFormModalProps) {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && initialSchool) {
      setName(initialSchool.name);
      setLogo(initialSchool.logo);
    } else {
      setName('');
      setLogo(undefined);
    }
  }, [isOpen, mode, initialSchool]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), logo);
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {mode === 'edit' ? 'Edit School & Logo' : 'New School'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize the school name and crest/logo shown across reports and scorecards.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close school form"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <PhotoUploader
            label="School Logo / Crest"
            nameForFallback={name || 'School'}
            fallbackText={(name || 'SCH').substring(0, 3).toUpperCase()}
            value={logo}
            onChange={setLogo}
            size="lg"
            compressMode="logo"
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              School Name <span className="text-rose-600">*</span>
            </label>
            <input
              autoFocus
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lincoln Science Academy"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {mode === 'edit' ? 'Save School' : 'Create School'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

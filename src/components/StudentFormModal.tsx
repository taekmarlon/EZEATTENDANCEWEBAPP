import { useState, useEffect, FormEvent } from 'react';
import {
  X,
  UserPlus,
  UserCog,
  User,
  Hash,
  GraduationCap,
  Users,
  Phone,
  Tag,
  Check,
} from 'lucide-react';
import { Student, StudentProfileInput } from '../types';
import { PhotoUploader } from './Avatar';
import { useStore } from '../store';

interface StudentFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  initialStudent?: Student | null;
  defaultTeacherName?: string;
  defaultTeacherPhoto?: string;
  onSave: (profile: StudentProfileInput) => void;
  onClose: () => void;
}

const GRADE_SUGGESTIONS = [
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
  'Grade 11',
  'Grade 12',
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
];

const GENDER_OPTIONS = ['', 'Male', 'Female', 'Non-binary', 'Prefer not to say'];

export default function StudentFormModal({
  isOpen,
  mode,
  initialStudent,
  defaultTeacherName = '',
  onSave,
  onClose,
}: StudentFormModalProps) {
  const { systemSettings } = useStore();
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [gender, setGender] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const resolvedTeacherName = (
    mode === 'edit' ? initialStudent?.teacherName || defaultTeacherName : defaultTeacherName
  ).trim();

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && initialStudent) {
      setName(initialStudent.name);
      setRollNo(initialStudent.rollNo || '');
      setGradeLevel(initialStudent.gradeLevel || '');
      setGender(initialStudent.gender || '');
      setContactNo(initialStudent.contactNo || '');
      setPhoto(initialStudent.photo);
      setCustomFields(initialStudent.customFields || {});
    } else {
      setName('');
      setRollNo('');
      setGradeLevel('');
      setGender('');
      setContactNo('');
      setPhoto(undefined);
      setCustomFields({});
    }
  }, [isOpen, mode, initialStudent]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      rollNo: rollNo.trim(),
      gradeLevel: gradeLevel.trim(),
      gender: gender.trim(),
      contactNo: contactNo.trim(),
      teacherName: resolvedTeacherName,
      photo,
      teacherPhoto: mode === 'edit' ? initialStudent?.teacherPhoto : undefined,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    });
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50/70 via-white to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
              {mode === 'edit' ? <UserCog size={18} /> : <UserPlus size={18} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {mode === 'edit' ? 'Edit Student Profile' : 'Add Student'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Student portrait photo, contact information, and enrollment details.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors p-1.5"
            aria-label="Close student form"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Student Portrait Upload */}
          <div className="pb-5 border-b border-slate-100">
            <PhotoUploader
              label="Student Picture"
              nameForFallback={name || 'Student'}
              value={photo}
              onChange={setPhoto}
              size="lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <User size={13} className="text-violet-600" />
                <span>
                  Student Name <span className="text-rose-600">*</span>
                </span>
              </label>
              <input
                autoFocus
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maria Santos"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <Hash size={13} className="text-slate-400" />
                <span>Roll / ID No. (Optional)</span>
              </label>
              <input
                type="text"
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
                placeholder="Optional (e.g. EZ-2026-001)"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <GraduationCap size={13} className="text-slate-400" />
                <span>Grade Level</span>
              </label>
              <input
                type="text"
                list="ez-grade-levels"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="e.g. Grade 10"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
              <datalist id="ez-grade-levels">
                {GRADE_SUGGESTIONS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <Users size={13} className="text-slate-400" />
                <span>Gender</span>
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              >
                {GENDER_OPTIONS.map((opt) => (
                  <option key={opt || 'empty'} value={opt}>
                    {opt || 'Select gender...'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <Phone size={13} className="text-slate-400" />
                <span>Contact No.</span>
              </label>
              <input
                type="tel"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
                placeholder="e.g. 0917-555-0192"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>

            {systemSettings.customStudentFields.map((field) => (
              <div key={field.id}>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                  <Tag size={13} className="text-slate-400" />
                  <span>{field.label}</span>
                </label>
                <input
                  type="text"
                  value={customFields[field.id] || ''}
                  onChange={(e) =>
                    setCustomFields((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  placeholder={field.placeholder || ''}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-2.5">
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
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 shadow-sm transition-colors"
            >
              <Check size={14} />
              {mode === 'edit' ? 'Save Changes' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

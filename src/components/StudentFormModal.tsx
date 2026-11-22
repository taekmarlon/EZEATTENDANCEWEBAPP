import { useState, useEffect, FormEvent } from 'react';
import { X } from 'lucide-react';
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
  defaultTeacherPhoto,
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
  const [teacherPhoto, setTeacherPhoto] = useState<string | undefined>(undefined);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const resolvedTeacherName = (
    mode === 'edit' ? initialStudent?.teacherName || defaultTeacherName : defaultTeacherName
  ).trim();

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && initialStudent) {
      setName(initialStudent.name);
      setRollNo(initialStudent.rollNo);
      setGradeLevel(initialStudent.gradeLevel || '');
      setGender(initialStudent.gender || '');
      setContactNo(initialStudent.contactNo || '');
      setPhoto(initialStudent.photo);
      setTeacherPhoto(initialStudent.teacherPhoto);
      setCustomFields(initialStudent.customFields || {});
    } else {
      setName('');
      setRollNo('');
      setGradeLevel('');
      setGender('');
      setContactNo('');
      setPhoto(undefined);
      setTeacherPhoto(undefined);
      setCustomFields({});
    }
  }, [isOpen, mode, initialStudent]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rollNo.trim()) return;
    onSave({
      name: name.trim(),
      rollNo: rollNo.trim(),
      gradeLevel: gradeLevel.trim(),
      gender: gender.trim(),
      contactNo: contactNo.trim(),
      teacherName: resolvedTeacherName,
      photo,
      teacherPhoto,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    });
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {mode === 'edit' ? 'Edit Student Profile' : 'Add Student'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Student details, portrait photo, and contact information.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1"
            aria-label="Close student form"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Portrait upload row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-slate-100">
            <PhotoUploader
              label="Student Picture"
              nameForFallback={name || 'Student'}
              value={photo}
              onChange={setPhoto}
              size="lg"
            />
            <div className="space-y-1">
              <PhotoUploader
                label="Teacher Picture (Optional)"
                nameForFallback={resolvedTeacherName || 'Teacher'}
                value={teacherPhoto || defaultTeacherPhoto}
                onChange={setTeacherPhoto}
                canRemove={Boolean(teacherPhoto)}
                size="lg"
              />
              {!teacherPhoto && defaultTeacherPhoto && (
                <p className="text-[11px] text-slate-400">
                  Using specialization default teacher photo. Upload to override.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Student Name <span className="text-rose-600">*</span>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Roll / ID No. <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
                placeholder="e.g. EZ-2026-001"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Grade Level
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Gender
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Contact No.
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {field.label}
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
              disabled={!name.trim() || !rollNo.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              {mode === 'edit' ? 'Save Changes' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

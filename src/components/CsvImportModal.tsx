import { useState, useRef, ChangeEvent } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { CustomStudentField, StudentProfileInput } from '../types';
import { parseStudentsCsv, CsvParseResult } from '../utils/csvImport';
import { downloadCSV } from '../utils/export';

interface CsvImportModalProps {
  isOpen: boolean;
  schoolName: string;
  specName: string;
  defaultTeacherName?: string;
  customFields: CustomStudentField[];
  onImport: (students: StudentProfileInput[]) => void;
  onClose: () => void;
}

export default function CsvImportModal({
  isOpen,
  schoolName,
  specName,
  defaultTeacherName = '',
  customFields,
  onImport,
  onClose,
}: CsvImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setFileName('');
    setParseResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const handleFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseStudentsCsv(content, customFields, defaultTeacherName);
      setParseResult(parsed);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Student Name',
      'Roll / ID No.',
      'Grade Level',
      'Gender',
      'Contact No.',
      ...customFields.map((f) => f.label),
    ];
    const sampleRows = [
      ['Maria Santos', '', 'Grade 8', 'Female', '0917-555-0192', ...customFields.map(() => '')],
      ['Juan Dela Cruz', 'EZ-2026-002', 'Grade 9', 'Male', '', ...customFields.map(() => '')],
    ];
    downloadCSV(`${schoolName}_${specName}_Import_Template.csv`, headers, sampleRows);
  };

  const handleConfirm = () => {
    if (!parseResult || parseResult.students.length === 0) return;
    onImport(parseResult.students);
    resetAndClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={resetAndClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50/70 via-white to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Import Students from CSV</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {schoolName} · {specName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Close CSV import modal"
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-xs text-slate-600">
              <p className="font-bold text-slate-800">Flexible Column Mapping</p>
              <p>
                Required column: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">Student Name</code>.
                Optional columns: <code className="font-mono bg-white px-1 rounded border border-slate-200">Roll / ID No.</code>,{' '}
                <code className="font-mono bg-white px-1 rounded border border-slate-200">Grade Level</code>,{' '}
                <code className="font-mono bg-white px-1 rounded border border-slate-200">Gender</code>,{' '}
                <code className="font-mono bg-white px-1 rounded border border-slate-200">Contact No.</code>
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              <Download size={13} /> Sample Template
            </button>
          </div>

          <div>
            <input
              ref={fileInputRef}
              id="csv-student-import-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-6 px-4 border-2 border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50/40 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors text-center"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
                <Upload size={18} />
              </div>
              <div className="text-xs font-bold text-slate-800">
                {fileName ? `Selected: ${fileName}` : 'Choose a CSV file to import students'}
              </div>
              <div className="text-[11px] text-slate-500">
                Works without a Roll / ID Number column
              </div>
            </button>
          </div>

          {parseResult?.error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{parseResult.error}</span>
            </div>
          )}

          {parseResult && !parseResult.error && parseResult.students.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  Ready to import {parseResult.students.length} student
                  {parseResult.students.length === 1 ? '' : 's'}
                </div>
                {parseResult.skippedRows > 0 && (
                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-medium">
                    Skipped {parseResult.skippedRows} empty row(s)
                  </span>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Student Name</th>
                        <th className="py-2 px-3">Roll / ID No.</th>
                        <th className="py-2 px-3">Grade Level</th>
                        <th className="py-2 px-3">Gender</th>
                        <th className="py-2 px-3">Contact No.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parseResult.students.slice(0, 8).map((st, idx) => (
                        <tr key={`${st.name}-${idx}`}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{st.name}</td>
                          <td className="py-2 px-3 font-mono text-slate-500">
                            {st.rollNo || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{st.gradeLevel || '—'}</td>
                          <td className="py-2 px-3 text-slate-600">{st.gender || '—'}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">
                            {st.contactNo || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parseResult.students.length > 8 && (
                  <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 font-medium">
                    Showing first 8 of {parseResult.students.length} parsed students.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={resetAndClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parseResult || !!parseResult.error || parseResult.students.length === 0}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 shadow-sm transition-colors"
          >
            <Upload size={14} />
            Import {parseResult?.students.length || 0} Student
            {parseResult?.students.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

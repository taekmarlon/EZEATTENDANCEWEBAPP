import { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Bookmark,
  Download,
  Printer,
  RotateCcw,
  ArrowUpDown,
  X,
} from 'lucide-react';
import {
  QueryDataset,
  QueryOperator,
  QueryPreset,
  QueryRule,
  School,
  Specialization,
  Student,
} from '../types';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { downloadCSV, triggerPrintReport } from '../utils/export';
import {
  DATASET_FIELDS,
  FieldMeta,
  OPERATORS,
  buildDatasetRows,
  filterAndSortQueryRows,
  getBuiltInPresets,
} from '../utils/query';
import { PortraitAvatar } from './Avatar';
import StudentScorecardModal from './StudentScorecardModal';
import ConfirmModal from './ConfirmModal';

export default function QueryBuilderView() {
  const { schools, savedPresets, systemSettings, addQueryPreset, deleteQueryPreset } = useStore();
  const { showToast } = useToast();

  const builtInPresets = useMemo(() => getBuiltInPresets(), []);

  const [dataset, setDataset] = useState<QueryDataset>('students');
  const [schoolId, setSchoolId] = useState<string>('all');
  const [specId, setSpecId] = useState<string>('all');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [rules, setRules] = useState<QueryRule[]>([]);
  const [sortField, setSortField] = useState<string>('studentName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [deletingPreset, setDeletingPreset] = useState<QueryPreset | null>(null);
  const [activeScorecard, setActiveScorecard] = useState<{
    school: School;
    spec: Specialization;
    student: Student;
  } | null>(null);

  const fields = DATASET_FIELDS[dataset];

  const availableSpecs = useMemo(() => {
    if (schoolId === 'all') return schools.flatMap((s) => s.specializations);
    return schools.find((s) => s.id === schoolId)?.specializations || [];
  }, [schools, schoolId]);

  const handleDatasetChange = (next: QueryDataset) => {
    setDataset(next);
    setRules([]);
    setSortField(next === 'students' ? 'studentName' : 'date');
    setSortDir(next === 'students' ? 'asc' : 'desc');
  };

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        field: fields[0].key,
        operator: 'contains',
        value: '',
      },
    ]);
  };

  const updateRule = (id: string, patch: Partial<QueryRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const applyPreset = (preset: QueryPreset) => {
    setDataset(preset.dataset);
    setSchoolId(preset.schoolId);
    setSpecId(preset.specId);
    setDateStart(preset.dateStart);
    setDateEnd(preset.dateEnd);
    setRules(preset.rules.map((r) => ({ ...r, id: crypto.randomUUID() })));
    setSortField(preset.sortField);
    setSortDir(preset.sortDir);
    showToast(`Applied preset "${preset.name}".`, 'info');
  };

  const resetQuery = () => {
    setSchoolId('all');
    setSpecId('all');
    setDateStart('');
    setDateEnd('');
    setRules([]);
    setSortField(dataset === 'students' ? 'studentName' : 'date');
    setSortDir('asc');
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    addQueryPreset({
      name: presetName.trim(),
      dataset,
      schoolId,
      specId,
      dateStart,
      dateEnd,
      rules,
      sortField,
      sortDir,
    });
    showToast(`Saved query preset "${presetName.trim()}".`);
    setPresetName('');
    setIsSavingPreset(false);
  };

  // Build rows for selected dataset
  const allDatasetRows = useMemo(
    () => buildDatasetRows(schools, { dataset, schoolId, specId, dateStart, dateEnd }),
    [schools, schoolId, specId, dateStart, dateEnd, dataset]
  );

  const matchedRows = useMemo(
    () => filterAndSortQueryRows(allDatasetRows, rules, sortField, sortDir),
    [allDatasetRows, rules, sortField, sortDir]
  );

  const toggleSort = (fieldKey: string) => {
    if (sortField === fieldKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(fieldKey);
      setSortDir('asc');
    }
  };

  const visibleColumns: FieldMeta[] = useMemo(() => {
    if (dataset === 'students') {
      return [
        { key: 'studentName', label: 'Student', type: 'text' },
        { key: 'gradeLevel', label: 'Grade', type: 'text' },
        { key: 'gender', label: 'Gender', type: 'text' },
        { key: 'contactNo', label: 'Contact No.', type: 'text' },
        { key: 'teacherName', label: 'Teacher', type: 'text' },
        { key: 'schoolName', label: 'School / Spec', type: 'text' },
        { key: 'attendancePct', label: 'Attendance %', type: 'number' },
        { key: 'rubricAvg', label: 'Rubric Avg', type: 'number' },
      ];
    }
    if (dataset === 'attendance') {
      return [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'studentName', label: 'Student', type: 'text' },
        { key: 'gradeLevel', label: 'Grade', type: 'text' },
        { key: 'teacherName', label: 'Teacher', type: 'text' },
        { key: 'schoolName', label: 'School / Spec', type: 'text' },
        { key: 'status', label: 'Status', type: 'text' },
      ];
    }
    return [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'studentName', label: 'Student', type: 'text' },
      { key: 'gradeLevel', label: 'Grade', type: 'text' },
      { key: 'teacherName', label: 'Teacher', type: 'text' },
      { key: 'criterionName', label: 'Criterion', type: 'text' },
      { key: 'score', label: 'Score', type: 'number' },
    ];
  }, [dataset]);

  const handleExportCSV = () => {
    const headers = fields.map((f) => f.label);
    const rows = matchedRows.map((row) => fields.map((f) => row.values[f.key] ?? ''));
    downloadCSV(`EZ_Center_Query_${dataset}.csv`, headers, rows);
    showToast(`Exported ${matchedRows.length} query result row(s) to CSV.`);
  };

  return (
    <>
      <div
        className={`max-w-6xl mx-auto flex flex-col gap-6 pb-12 print-full-width ${
          activeScorecard ? 'no-print' : ''
        }`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Visual Query Builder
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Filter students, attendance logs, and rubric evaluations across all schools and save
              reusable presets.
            </p>
          </div>
          <div className="no-print flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={matchedRows.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (!triggerPrintReport()) {
                  showToast(
                    'System printing is unavailable in the Android app. Use Export CSV or open in Chrome for PDF.',
                    'info'
                  );
                }
              }}
              disabled={matchedRows.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Printer size={14} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Presets Bar */}
        <div className="no-print bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800">Query Presets</span>
            {isSavingPreset ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Preset name..."
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSavePreset();
                  }}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={!presetName.trim()}
                  className="px-3 py-1 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSavingPreset(false);
                    setPresetName('');
                  }}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSavingPreset(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900 transition-colors"
              >
                <Bookmark size={13} /> Save Current Query
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {builtInPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-200 rounded-lg text-xs font-semibold text-slate-700 hover:text-violet-700 transition-colors whitespace-nowrap"
              >
                {preset.name}
              </button>
            ))}
            {savedPresets.map((preset) => (
              <div
                key={preset.id}
                className="inline-flex items-center bg-violet-50/70 border border-violet-200 rounded-lg overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100/70 transition-colors whitespace-nowrap"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingPreset(preset)}
                  aria-label={`Delete preset ${preset.name}`}
                  className="px-2 py-1.5 text-violet-400 hover:text-rose-600 transition-colors border-l border-violet-200"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Dataset & Filter Builder */}
        <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          {/* Dataset Switcher + Scope */}
          <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                Target Dataset
              </label>
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg gap-1">
                {(
                  [
                    ['students', 'Students Summary'],
                    ['attendance', 'Attendance Logs'],
                    ['evaluations', 'Rubric Evaluations'],
                  ] as [QueryDataset, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleDatasetChange(key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      dataset === key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  School
                </label>
                <select
                  value={schoolId}
                  onChange={(e) => {
                    setSchoolId(e.target.value);
                    setSpecId('all');
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
                >
                  <option value="all">All Schools</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Specialization
                </label>
                <select
                  value={specId}
                  onChange={(e) => setSpecId(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
                >
                  <option value="all">All Specializations</option>
                  {availableSpecs.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Date From / To
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono tabular-nums text-slate-800 focus:outline-none focus:border-violet-500"
                  />
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono tabular-nums text-slate-800 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Visual Filter Rules */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Filter Conditions ({rules.length})
              </span>
              <div className="flex items-center gap-3">
                {(rules.length > 0 || schoolId !== 'all' || dateStart || dateEnd) && (
                  <button
                    type="button"
                    onClick={resetQuery}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={addRule}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <Plus size={13} /> Add Filter Rule
                </button>
              </div>
            </div>

            {rules.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                No active filter rules — showing all records in the selected scope. Click “Add
                Filter Rule” to narrow by grade level, gender, teacher, attendance %, or rubric
                score.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule, idx) => {
                  const fieldMeta = fields.find((f) => f.key === rule.field) || fields[0];
                  const hideValue =
                    rule.operator === 'is_empty' || rule.operator === 'not_empty';
                  return (
                    <div key={rule.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-400 w-10">
                        {idx === 0 ? 'Where' : 'And'}
                      </span>
                      <select
                        value={rule.field}
                        onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
                      >
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={rule.operator}
                        onChange={(e) =>
                          updateRule(rule.id, { operator: e.target.value as QueryOperator })
                        }
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      {!hideValue && (
                        <input
                          type={
                            fieldMeta.type === 'number'
                              ? 'number'
                              : fieldMeta.type === 'date'
                              ? 'date'
                              : 'text'
                          }
                          step="any"
                          placeholder={`Enter ${fieldMeta.label.toLowerCase()}...`}
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="flex-1 min-w-[160px] max-w-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeRule(rule.id)}
                        aria-label="Remove filter rule"
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Live Query Results Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900">
              Query Results
              <span className="ml-2 font-mono tabular-nums font-medium text-slate-500">
                {matchedRows.length} of {allDatasetRows.length} rows
              </span>
            </div>
            {dataset === 'students' && (
              <span className="text-[11px] text-slate-500">
                Click any student row to open their scorecard
              </span>
            )}
          </div>

          {matchedRows.length === 0 ? (
            <div className="py-12 px-6 text-center text-xs text-slate-500">
              No records match this query.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-3 px-4 font-semibold whitespace-nowrap ${
                          col.type === 'number' ? 'text-right' : 'text-left'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="inline-flex items-center gap-1 hover:text-slate-900"
                        >
                          {col.label} <ArrowUpDown size={11} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchedRows.map((row) => (
                    <tr
                      key={row.rowKey}
                      onClick={() =>
                        setActiveScorecard({
                          school: row.school,
                          spec: row.spec,
                          student: row.student,
                        })
                      }
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      {visibleColumns.map((col) => {
                        const val = row.values[col.key];
                        if (col.key === 'studentName') {
                          return (
                            <td key={col.key} className="py-3 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2.5">
                                <PortraitAvatar
                                  src={row.student.photo}
                                  name={row.student.name}
                                  size="xs"
                                  tone="slate"
                                />
                                <div>
                                  <div className="font-semibold text-slate-900">
                                    {row.student.name}
                                  </div>
                                  <div className="text-[10px] font-mono tabular-nums text-slate-400">
                                    {row.student.rollNo}
                                  </div>
                                </div>
                              </div>
                            </td>
                          );
                        }
                        if (col.key === 'schoolName') {
                          return (
                            <td key={col.key} className="py-3 px-4 text-slate-600 whitespace-nowrap">
                              {row.school.name} · {row.spec.name}
                            </td>
                          );
                        }
                        if (col.key === 'attendancePct') {
                          const num = typeof val === 'number' ? val : null;
                          return (
                            <td
                              key={col.key}
                              className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${
                                num === null
                                  ? 'text-slate-400'
                                  : num >= systemSettings.attendanceThreshold
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {num !== null ? `${num}%` : '--'}
                            </td>
                          );
                        }
                        if (col.key === 'status') {
                          return (
                            <td
                              key={col.key}
                              className={`py-3 px-4 font-semibold whitespace-nowrap ${
                                val === 'Present' ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {val}
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.key}
                            className={`py-3 px-4 whitespace-nowrap ${
                              col.type === 'number'
                                ? 'text-right font-mono tabular-nums font-semibold text-slate-900'
                                : col.key === 'contactNo' || col.type === 'date'
                                ? 'font-mono tabular-nums text-slate-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {val !== null && val !== undefined && val !== '' ? String(val) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {activeScorecard && (
        <StudentScorecardModal
          school={activeScorecard.school}
          spec={activeScorecard.spec}
          student={activeScorecard.student}
          dateStart={dateStart}
          dateEnd={dateEnd}
          attendanceThreshold={systemSettings.attendanceThreshold}
          rubricMax={systemSettings.rubricMax}
          onClose={() => setActiveScorecard(null)}
        />
      )}

      <ConfirmModal
        isOpen={!!deletingPreset}
        title="Delete Saved Query Preset"
        confirmText="Delete Preset"
        message={
          <p>
            Are you sure you want to delete saved query preset{' '}
            <strong>{deletingPreset?.name}</strong>?
          </p>
        }
        onConfirm={() => {
          if (deletingPreset) {
            deleteQueryPreset(deletingPreset.id);
            showToast(`Removed preset "${deletingPreset.name}".`, 'info');
          }
        }}
        onCancel={() => setDeletingPreset(null)}
      />
    </>
  );
}

import { useState, useEffect, FormEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Save,
  Trash2,
  X,
  ClipboardCheck,
} from 'lucide-react';
import { School, Specialization, RubricEvaluation } from '../types';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { downloadCSV } from '../utils/export';
import { PortraitAvatar } from './Avatar';
import ConfirmModal from './ConfirmModal';
import { format } from 'date-fns';

interface RubricsViewProps {
  school: School;
  spec: Specialization;
}

export default function RubricsView({ school, spec }: RubricsViewProps) {
  const {
    addRubricCriterion,
    deleteRubricCriterion,
    saveEvaluation,
    deleteEvaluation,
    systemSettings,
    permissions,
  } = useStore();
  const { showToast } = useToast();

  const scaleValues = Array.from(
    { length: Math.max(1, systemSettings.rubricMax - systemSettings.rubricMin + 1) },
    (_, idx) => systemSettings.rubricMin + idx
  );

  const [studentIndex, setStudentIndex] = useState(0);
  const [newCriterionName, setNewCriterionName] = useState('');
  const [evalDate, setEvalDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [scores, setScores] = useState<Record<string, number>>({});
  const [deletingCriterion, setDeletingCriterion] = useState<{ id: string; name: string } | null>(
    null
  );
  const [confirmingDeleteEval, setConfirmingDeleteEval] = useState(false);

  useEffect(() => {
    setNewCriterionName('');
  }, [spec.id]);

  // Keep index valid when switching specializations or deleting students
  useEffect(() => {
    if (studentIndex >= spec.students.length) {
      setStudentIndex(Math.max(0, spec.students.length - 1));
    }
  }, [spec.id, spec.students.length, studentIndex]);

  const student = spec.students[studentIndex];

  useEffect(() => {
    if (!student) {
      setScores({});
      return;
    }
    const existing = student.evaluations.find((e) => e.date === evalDate);
    setScores(existing ? { ...existing.scores } : {});
  }, [student, evalDate]);

  const handlePrevStudent = () => {
    if (studentIndex > 0) setStudentIndex((i) => i - 1);
  };

  const handleNextStudent = () => {
    if (studentIndex < spec.students.length - 1) setStudentIndex((i) => i + 1);
  };

  const handleAddCriterion = (e: FormEvent) => {
    e.preventDefault();
    if (newCriterionName.trim()) {
      addRubricCriterion(school.id, spec.id, newCriterionName.trim());
      setNewCriterionName('');
      showToast(`Added rubric criterion "${newCriterionName.trim()}".`);
    }
  };

  const handleScoreChange = (criterionId: string, score: number) => {
    setScores((prev) => {
      if (prev[criterionId] === score) {
        const next = { ...prev };
        delete next[criterionId];
        return next;
      }
      return { ...prev, [criterionId]: score };
    });
  };

  const existingEvaluation = student?.evaluations.find((e) => e.date === evalDate);
  const activeScoreCount = spec.rubricCriteria.filter(
    (c) =>
      typeof scores[c.id] === 'number' &&
      scores[c.id] >= systemSettings.rubricMin &&
      scores[c.id] <= systemSettings.rubricMax
  ).length;

  const handleSaveEvaluation = () => {
    if (!student || !permissions.canConfigureRubricsAndGrade) return;
    if (activeScoreCount === 0) {
      showToast(
        `Select at least one criterion score (${systemSettings.rubricMin}–${systemSettings.rubricMax}) before saving.`,
        'info'
      );
      return;
    }
    const validScores: Record<string, number> = {};
    for (const c of spec.rubricCriteria) {
      const val = scores[c.id];
      if (
        typeof val === 'number' &&
        val >= systemSettings.rubricMin &&
        val <= systemSettings.rubricMax
      ) {
        validScores[c.id] = val;
      }
    }
    const evaluation: RubricEvaluation = {
      id: existingEvaluation ? existingEvaluation.id : crypto.randomUUID(),
      date: evalDate,
      scores: validScores,
    };
    saveEvaluation(school.id, spec.id, student.id, evaluation);
    showToast(`Saved rubric evaluation for ${student.name} (${evalDate}).`);
  };

  const handleDeleteEvaluation = () => {
    if (!student || !existingEvaluation) return;
    deleteEvaluation(school.id, spec.id, student.id, existingEvaluation.id);
    setScores({});
    showToast(`Deleted evaluation for ${student.name} (${evalDate}).`, 'info');
  };

  const handleExportCSV = () => {
    const headers = [
      'Student Name',
      'Roll/Card No',
      'Grade Level',
      'Gender',
      'Contact No.',
      'Teacher Name',
      'Evaluation Date',
      ...spec.rubricCriteria.map((c) => c.name),
    ];

    const rows: (string | number)[][] = [];
    spec.students.forEach((s) => {
      s.evaluations.forEach((ev) => {
        rows.push([
          s.name,
          s.rollNo,
          s.gradeLevel || '',
          s.gender || '',
          s.contactNo || '',
          s.teacherName || spec.teacherName || '',
          ev.date,
          ...spec.rubricCriteria.map((c) => ev.scores[c.id] ?? ''),
        ]);
      });
    });

    if (rows.length === 0) {
      showToast('No evaluations recorded yet to export.', 'info');
      return;
    }

    downloadCSV(`${school.name}_${spec.name}_Rubrics.csv`, headers, rows);
    showToast(`Exported ${rows.length} rubric evaluations to CSV.`);
  };

  if (spec.students.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-16">
        <div className="text-center bg-white p-10 rounded-2xl border border-slate-200 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center mx-auto mb-3">
            <ClipboardCheck size={22} />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1.5">No Students Enrolled</h2>
          <p className="text-sm text-slate-500">
            Add students in the Attendance roster first to score rubric evaluations.
          </p>
        </div>
      </div>
    );
  }

  const effectiveTeacher = student?.teacherName || spec.teacherName || '';
  const effectiveTeacherPhoto = student?.teacherPhoto || spec.teacherPhoto;

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6 pb-10">
      {/* Criteria Manager */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Rubric Criteria</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define the {systemSettings.rubricMin}–{systemSettings.rubricMax} scoring dimensions
                evaluated for {spec.name}.
              </p>
            </div>
          </div>
          {permissions.canExportReports && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold text-xs transition-colors whitespace-nowrap"
            >
              <Download size={14} /> Export Evaluations CSV
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {spec.rubricCriteria.length === 0 && (
            <span className="text-xs text-slate-400">No criteria defined yet.</span>
          )}
          {spec.rubricCriteria.map((c) => (
            <div
              key={c.id}
              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-md text-xs font-semibold text-slate-700"
            >
              <span>{c.name}</span>
              {permissions.canDeleteEvaluationsOrCriteria && (
                <button
                  type="button"
                  onClick={() => setDeletingCriterion({ id: c.id, name: c.name })}
                  className="text-slate-400 hover:text-rose-600 transition-colors"
                  aria-label={`Remove ${c.name}`}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {permissions.canConfigureRubrics && (
          <form onSubmit={handleAddCriterion} className="flex gap-2">
            <input
              type="text"
              placeholder="Add new criterion (e.g. Communication, Lab Technique)"
              value={newCriterionName}
              onChange={(e) => setNewCriterionName(e.target.value)}
              className="flex-1 max-w-md border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newCriterionName.trim()}
              className="inline-flex items-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Plus size={14} /> Add Criterion
            </button>
          </form>
        )}
      </div>

      {/* Student Evaluator */}
      {student && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 px-5 py-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handlePrevStudent}
              disabled={studentIndex === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-slate-100 text-xs font-semibold rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <ChevronLeft size={14} /> Prev
            </button>

            <div className="flex items-center gap-3.5 min-w-0">
              <PortraitAvatar src={student.photo} name={student.name} size="md" tone="dark" />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white leading-tight truncate">
                  {student.name}
                </h2>
                <div className="flex flex-wrap items-center gap-x-2 text-slate-400 text-xs mt-0.5">
                  {student.rollNo && (
                    <>
                      <span className="font-mono tabular-nums">ID {student.rollNo}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  {student.gradeLevel && (
                    <>
                      <span>{student.gradeLevel}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span className="font-mono tabular-nums">
                    {studentIndex + 1} of {spec.students.length}
                  </span>
                </div>
              </div>
              {effectiveTeacher && (
                <div className="hidden md:flex items-center gap-2 pl-4 ml-2 border-l border-slate-700">
                  <PortraitAvatar
                    src={effectiveTeacherPhoto}
                    name={effectiveTeacher}
                    size="xs"
                    tone="dark"
                  />
                  <span className="text-xs text-slate-300 truncate max-w-[140px]">
                    {effectiveTeacher}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleNextStudent}
              disabled={studentIndex === spec.students.length - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-slate-100 text-xs font-semibold rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>

          <div className="p-6 bg-slate-50/60">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Evaluation Session</h3>
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-semibold text-slate-500">Session Date</label>
                <input
                  type="date"
                  value={evalDate}
                  onChange={(e) => setEvalDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg text-xs font-mono tabular-nums px-3 py-1.5 text-slate-800 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>

            {spec.rubricCriteria.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-slate-500">
                  Add rubric criteria above to start scoring students.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-w-2xl mx-auto">
                {spec.rubricCriteria.map((criterion) => {
                  const score = scores[criterion.id] || 0;
                  return (
                    <div
                      key={criterion.id}
                      className="bg-white px-4 py-3.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                    >
                      <span className="text-sm font-semibold text-slate-800">
                        {criterion.name}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {scaleValues.map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!permissions.canLogAttendanceAndGrade}
                            title={systemSettings.rubricLabels[String(val)] || String(val)}
                            onClick={() => handleScoreChange(criterion.id, val)}
                            className={`w-10 h-10 rounded-lg font-mono tabular-nums font-bold text-sm flex items-center justify-center transition-colors disabled:opacity-60 ${
                              score === val
                                ? 'bg-violet-600 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {(permissions.canLogAttendanceAndGrade || permissions.canDeleteEvaluationsOrCriteria) && (
                  <div className="pt-4 flex items-center justify-end gap-2.5">
                    {existingEvaluation && permissions.canDeleteEvaluationsOrCriteria && (
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteEval(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-rose-200 text-rose-600 text-xs font-semibold rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 size={14} /> Delete Evaluation
                      </button>
                    )}
                    {permissions.canLogAttendanceAndGrade && (
                      <button
                        type="button"
                        disabled={activeScoreCount === 0}
                        onClick={handleSaveEvaluation}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-xs font-semibold rounded-lg shadow-xs hover:bg-violet-700 disabled:opacity-45 transition-colors"
                      >
                        <Save size={15} /> Save Evaluation
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deletingCriterion}
        title="Delete Rubric Criterion"
        confirmText="Delete Criterion"
        message={
          <p>
            Are you sure you want to remove <strong>{deletingCriterion?.name}</strong> from{' '}
            {spec.name}? Existing scores for this criterion will be deleted.
          </p>
        }
        onConfirm={() => {
          if (deletingCriterion) {
            deleteRubricCriterion(school.id, spec.id, deletingCriterion.id);
            showToast(`Removed criterion "${deletingCriterion.name}".`, 'info');
          }
        }}
        onCancel={() => setDeletingCriterion(null)}
      />

      <ConfirmModal
        isOpen={confirmingDeleteEval}
        title="Delete Evaluation"
        confirmText="Delete Evaluation"
        message={
          <p>
            Are you sure you want to delete this rubric evaluation for{' '}
            <strong>{student?.name}</strong> ({evalDate})?
          </p>
        }
        onConfirm={handleDeleteEvaluation}
        onCancel={() => setConfirmingDeleteEval(false)}
      />
    </div>
  );
}

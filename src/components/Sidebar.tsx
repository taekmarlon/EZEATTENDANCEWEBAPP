import { useState, FormEvent } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown, X, Pencil } from 'lucide-react';
import { School } from '../types';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ConfirmModal';
import SchoolFormModal from './SchoolFormModal';
import PWAInstallButton from './PWAInstallButton';
import { PortraitAvatar } from './Avatar';

interface SidebarProps {
  activeSchoolId: string | null;
  setActiveSchoolId: (id: string | null) => void;
  activeSpecId: string | null;
  setActiveSpecId: (id: string | null) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({
  activeSchoolId,
  setActiveSchoolId,
  activeSpecId,
  setActiveSpecId,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const {
    schools,
    systemSettings,
    permissions,
    addSchool,
    updateSchool,
    deleteSchool,
    addSpecialization,
    deleteSpecialization,
  } = useStore();
  const { showToast } = useToast();

  const [expandedSchools, setExpandedSchools] = useState<Record<string, boolean>>({});
  const [newSchoolName, setNewSchoolName] = useState('');
  const [isCreatingSchoolModal, setIsCreatingSchoolModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [newSpecName, setNewSpecName] = useState('');
  const [addingSpecTo, setAddingSpecTo] = useState<string | null>(null);

  const [deletingSchool, setDeletingSchool] = useState<string | null>(null);
  const [deletingSpec, setDeletingSpec] = useState<{
    schoolId: string;
    specId: string;
  } | null>(null);

  const toggleSchool = (id: string) => {
    setExpandedSchools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddSchool = (e: FormEvent) => {
    e.preventDefault();
    if (newSchoolName.trim() && permissions.canCreateSchools) {
      const created = addSchool(newSchoolName.trim());
      setNewSchoolName('');
      setActiveSchoolId(created.id);
      setActiveSpecId(null);
      setExpandedSchools((prev) => ({ ...prev, [created.id]: true }));
      showToast(`Created school "${created.name}".`);
    }
  };

  const handleAddSpec = (e: FormEvent, schoolId: string) => {
    e.preventDefault();
    if (newSpecName.trim() && permissions.canCreateSpecializations) {
      addSpecialization(schoolId, newSpecName.trim());
      setNewSpecName('');
      setAddingSpecTo(null);
      setExpandedSchools((prev) => ({ ...prev, [schoolId]: true }));
      showToast(`Added specialization "${newSpecName.trim()}".`);
    }
  };

  const sidebarContent = (
    <aside className="no-print w-72 lg:w-64 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
      <div className="px-5 py-4 h-16 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h1
            className="font-extrabold text-base tracking-tight leading-none truncate"
            style={{ color: systemSettings.primaryColor }}
          >
            {systemSettings.portalName}
          </h1>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Supabase Attendance &amp; Rubrics
          </p>
        </div>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close schools menu"
            className="lg:hidden min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="text-xs font-semibold text-slate-500">
              Schools ({schools.length})
            </label>
            {permissions.canCreateSchools && (
              <button
                type="button"
                onClick={() => setIsCreatingSchoolModal(true)}
                className="text-[11px] font-semibold text-violet-700 hover:text-violet-900"
              >
                + With Logo
              </button>
            )}
          </div>

          {permissions.canCreateSchools && (
            <form onSubmit={handleAddSchool} className="mb-4 flex gap-1.5">
              <input
                type="text"
                placeholder="New school name..."
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <button
                type="submit"
                disabled={!newSchoolName.trim()}
                aria-label="Add school"
                className="bg-violet-600 text-white min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors shrink-0"
              >
                <Plus size={16} />
              </button>
            </form>
          )}

          <div className="space-y-2">
            {schools.map((school) => {
              const isSelected = activeSchoolId === school.id;
              const isExpanded = expandedSchools[school.id] ?? isSelected;

              return (
                <div key={school.id} className="select-none">
                  <div
                    className={`flex items-center justify-between px-2.5 py-2.5 min-h-[48px] rounded-lg cursor-pointer transition-colors group border ${
                      isSelected
                        ? 'bg-violet-50/70 text-violet-900 border-violet-200'
                        : 'border-transparent hover:bg-slate-50 text-slate-700'
                    }`}
                    onClick={() => {
                      setActiveSchoolId(school.id);
                      if (
                        !school.specializations.some((sp) => sp.id === activeSpecId) &&
                        school.specializations.length > 0
                      ) {
                        setActiveSpecId(school.specializations[0].id);
                      } else if (school.specializations.length === 0) {
                        setActiveSpecId(null);
                      }
                      if (!isExpanded) toggleSchool(school.id);
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PortraitAvatar
                        src={school.logo}
                        name={school.name}
                        fallbackText={school.name.substring(0, 3).toUpperCase()}
                        size="xs"
                        tone={isSelected ? 'violet' : 'slate'}
                        className="font-mono"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs truncate">{school.name}</div>
                        <div className="text-[10px] mt-0.5 text-slate-400 truncate">
                          {school.specializations.length} specialization
                          {school.specializations.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {permissions.canEditSchools && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSchool(school);
                          }}
                          aria-label={`Edit ${school.name}`}
                          title="Edit school name & logo"
                          className="text-slate-400 lg:text-slate-300 hover:text-violet-700 lg:opacity-0 group-hover:opacity-100 transition-opacity p-1.5"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {permissions.canDeleteSchools && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingSchool(school.id);
                          }}
                          aria-label={`Delete ${school.name}`}
                          className="text-slate-400 lg:text-slate-300 hover:text-rose-600 lg:opacity-0 group-hover:opacity-100 transition-opacity p-1.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSchool(school.id);
                        }}
                        aria-label={isExpanded ? 'Collapse school' : 'Expand school'}
                        className="p-1.5 hover:bg-slate-200/70 rounded text-slate-400"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-1.5 ml-3 pl-3 border-l border-slate-200 space-y-1">
                      {school.specializations.map((spec) => (
                        <div
                          key={spec.id}
                          className={`flex items-center justify-between px-2.5 py-2 min-h-[42px] rounded-md cursor-pointer transition-colors group ${
                            activeSpecId === spec.id
                              ? 'bg-slate-100 text-slate-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-600 font-medium'
                          }`}
                          onClick={() => {
                            setActiveSchoolId(school.id);
                            setActiveSpecId(spec.id);
                            if (onCloseMobile) onCloseMobile();
                          }}
                        >
                          <div className="min-w-0">
                            <div className="text-xs truncate">{spec.name}</div>
                            {(spec.coTeachers?.length || spec.teacherName) && (
                              <div className="text-[10px] text-slate-400 truncate">
                                {spec.coTeachers && spec.coTeachers.length > 0
                                  ? spec.coTeachers.map((t) => t.fullName).join(' & ')
                                  : spec.teacherName}
                              </div>
                            )}
                          </div>
                          {permissions.canDeleteSpecializations && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingSpec({ schoolId: school.id, specId: spec.id });
                              }}
                              aria-label={`Delete ${spec.name}`}
                              className="text-slate-400 lg:text-slate-300 hover:text-rose-600 lg:opacity-0 group-hover:opacity-100 transition-opacity p-1.5 shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}

                      {permissions.canCreateSpecializations &&
                        (addingSpecTo === school.id ? (
                          <form
                            onSubmit={(e) => handleAddSpec(e, school.id)}
                            className="py-1 flex gap-1.5"
                          >
                            <input
                              autoFocus
                              type="text"
                              placeholder="Specialization name..."
                              value={newSpecName}
                              onChange={(e) => setNewSpecName(e.target.value)}
                              onBlur={() => {
                                if (!newSpecName.trim()) setAddingSpecTo(null);
                              }}
                              className="flex-1 min-w-0 bg-white border border-violet-300 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                            />
                            <button
                              type="submit"
                              onMouseDown={(e) => e.preventDefault()}
                              disabled={!newSpecName.trim()}
                              aria-label="Confirm add specialization"
                              className="bg-violet-600 text-white px-2.5 py-1.5 rounded-md hover:bg-violet-700 disabled:opacity-40 transition-colors shrink-0"
                            >
                              <Plus size={14} />
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAddingSpecTo(school.id)}
                            className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-slate-500 hover:text-violet-700 font-medium transition-colors w-full text-left"
                          >
                            <Plus size={13} /> Add Specialization
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-100 shrink-0">
        <PWAInstallButton variant="sidebar" />
      </div>

      <SchoolFormModal
        isOpen={isCreatingSchoolModal || !!editingSchool}
        mode={editingSchool ? 'edit' : 'add'}
        initialSchool={editingSchool}
        onSave={(name, logo) => {
          if (editingSchool) {
            updateSchool(editingSchool.id, name, logo);
            showToast(`Updated "${name}".`);
            setEditingSchool(null);
          } else {
            const created = addSchool(name, logo);
            setActiveSchoolId(created.id);
            setActiveSpecId(null);
            setExpandedSchools((prev) => ({ ...prev, [created.id]: true }));
            showToast(`Created school "${created.name}".`);
          }
        }}
        onClose={() => {
          setIsCreatingSchoolModal(false);
          setEditingSchool(null);
        }}
      />

      <ConfirmModal
        isOpen={!!deletingSchool}
        title="Delete School"
        confirmText="Delete School"
        message={
          <p>
            Are you sure you want to delete this school from Supabase? All specializations,
            students, attendance logs, and rubric evaluations inside it will be permanently deleted.
          </p>
        }
        onConfirm={() => {
          if (deletingSchool) {
            deleteSchool(deletingSchool);
            if (activeSchoolId === deletingSchool) {
              setActiveSchoolId(null);
              setActiveSpecId(null);
            }
            showToast('Deleted school.', 'info');
          }
        }}
        onCancel={() => setDeletingSchool(null)}
      />

      <ConfirmModal
        isOpen={!!deletingSpec}
        title="Delete Specialization"
        confirmText="Delete Specialization"
        message={
          <p>
            Are you sure you want to delete this specialization? All students and records inside it
            will be removed. <strong>This action cannot be undone.</strong>
          </p>
        }
        onConfirm={() => {
          if (deletingSpec) {
            deleteSpecialization(deletingSpec.schoolId, deletingSpec.specId);
            if (activeSpecId === deletingSpec.specId) {
              setActiveSpecId(null);
            }
            showToast('Deleted specialization.', 'info');
          }
        }}
        onCancel={() => setDeletingSpec(null)}
      />
    </aside>
  );

  return (
    <>
      <div className="hidden lg:flex h-full shrink-0">{sidebarContent}</div>

      {mobileOpen && (
        <div
          className="no-print lg:hidden fixed inset-0 z-50 flex bg-slate-900/45 backdrop-blur-xs"
          onClick={onCloseMobile}
        >
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

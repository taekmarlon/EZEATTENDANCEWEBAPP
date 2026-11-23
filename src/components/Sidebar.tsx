import { useState, useMemo, FormEvent } from 'react';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Pencil,
  Search,
  Building2,
  ImagePlus,
  BookOpen,
  UserCheck,
  GraduationCap,
} from 'lucide-react';
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
  const [schoolSearch, setSchoolSearch] = useState('');
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

  const trimmedQuery = schoolSearch.trim().toLowerCase();

  const filteredSchools = useMemo(() => {
    if (!trimmedQuery) return schools;
    return schools.filter((sch) => {
      if (sch.name.toLowerCase().includes(trimmedQuery)) return true;
      return sch.specializations.some((sp) => {
        const specMatch = sp.name.toLowerCase().includes(trimmedQuery);
        const teacherMatch =
          (sp.teacherName || '').toLowerCase().includes(trimmedQuery) ||
          (sp.coTeachers || []).some((ct) => ct.fullName.toLowerCase().includes(trimmedQuery));
        return specMatch || teacherMatch;
      });
    });
  }, [schools, trimmedQuery]);

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
    <aside className="no-print w-72 lg:w-68 bg-white border-r border-slate-200/90 flex flex-col h-full shrink-0 shadow-[2px_0_10px_rgba(15,23,42,0.03)]">
      {/* Brand Header */}
      <div className="px-4 py-3.5 h-16 border-b border-slate-200/80 bg-gradient-to-r from-violet-50/70 via-white to-white flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
            style={{ backgroundColor: systemSettings.primaryColor }}
          >
            <GraduationCap size={18} />
          </div>
          <div className="min-w-0">
            <h1
              className="font-extrabold text-sm sm:text-base tracking-tight leading-none truncate"
              style={{ color: systemSettings.primaryColor }}
            >
              {systemSettings.portalName}
            </h1>
            <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
              Attendance &amp; Rubrics
            </p>
          </div>
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

      <div className="p-3.5 flex-1 overflow-y-auto space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Building2 size={13} className="text-violet-600" />
              <span>Schools ({schools.length})</span>
            </label>
            {permissions.canCreateSchools && (
              <button
                type="button"
                onClick={() => setIsCreatingSchoolModal(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900 px-2 py-0.5 rounded-md hover:bg-violet-50 transition-colors"
              >
                <ImagePlus size={12} /> With Logo
              </button>
            )}
          </div>

          {/* Sidebar Search Filter for Schools & Specializations */}
          {(permissions.canViewAllSchoolsAndReports || schools.length > 1) && (
            <div className="relative mb-2.5">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                aria-label="Filter schools in sidebar"
                placeholder="Search schools or classes..."
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              {schoolSearch && (
                <button
                  type="button"
                  onClick={() => setSchoolSearch('')}
                  aria-label="Clear school filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          {permissions.canCreateSchools && (
            <form onSubmit={handleAddSchool} className="mb-3.5 flex gap-1.5">
              <input
                type="text"
                placeholder="New school name..."
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <button
                type="submit"
                disabled={!newSchoolName.trim()}
                aria-label="Add school"
                className="bg-violet-600 text-white min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl hover:bg-violet-700 disabled:opacity-40 shadow-2xs transition-colors shrink-0"
              >
                <Plus size={16} />
              </button>
            </form>
          )}

          <div className="space-y-1.5">
            {filteredSchools.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                {schools.length === 0 ? 'No schools available yet.' : 'No schools match your filter.'}
              </div>
            )}
            {filteredSchools.map((school) => {
              const isSelected = activeSchoolId === school.id;
              const schoolNameMatches =
                !trimmedQuery || school.name.toLowerCase().includes(trimmedQuery);
              const visibleSpecs = schoolNameMatches
                ? school.specializations
                : school.specializations.filter((sp) => {
                    const specMatch = sp.name.toLowerCase().includes(trimmedQuery);
                    const teacherMatch =
                      (sp.teacherName || '').toLowerCase().includes(trimmedQuery) ||
                      (sp.coTeachers || []).some((ct) =>
                        ct.fullName.toLowerCase().includes(trimmedQuery)
                      );
                    return specMatch || teacherMatch;
                  });
              const isExpanded =
                Boolean(trimmedQuery && !schoolNameMatches && visibleSpecs.length > 0) ||
                (expandedSchools[school.id] ?? isSelected);

              return (
                <div key={school.id} className="select-none">
                  <div
                    className={`flex items-center justify-between px-2.5 py-2.5 min-h-[48px] rounded-xl cursor-pointer transition-all group border ${
                      isSelected
                        ? 'bg-gradient-to-r from-violet-50 to-indigo-50/60 text-violet-950 border-violet-200 shadow-2xs'
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
                        <div className="font-bold text-xs truncate">{school.name}</div>
                        <div className="text-[10px] mt-0.5 text-slate-500 truncate">
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
                        className="p-1.5 hover:bg-violet-100/60 rounded-lg text-slate-400"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-1.5 ml-3.5 pl-2.5 border-l-2 border-violet-100 space-y-1">
                      {visibleSpecs.map((spec) => {
                        const isSpecActive = activeSpecId === spec.id;
                        const teacherLabel =
                          spec.coTeachers && spec.coTeachers.length > 0
                            ? spec.coTeachers.map((t) => t.fullName).join(' & ')
                            : spec.teacherName || '';
                        return (
                          <div
                            key={spec.id}
                            className={`flex items-center justify-between px-2.5 py-2 min-h-[40px] rounded-lg cursor-pointer transition-colors group ${
                              isSpecActive
                                ? 'bg-violet-600 text-white font-semibold shadow-2xs'
                                : 'hover:bg-slate-100/80 text-slate-700 font-medium'
                            }`}
                            onClick={() => {
                              setActiveSchoolId(school.id);
                              setActiveSpecId(spec.id);
                              if (onCloseMobile) onCloseMobile();
                            }}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <BookOpen
                                size={12}
                                className={`mt-0.5 shrink-0 ${
                                  isSpecActive ? 'text-violet-100' : 'text-violet-500'
                                }`}
                              />
                              <div className="min-w-0">
                                <div className="text-xs truncate">{spec.name}</div>
                                {teacherLabel && (
                                  <div
                                    className={`inline-flex items-center gap-1 text-[10px] truncate max-w-full ${
                                      isSpecActive ? 'text-violet-100' : 'text-slate-400'
                                    }`}
                                  >
                                    <UserCheck size={9} className="shrink-0" />
                                    <span className="truncate">{teacherLabel}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {permissions.canDeleteSpecializations && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingSpec({ schoolId: school.id, specId: spec.id });
                                }}
                                aria-label={`Delete ${spec.name}`}
                                className={`p-1.5 shrink-0 transition-opacity ${
                                  isSpecActive
                                    ? 'text-violet-200 hover:text-white'
                                    : 'text-slate-400 lg:text-slate-300 hover:text-rose-600 lg:opacity-0 group-hover:opacity-100'
                                }`}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        );
                      })}

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

      <div className="p-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
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
          className="no-print lg:hidden fixed inset-0 z-50 flex bg-slate-900/50 backdrop-blur-xs"
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

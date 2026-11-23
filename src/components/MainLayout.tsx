import { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  Menu,
  Users,
  UserCheck,
  ClipboardCheck,
  BarChart3,
  Filter,
  Sliders,
  LogOut,
  RefreshCw,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import Sidebar from './Sidebar';
import RosterView from './RosterView';
import RubricsView from './RubricsView';
import TeacherRosterView from './TeacherRosterView';
import ReportsView from './ReportsView';
import QueryBuilderView from './QueryBuilderView';
import AdminConfigView from './AdminConfigView';
import AccountPasswordModal from './AccountPasswordModal';
import OfflineBanner from './OfflineBanner';
import PWAInstallButton from './PWAInstallButton';
import { PortraitAvatar } from './Avatar';
import { useStore } from '../store';
import { useAuth } from '../context/AuthContext';
import { WorkspaceTab } from '../types';

const BASE_TABS: {
  id: WorkspaceTab;
  label: string;
  mobileLabel: string;
  icon: typeof Users;
}[] = [
  { id: 'roster', label: 'Attendance', mobileLabel: 'Roster', icon: Users },
  { id: 'rubrics', label: 'Rubrics', mobileLabel: 'Rubrics', icon: ClipboardCheck },
  { id: 'teachers', label: 'Teachers', mobileLabel: 'Teachers', icon: UserCheck },
  { id: 'reports', label: 'Reports', mobileLabel: 'Reports', icon: BarChart3 },
  { id: 'query', label: 'Query', mobileLabel: 'Query', icon: Filter },
  { id: 'admin', label: 'Admin', mobileLabel: 'Admin', icon: Sliders },
];

export default function MainLayout() {
  const { schools, systemSettings, permissions, isLoadingData, refreshWorkspace } = useStore();
  const { profile, signOut } = useAuth();

  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [activeSpecId, setActiveSpecId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('roster');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const visibleTabs = useMemo(
    () =>
      BASE_TABS.filter((t) => {
        if (t.id === 'admin') return permissions.canAccessAdminConsole;
        if (t.id === 'teachers') return permissions.canViewTeacherRoster;
        return true;
      }),
    [permissions.canAccessAdminConsole, permissions.canViewTeacherRoster]
  );

  useEffect(() => {
    if (
      (activeTab === 'admin' && !permissions.canAccessAdminConsole) ||
      (activeTab === 'teachers' && !permissions.canViewTeacherRoster)
    ) {
      setActiveTab('roster');
    }
  }, [activeTab, permissions.canAccessAdminConsole, permissions.canViewTeacherRoster]);

  useEffect(() => {
    if (schools.length > 0 && !activeSchoolId) {
      setActiveSchoolId(schools[0].id);
      if (schools[0].specializations.length > 0) {
        setActiveSpecId(schools[0].specializations[0].id);
      }
    } else if (activeSchoolId && !schools.some((s) => s.id === activeSchoolId)) {
      setActiveSchoolId(schools[0]?.id ?? null);
      setActiveSpecId(schools[0]?.specializations[0]?.id ?? null);
    } else if (activeSchoolId) {
      const currentSchool = schools.find((s) => s.id === activeSchoolId);
      if (
        currentSchool &&
        activeSpecId &&
        !currentSchool.specializations.some((sp) => sp.id === activeSpecId)
      ) {
        setActiveSpecId(currentSchool.specializations[0]?.id ?? null);
      }
    }
  }, [schools, activeSchoolId, activeSpecId]);

  const activeSchool = schools.find((s) => s.id === activeSchoolId) || null;
  const activeSpec =
    activeSchool?.specializations.find((sp) => sp.id === activeSpecId) || null;

  const roleBadgeLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : 'Teacher';

  return (
    <div className="flex h-[100dvh] bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <Sidebar
        activeSchoolId={activeSchoolId}
        setActiveSchoolId={setActiveSchoolId}
        activeSpecId={activeSpecId}
        setActiveSpecId={setActiveSpecId}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <main
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <header className="no-print h-14 lg:h-16 bg-white border-b border-slate-200 flex items-center justify-between gap-3 lg:gap-6 px-3 sm:px-6 shrink-0 z-10">
          {/* Zone 1: Mobile Drawer Trigger + School Breadcrumb */}
          <div className="min-w-0 flex items-center gap-2 text-xs font-medium text-slate-500">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open schools menu"
              className="lg:hidden min-w-[44px] min-h-[44px] -ml-1.5 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-lg shrink-0"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex items-center gap-2">
              {activeSchool && (
                <PortraitAvatar
                  src={activeSchool.logo}
                  name={activeSchool.name}
                  fallbackText={activeSchool.name.substring(0, 3).toUpperCase()}
                  size="xs"
                  tone="violet"
                  className="hidden sm:flex font-mono"
                />
              )}
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 leading-tight">
                <span className="truncate font-bold text-slate-900 max-w-[160px] sm:max-w-[200px]">
                  {activeSchool ? activeSchool.name : systemSettings.portalName}
                </span>
                {activeSpec && (
                  <>
                    <span aria-hidden="true" className="text-slate-300 hidden sm:inline">
                      /
                    </span>
                    <span className="truncate text-[11px] sm:text-xs text-slate-500 sm:text-slate-600 max-w-[160px]">
                      {activeSpec.name}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Zone 2: Desktop Navigation Tabs */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={
                    isActive
                      ? { borderColor: systemSettings.primaryColor, color: systemSettings.primaryColor }
                      : undefined
                  }
                  className={`px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'border-violet-600 text-violet-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Role Profile, Password Settings & Sign-Out */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void refreshWorkspace()}
              title="Refresh from Supabase"
              aria-label="Refresh data"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw size={15} className={isLoadingData ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              title="Account & Password Settings"
              aria-label="Change password"
              className="sm:hidden p-2 rounded-lg text-slate-500 hover:text-violet-700 hover:bg-violet-50 transition-colors"
            >
              <KeyRound size={15} />
            </button>

            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              title="Click to update your account password"
              className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-colors text-left"
            >
              <PortraitAvatar
                src={profile?.avatarUrl}
                name={profile?.fullName || profile?.email || 'User'}
                size="xs"
                tone="violet"
              />
              <div className="leading-tight">
                <div className="text-[11px] font-bold text-slate-800 max-w-[120px] truncate">
                  {profile?.fullName || profile?.email}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                  {roleBadgeLabel}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:border-rose-200 transition-colors"
            >
              <LogOut size={14} />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        </header>

        <OfflineBanner />

        {isLoadingData && (
          <div className="no-print bg-slate-900 text-white px-4 sm:px-6 py-2 flex items-center gap-2.5 text-xs font-medium">
            <Loader2 size={14} className="animate-spin text-violet-400" />
            Syncing records with Supabase...
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 print-full-width">
          {activeTab === 'teachers' && permissions.canViewTeacherRoster ? (
            <TeacherRosterView />
          ) : activeTab === 'reports' ? (
            <ReportsView
              defaultSchoolId={activeSchoolId}
              defaultSpecId={activeSpecId}
            />
          ) : activeTab === 'query' ? (
            <QueryBuilderView />
          ) : activeTab === 'admin' && permissions.canAccessAdminConsole ? (
            <AdminConfigView />
          ) : activeSchool && activeSpec ? (
            activeTab === 'roster' ? (
              <RosterView school={activeSchool} spec={activeSpec} />
            ) : (
              <RubricsView school={activeSchool} spec={activeSpec} />
            )
          ) : (
            <div className="max-w-lg mx-auto my-8 sm:my-16 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={22} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Welcome, {profile?.fullName || roleBadgeLabel}
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {profile?.role === 'teacher' && schools.length === 0
                  ? 'No schools or specializations have been assigned to your Teacher account yet. Ask an Admin to grant access to your specialization in the Admin Console.'
                  : 'Select or create a school and specialization in the sidebar to manage attendance, rubrics, and student reports.'}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden px-4 py-2.5 min-h-[44px] bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                >
                  Choose School
                </button>
                {permissions.canAccessAdminConsole && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('admin')}
                    className="px-4 py-2.5 min-h-[44px] bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors"
                  >
                    Open Admin Console
                  </button>
                )}
                <PWAInstallButton variant="compact" />
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Tab Bar */}
        <nav
          aria-label="Primary mobile navigation"
          className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid h-16 px-1"
          style={{
            gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center min-h-[48px] gap-1 transition-colors relative ${
                  isActive ? 'text-violet-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="text-[10px] font-semibold leading-none whitespace-nowrap">
                  {tab.mobileLabel}
                </span>
              </button>
            );
          })}
        </nav>
      </main>

      <AccountPasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
}

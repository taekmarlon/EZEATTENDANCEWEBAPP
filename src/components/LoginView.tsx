import { useState, FormEvent } from 'react';
import {
  GraduationCap,
  Briefcase,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Database,
} from 'lucide-react';
import { UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import PWAInstallButton from './PWAInstallButton';

const ROLE_OPTIONS: {
  id: UserRole;
  label: string;
  subtitle: string;
  icon: typeof GraduationCap;
}[] = [
  {
    id: 'teacher',
    label: 'Teacher',
    subtitle: 'Manage assigned specialization roster, attendance, rubrics & grading.',
    icon: GraduationCap,
  },
  {
    id: 'director',
    label: 'Director',
    subtitle: 'Full cross-school visibility, analytics reports & query access.',
    icon: Briefcase,
  },
  {
    id: 'admin',
    label: 'Admin',
    subtitle: 'Full system access, user/role assignment & system customization.',
    icon: ShieldCheck,
  },
];

function parseAuthRedirectError(): string | null {
  if (typeof window === 'undefined') return null;
  for (const raw of [window.location.hash.replace(/^#/, ''), window.location.search.replace(/^\?/, '')]) {
    if (!raw || !raw.includes('error')) continue;
    const params = new URLSearchParams(raw);
    const desc = params.get('error_description') || params.get('error');
    const code = params.get('error_code');
    if (desc || code) {
      const base = (desc || code || 'Authentication link error').replace(/\+/g, ' ');
      if (code === 'otp_expired' || /invalid or has expired/i.test(base)) {
        return `${base}. Confirmation links fail on localhost:3000 or when prefetched by email scanners. Try signing in directly here, or verify your Supabase Site URL and Confirm email setting.`;
      }
      return base;
    }
  }
  return null;
}

export default function LoginView() {
  const { signIn, signUp, isLoggingIn, authError, clearAuthError, isConfigured } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>('teacher');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupNotice, setSignupNotice] = useState<string | null>(null);
  const [redirectError, setRedirectError] = useState<string | null>(() => parseAuthRedirectError());

  const activeMeta = ROLE_OPTIONS.find((r) => r.id === selectedRole)!;
  const displayedError = authError || redirectError;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSignupNotice(null);
    setRedirectError(null);
    clearAuthError();

    if (mode === 'signin') {
      await signIn(email, password, selectedRole);
    } else {
      const res = await signUp(email, password, fullName);
      if (res.ok) {
        setSignupNotice(
          res.needsEmailConfirmation
            ? 'Account created! Check your email to confirm before signing in (ensure your Vercel URL is added under Supabase Auth Redirect URLs).'
            : 'Account registered and signed in.'
        );
        setMode('signin');
      }
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Brand Header */}
        <div className="bg-violet-700 px-6 py-5 text-white flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">EZ Center Portal</h1>
            <p className="text-xs text-violet-100 mt-0.5">
              Supabase Cloud Attendance, Rubrics &amp; Reports
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Database size={18} />
          </div>
        </div>

        {/* Supabase Environment Setup Guard */}
        {!isConfigured && (
          <div className="m-5 mb-0 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <AlertCircle size={15} className="text-amber-700 shrink-0" />
              Supabase Connection Required
            </div>
            <p className="leading-relaxed">
              Add <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>{' '}
              to <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code> and apply
              the SQL migrations in{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">supabase/migrations/</code>.
            </p>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* 3-Role Portal Tabs */}
          {mode === 'signin' && (
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Select Login Portal
              </span>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((role) => {
                  const Icon = role.icon;
                  const active = selectedRole === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => {
                        setSelectedRole(role.id);
                        setRedirectError(null);
                        clearAuthError();
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                        active
                          ? 'bg-violet-50 border-violet-600 text-violet-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{role.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                {activeMeta.subtitle}
              </p>
            </div>
          )}

          {displayedError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800">
              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          {signupNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
              {signupNotice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="login-fullname"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="login-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ms. Elena Cruz"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@school.edu"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <button
              type="submit"
              disabled={!isConfigured || isLoggingIn}
              className="w-full py-2.5 px-4 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isLoggingIn && <Loader2 size={14} className="animate-spin" />}
              {mode === 'signin'
                ? `Sign in as ${activeMeta.label}`
                : 'Create Account (First User Becomes Admin)'}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                clearAuthError();
                setRedirectError(null);
                setSignupNotice(null);
                setMode(mode === 'signin' ? 'signup' : 'signin');
              }}
              className="font-semibold text-violet-700 hover:underline"
            >
              {mode === 'signin'
                ? 'First-time setup or self-register?'
                : 'Back to 3-role login'}
            </button>
            <PWAInstallButton variant="compact" />
          </div>
        </div>
      </div>
    </div>
  );
}

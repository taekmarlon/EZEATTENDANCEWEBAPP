import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { StoreProvider } from './store';
import MainLayout from './components/MainLayout';
import LoginView from './components/LoginView';

function AppShell() {
  const { profile, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 size={24} className="animate-spin text-violet-600" />
        <span className="text-xs font-semibold">Loading EZ Center Portal...</span>
      </div>
    );
  }

  if (!profile) {
    return <LoginView />;
  }

  return (
    <StoreProvider>
      <MainLayout />
    </StoreProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}

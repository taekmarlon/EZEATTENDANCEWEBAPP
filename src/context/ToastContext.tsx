import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="no-print fixed bottom-5 right-5 z-[70] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm bg-white ${
              toast.variant === 'error'
                ? 'border-rose-200 text-slate-900'
                : toast.variant === 'info'
                ? 'border-slate-200 text-slate-900'
                : 'border-emerald-200 text-slate-900'
            }`}
          >
            {toast.variant === 'error' ? (
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
            ) : toast.variant === 'info' ? (
              <Info size={18} className="text-violet-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            )}
            <p className="flex-1 text-xs font-medium leading-relaxed text-slate-700">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

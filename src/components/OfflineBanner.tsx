import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="no-print bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 flex items-center gap-2 text-xs font-medium text-amber-900 shrink-0"
    >
      <WifiOff size={14} className="text-amber-700 shrink-0" />
      <span>
        Offline mode — reconnect to save and sync your latest records with Supabase.
      </span>
    </div>
  );
}

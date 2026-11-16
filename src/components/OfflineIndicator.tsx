import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[65] pointer-events-none inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-slate-950/95 px-3 py-1.5 text-xs font-medium text-amber-300 shadow-lg backdrop-blur-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
      <span>Offline Mode — Cached app &amp; local folder ready</span>
    </div>
  );
};

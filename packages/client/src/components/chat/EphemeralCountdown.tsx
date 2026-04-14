import { useState, useEffect } from 'react';
import { formatDistanceStrict } from 'date-fns';

interface EphemeralCountdownProps {
  ttl: number;
}

export function EphemeralCountdown({ ttl }: EphemeralCountdownProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, ttl - Date.now()));

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => {
      const left = Math.max(0, ttl - Date.now());
      setRemaining(left);
      if (left <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [ttl]);

  if (remaining <= 0) {
    return <span className="text-xs text-red-400">expired</span>;
  }

  const display = formatDistanceStrict(0, remaining, { unit: remaining > 60000 ? 'minute' : 'second' });

  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-400">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {display}
    </span>
  );
}

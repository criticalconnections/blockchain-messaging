import { useState } from 'react';
import { clsx } from 'clsx';

interface MessageInputProps {
  onSend: (text: string, ttl?: number) => void;
  disabled?: boolean;
}

const TTL_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
  { label: '1h', value: 3_600_000 },
  { label: '24h', value: 86_400_000 },
];

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [ttl, setTtl] = useState(0);
  const [showTtl, setShowTtl] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, ttl || undefined);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-dark-700 bg-dark-900 p-3">
      {showTtl && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-xs text-dark-400">Auto-expire:</span>
          {TTL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTtl(opt.value)}
              className={clsx(
                'px-2 py-0.5 rounded text-xs transition-colors',
                ttl === opt.value
                  ? 'bg-accent text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setShowTtl(!showTtl)}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            ttl > 0
              ? 'text-amber-400 bg-amber-400/10'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
          )}
          title="Ephemeral message"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type an encrypted message..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-dark-600 bg-dark-800 px-4 py-2 text-sm text-dark-50 placeholder-dark-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />

        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="p-2 rounded-xl bg-accent text-white hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}

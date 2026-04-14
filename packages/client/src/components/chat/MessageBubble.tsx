import { clsx } from 'clsx';
import { format } from 'date-fns';
import { EphemeralCountdown } from './EphemeralCountdown.js';
import type { DecryptedMessage } from '../../store/messages.js';

interface MessageBubbleProps {
  message: DecryptedMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div className={clsx('flex mb-2', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[70%] rounded-2xl px-4 py-2 shadow-sm',
          isOwn
            ? 'bg-accent text-white rounded-br-md'
            : 'bg-dark-700 text-dark-100 rounded-bl-md',
          message.pending && 'opacity-60',
          message.pruned && 'opacity-40 italic'
        )}
      >
        {!isOwn && message.senderName && (
          <p className="text-xs font-medium text-accent-light mb-0.5">
            {message.senderName}
          </p>
        )}

        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

        <div className={clsx(
          'flex items-center gap-2 mt-1',
          isOwn ? 'justify-end' : 'justify-start'
        )}>
          <span className={clsx(
            'text-xs',
            isOwn ? 'text-white/60' : 'text-dark-400'
          )}>
            {format(message.timestamp, 'HH:mm')}
          </span>

          {message.pending && (
            <span className="text-xs text-white/40">sending...</span>
          )}

          {message.ttl && !message.pruned && <EphemeralCountdown ttl={message.ttl} />}
        </div>
      </div>
    </div>
  );
}

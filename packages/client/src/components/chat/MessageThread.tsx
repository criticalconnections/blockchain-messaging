import { useEffect, useRef } from 'react';
import { useMessagesStore } from '../../store/messages.js';
import { useAuthStore } from '../../store/auth.js';
import { useConversationsStore } from '../../store/conversations.js';
import { MessageBubble } from './MessageBubble.js';
import { MessageInput } from './MessageInput.js';

export function MessageThread() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversation = useConversationsStore((s) => s.activeConversation);
  const conversations = useConversationsStore((s) => s.conversations);
  const messagesByConv = useMessagesStore((s) => s.messagesByConversation);
  const loadMessages = useMessagesStore((s) => s.loadMessages);
  const sendMessage = useMessagesStore((s) => s.sendMessage);
  const user = useAuthStore((s) => s.user);

  const conv = conversations.find((c) => c.id === activeConversation);
  const messages = activeConversation ? messagesByConv[activeConversation] || [] : [];

  useEffect(() => {
    if (activeConversation && conv?.recipientPublicKey) {
      loadMessages(activeConversation, conv.recipientPublicKey);
    }
  }, [activeConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!activeConversation || !conv) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-900">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-dark-300 font-medium">End-to-End Encrypted</h3>
          <p className="text-dark-500 text-sm mt-1">Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  const handleSend = (text: string, ttl?: number) => {
    if (!conv.recipientPublicKey) return;
    sendMessage(activeConversation, conv.recipientPublicKey, text, ttl);
  };

  return (
    <div className="flex-1 flex flex-col bg-dark-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-700 bg-dark-850">
        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
          <span className="text-sm font-medium text-accent">
            {conv.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-dark-50">{conv.name}</h2>
          <p className="text-xs text-dark-400">
            {conv.type === 'dm' ? 'Direct message' : conv.type === 'group' ? 'Group' : 'Channel'}
            {' \u00b7 Encrypted'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {messages.length === 0 && (
          <p className="text-center text-dark-500 text-sm mt-8">
            No messages yet. Start the conversation.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender === user?.signPublicKey}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={handleSend} disabled={!conv.recipientPublicKey} />
    </div>
  );
}

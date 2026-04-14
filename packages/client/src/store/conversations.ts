import { create } from 'zustand';
import { api, type ContactResponse, type GroupResponse, type ChannelResponse } from '../api/http.js';

export type ConversationType = 'dm' | 'group' | 'channel';

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  recipientPublicKey?: string;
  lastMessage?: string;
  lastMessageAt?: number;
}

interface ConversationsState {
  conversations: Conversation[];
  activeConversation: string | null;
  loading: boolean;
  setActive: (id: string | null) => void;
  loadConversations: () => Promise<void>;
  addConversation: (conv: Conversation) => void;
}

export const useConversationsStore = create<ConversationsState>((set) => ({
  conversations: [],
  activeConversation: null,
  loading: false,

  setActive: (id) => set({ activeConversation: id }),

  loadConversations: async () => {
    set({ loading: true });
    try {
      const [contacts, groups, channels] = await Promise.all([
        api.contacts.list(),
        api.groups.list(),
        api.channels.list(),
      ]);

      const convs: Conversation[] = [
        ...contacts.map((c: ContactResponse) => ({
          id: c.contact.id,
          type: 'dm' as const,
          name: c.alias || c.contact.username,
          recipientPublicKey: c.contact.encPublicKey,
        })),
        ...groups.map((g: GroupResponse) => ({
          id: g.id,
          type: 'group' as const,
          name: g.name,
        })),
        ...channels.map((ch: ChannelResponse) => ({
          id: ch.id,
          type: 'channel' as const,
          name: ch.name,
        })),
      ];

      set({ conversations: convs, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addConversation: (conv) =>
    set((s) => ({
      conversations: s.conversations.some((c) => c.id === conv.id)
        ? s.conversations
        : [conv, ...s.conversations],
    })),
}));

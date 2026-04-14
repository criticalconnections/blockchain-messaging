import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  publicKeyToBase64,
  canonicalize,
  signData,
  type EncryptedPayload,
  type TransactionType,
} from '@bm/crypto';
import { api } from '../api/http.js';
import { encryptMessage, decryptMessage } from '../crypto/session.js';
import { getIdentity } from '../crypto/keystore.js';

export interface DecryptedMessage {
  id: string;
  sender: string;
  senderName?: string;
  content: string;
  timestamp: number;
  ttl?: number;
  pending?: boolean;
  pruned?: boolean;
}

interface RawTransaction {
  id: string;
  type: TransactionType;
  sender: string;
  recipient?: string;
  payload: string;
  timestamp: number;
  ttl?: number;
  signature: string;
  pruned?: boolean;
}

interface MessagesState {
  messagesByConversation: Record<string, DecryptedMessage[]>;
  loadMessages: (conversationId: string, recipientPublicKey: string) => Promise<void>;
  sendMessage: (
    recipientId: string,
    recipientPublicKey: string,
    plaintext: string,
    ttl?: number
  ) => Promise<void>;
  addIncomingMessage: (tx: RawTransaction, senderPublicKey: string) => Promise<void>;
  markPruned: (conversationId: string, txId: string) => void;
}

const encoder = new TextEncoder();

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByConversation: {},

  loadMessages: async (conversationId, recipientPublicKey) => {
    try {
      const txs = (await api.messages.getByConversation(conversationId)) as RawTransaction[];
      const messages: DecryptedMessage[] = [];

      for (const tx of txs) {
        if (tx.pruned || !tx.payload) {
          messages.push({
            id: tx.id,
            sender: tx.sender,
            content: '[message expired]',
            timestamp: tx.timestamp,
            pruned: true,
          });
          continue;
        }

        try {
          const payload = JSON.parse(tx.payload) as EncryptedPayload;
          const content = await decryptMessage(payload, recipientPublicKey);
          messages.push({
            id: tx.id,
            sender: tx.sender,
            content,
            timestamp: tx.timestamp,
            ttl: tx.ttl,
          });
        } catch {
          messages.push({
            id: tx.id,
            sender: tx.sender,
            content: '[unable to decrypt]',
            timestamp: tx.timestamp,
          });
        }
      }

      messages.sort((a, b) => a.timestamp - b.timestamp);

      set((s) => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: messages,
        },
      }));
    } catch {
      // keep existing messages on error
    }
  },

  sendMessage: async (recipientId, recipientPublicKey, plaintext, ttl) => {
    const identity = await getIdentity();
    if (!identity) throw new Error('No identity keys');

    const encrypted = await encryptMessage(plaintext, recipientPublicKey);
    const senderB64 = publicKeyToBase64(identity.signPublicKey);

    const id = uuidv4();
    const timestamp = Date.now();

    const signable: Record<string, unknown> = {
      id,
      type: 'MESSAGE',
      sender: senderB64,
      recipient: recipientId,
      payload: JSON.stringify(encrypted),
      timestamp,
    };
    if (ttl) signable.ttl = timestamp + ttl;

    const canonical = canonicalize(signable);
    const signature = signData(encoder.encode(canonical), identity.signSecretKey);

    const tx = {
      ...signable,
      signature,
    };

    // Optimistic add
    const optimistic: DecryptedMessage = {
      id,
      sender: senderB64,
      content: plaintext,
      timestamp,
      ttl: ttl ? timestamp + ttl : undefined,
      pending: true,
    };

    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [recipientId]: [...(s.messagesByConversation[recipientId] || []), optimistic],
      },
    }));

    await api.messages.send(tx);

    // Mark confirmed
    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [recipientId]: (s.messagesByConversation[recipientId] || []).map((m) =>
          m.id === id ? { ...m, pending: false } : m
        ),
      },
    }));
  },

  addIncomingMessage: async (tx, senderPublicKey) => {
    const conversationId = tx.recipient || tx.sender;

    if (tx.pruned || !tx.payload) {
      set((s) => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: [
            ...(s.messagesByConversation[conversationId] || []),
            {
              id: tx.id,
              sender: tx.sender,
              content: '[message expired]',
              timestamp: tx.timestamp,
              pruned: true,
            },
          ],
        },
      }));
      return;
    }

    try {
      const payload = JSON.parse(tx.payload) as EncryptedPayload;
      const content = await decryptMessage(payload, senderPublicKey);

      set((s) => {
        const existing = s.messagesByConversation[conversationId] || [];
        if (existing.some((m) => m.id === tx.id)) return s;

        return {
          messagesByConversation: {
            ...s.messagesByConversation,
            [conversationId]: [
              ...existing,
              {
                id: tx.id,
                sender: tx.sender,
                content,
                timestamp: tx.timestamp,
                ttl: tx.ttl,
              },
            ],
          },
        };
      });
    } catch {
      // decryption failed - skip
    }
  },

  markPruned: (conversationId, txId) => {
    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [conversationId]: (s.messagesByConversation[conversationId] || []).map((m) =>
          m.id === txId ? { ...m, content: '[message expired]', pruned: true } : m
        ),
      },
    }));
  },
}));

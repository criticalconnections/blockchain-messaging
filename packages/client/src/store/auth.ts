import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  generateEncryptionKeyPair,
  generateSigningKeyPair,
  publicKeyToBase64,
  canonicalize,
  signData,
} from '@bm/crypto';
import { api, type UserPublic } from '../api/http.js';
import { wsClient } from '../api/ws.js';
import { storeIdentity, getIdentity, clearKeyStore } from '../crypto/keystore.js';
import { clearSessionCache } from '../crypto/session.js';

const encoder = new TextEncoder();

interface AuthState {
  user: UserPublic | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  restore: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,

  register: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const encKeyPair = generateEncryptionKeyPair();
      const signKeyPair = generateSigningKeyPair();

      const encPublicKey = publicKeyToBase64(encKeyPair.publicKey);
      const signPublicKey = publicKeyToBase64(signKeyPair.publicKey);

      const res = await api.auth.register({
        username,
        password,
        encPublicKey,
        signPublicKey,
      });

      await storeIdentity(
        encKeyPair.publicKey,
        encKeyPair.secretKey,
        signKeyPair.publicKey,
        signKeyPair.secretKey
      );

      localStorage.setItem('bm-token', res.token);
      localStorage.setItem('bm-user', JSON.stringify(res.user));
      wsClient.connect(res.token);

      // Publish identity to blockchain for cross-peer discovery
      try {
        const id = uuidv4();
        const timestamp = Date.now();
        const payload = JSON.stringify({ username, encPublicKey });
        const signable: Record<string, unknown> = {
          id,
          type: 'KEY_PUBLISH',
          sender: signPublicKey,
          payload,
          timestamp,
        };
        const canonical = canonicalize(signable);
        const signature = signData(encoder.encode(canonical), signKeyPair.secretKey);
        await api.messages.send({ id, type: 'KEY_PUBLISH', sender: signPublicKey, payload, timestamp, signature });
      } catch {
        // Non-fatal: local registration succeeded
      }

      set({ user: res.user, token: res.token, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.auth.login({ username, password });

      localStorage.setItem('bm-token', res.token);
      localStorage.setItem('bm-user', JSON.stringify(res.user));
      wsClient.connect(res.token);

      // Publish identity to blockchain for cross-peer discovery
      try {
        const identity = await getIdentity();
        if (identity) {
          const id = uuidv4();
          const timestamp = Date.now();
          const senderKey = publicKeyToBase64(identity.signPublicKey);
          const payload = JSON.stringify({
            username: res.user.username,
            encPublicKey: res.user.encPublicKey,
          });
          const signable: Record<string, unknown> = {
            id,
            type: 'KEY_PUBLISH',
            sender: senderKey,
            payload,
            timestamp,
          };
          const canonical = canonicalize(signable);
          const signature = signData(encoder.encode(canonical), identity.signSecretKey);
          await api.messages.send({ id, type: 'KEY_PUBLISH', sender: senderKey, payload, timestamp, signature });
        }
      } catch {
        // Non-fatal
      }

      set({ user: res.user, token: res.token, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('bm-token');
    localStorage.removeItem('bm-user');
    wsClient.disconnect();
    clearSessionCache();
    clearKeyStore();
    set({ user: null, token: null });
  },

  restore: () => {
    const token = localStorage.getItem('bm-token');
    const userJson = localStorage.getItem('bm-user');
    if (token && userJson) {
      const user = JSON.parse(userJson) as UserPublic;
      wsClient.connect(token);
      set({ user, token });
    }
  },
}));

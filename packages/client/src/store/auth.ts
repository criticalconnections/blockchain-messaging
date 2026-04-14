import { create } from 'zustand';
import {
  generateEncryptionKeyPair,
  generateSigningKeyPair,
  publicKeyToBase64,
} from '@bm/crypto';
import { api, type UserPublic } from '../api/http.js';
import { wsClient } from '../api/ws.js';
import { storeIdentity, clearKeyStore } from '../crypto/keystore.js';
import { clearSessionCache } from '../crypto/session.js';

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

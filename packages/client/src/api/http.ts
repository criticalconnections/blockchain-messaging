const BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('bm-token');

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((body as { error: string }).error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface UserPublic {
  id: string;
  username: string;
  encPublicKey: string;
  signPublicKey: string;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface ContactResponse {
  id: string;
  userId: string;
  contactId: string;
  alias?: string;
  contact: UserPublic;
}

export interface GroupResponse {
  id: string;
  name: string;
  ownerId: string;
  members: Array<{
    userId: string;
    role: string;
    user: UserPublic;
  }>;
}

export interface ChannelResponse {
  id: string;
  name: string;
  ownerId: string;
  channelPublicKey?: string;
  owner: { id: string; username: string };
  _count?: { subscribers: number };
}

export const api = {
  auth: {
    register: (data: {
      username: string;
      password: string;
      encPublicKey: string;
      signPublicKey: string;
    }) => request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

    login: (data: { username: string; password: string }) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  },

  users: {
    search: (q: string) => request<UserPublic[]>(`/users/search?q=${encodeURIComponent(q)}`),
    get: (id: string) => request<UserPublic>(`/users/${id}`),
  },

  contacts: {
    list: () => request<ContactResponse[]>('/contacts'),
    add: (contactId: string, alias?: string) =>
      request<ContactResponse>('/contacts', { method: 'POST', body: JSON.stringify({ contactId, alias }) }),
    remove: (contactId: string) => request<void>(`/contacts/${contactId}`, { method: 'DELETE' }),
  },

  groups: {
    list: () => request<GroupResponse[]>('/groups'),
    create: (name: string, memberIds: string[]) =>
      request<GroupResponse>('/groups', { method: 'POST', body: JSON.stringify({ name, memberIds }) }),
    get: (id: string) => request<GroupResponse>(`/groups/${id}`),
    invite: (groupId: string, userId: string) =>
      request<unknown>(`/groups/${groupId}/invite`, { method: 'POST', body: JSON.stringify({ userId }) }),
    removeMember: (groupId: string, userId: string) =>
      request<void>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  },

  channels: {
    list: () => request<ChannelResponse[]>('/channels'),
    discover: () => request<ChannelResponse[]>('/channels/discover'),
    create: (name: string) =>
      request<ChannelResponse>('/channels', { method: 'POST', body: JSON.stringify({ name }) }),
    subscribe: (id: string) =>
      request<unknown>(`/channels/${id}/subscribe`, { method: 'POST' }),
    unsubscribe: (id: string) =>
      request<void>(`/channels/${id}/subscribe`, { method: 'DELETE' }),
  },

  messages: {
    send: (tx: unknown) =>
      request<{ txId: string }>('/messages', { method: 'POST', body: JSON.stringify(tx) }),
    getByConversation: (conversationId: string, limit = 50) =>
      request<unknown[]>(`/messages/${conversationId}?limit=${limit}`),
  },
};

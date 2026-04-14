import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useConversationsStore, type Conversation } from '../../store/conversations.js';
import { useAuthStore } from '../../store/auth.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Modal } from '../ui/Modal.js';
import { api, type UserPublic } from '../../api/http.js';

export function ConversationList() {
  const { conversations, activeConversation, setActive, loadConversations, addConversation } =
    useConversationsStore();
  const { user, logout } = useAuthStore();
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserPublic[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    loadConversations();
  }, []);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await api.users.search(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  };

  const startDm = async (contact: UserPublic) => {
    await api.contacts.add(contact.id);
    addConversation({
      id: contact.id,
      type: 'dm',
      name: contact.username,
      recipientPublicKey: contact.encPublicKey,
    });
    setActive(contact.id);
    setShowNewChat(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const createGroup = async () => {
    if (!groupName.trim()) return;
    try {
      const group = await api.groups.create(groupName, []);
      addConversation({
        id: group.id,
        type: 'group',
        name: group.name,
      });
      setActive(group.id);
      setShowNewGroup(false);
      setGroupName('');
    } catch {
      // handle error
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'group':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'channel':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-80 flex flex-col border-r border-dark-700 bg-dark-950">
      {/* Header */}
      <div className="p-4 border-b border-dark-700">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-dark-50">BlockMsg</h1>
          <button
            onClick={logout}
            className="text-dark-400 hover:text-dark-200 transition-colors"
            title="Logout"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setShowNewChat(true)}>
            New Chat
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setShowNewGroup(true)}>
            New Group
          </Button>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-2 border-b border-dark-800">
        <p className="text-xs text-dark-400 truncate">Signed in as <span className="text-dark-200">{user?.username}</span></p>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {conversations.length === 0 && (
          <p className="text-center text-dark-500 text-sm mt-8 px-4">
            No conversations yet. Start a new chat.
          </p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => setActive(conv.id)}
            className={clsx(
              'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
              activeConversation === conv.id
                ? 'bg-dark-800'
                : 'hover:bg-dark-900'
            )}
          >
            <div className={clsx(
              'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
              activeConversation === conv.id ? 'bg-accent/30' : 'bg-dark-700'
            )}>
              {typeIcon(conv.type) || (
                <span className="text-sm font-medium text-dark-200">
                  {conv.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-dark-100 truncate">{conv.name}</span>
                <span className="text-xs text-dark-500">{conv.type}</span>
              </div>
              {conv.lastMessage && (
                <p className="text-xs text-dark-400 truncate">{conv.lastMessage}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* New Chat Modal */}
      <Modal open={showNewChat} onClose={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]); }} title="New Conversation">
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <div className="mt-3 max-h-60 overflow-y-auto">
          {searchResults.map((u) => (
            <button
              key={u.id}
              onClick={() => startDm(u)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-dark-700 flex items-center gap-3 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center">
                <span className="text-sm">{u.username.charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-sm text-dark-100">{u.username}</span>
            </button>
          ))}
          {searchQuery.length >= 2 && searchResults.length === 0 && (
            <p className="text-sm text-dark-400 text-center py-3">No users found</p>
          )}
        </div>
      </Modal>

      {/* New Group Modal */}
      <Modal open={showNewGroup} onClose={() => setShowNewGroup(false)} title="Create Group">
        <div className="space-y-3">
          <Input
            label="Group Name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter group name"
          />
          <Button onClick={createGroup} className="w-full" disabled={!groupName.trim()}>
            Create Group
          </Button>
        </div>
      </Modal>
    </div>
  );
}

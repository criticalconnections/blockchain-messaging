import { ConversationList } from '../components/chat/ConversationList.js';
import { MessageThread } from '../components/chat/MessageThread.js';

export function ChatPage() {
  return (
    <div className="flex h-screen">
      <ConversationList />
      <MessageThread />
    </div>
  );
}

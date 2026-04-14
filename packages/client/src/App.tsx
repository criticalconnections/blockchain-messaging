import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import { AuthPage } from './pages/AuthPage.js';
import { ChatPage } from './pages/ChatPage.js';

export function App() {
  const user = useAuthStore((s) => s.user);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    restore();
  }, []);

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <ChatPage /> : <Navigate to="/auth" replace />}
      />
      <Route
        path="/auth"
        element={!user ? <AuthPage /> : <Navigate to="/" replace />}
      />
    </Routes>
  );
}

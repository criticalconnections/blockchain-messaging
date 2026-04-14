import { useState } from 'react';
import { useAuthStore } from '../../store/auth.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';

interface LoginFormProps {
  onToggle: () => void;
}

export function LoginForm({ onToggle }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-dark-50">BlockMsg</h1>
        <p className="text-dark-300 text-sm mt-1">Encrypted blockchain messaging</p>
      </div>

      <Input
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Enter username"
        required
      />

      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
        required
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>

      <p className="text-center text-sm text-dark-300">
        Don't have an account?{' '}
        <button type="button" onClick={onToggle} className="text-accent hover:text-accent-light">
          Register
        </button>
      </p>
    </form>
  );
}

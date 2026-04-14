import { useState } from 'react';
import { useAuthStore } from '../../store/auth.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';

interface RegisterFormProps {
  onToggle: () => void;
}

export function RegisterForm({ onToggle }: RegisterFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');
  const { register, loading, error } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (password !== confirm) {
      setLocalError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    await register(username, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-dark-50">Create Account</h1>
        <p className="text-dark-300 text-sm mt-1">Your keys are generated locally</p>
      </div>

      <Input
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Choose a username"
        required
        minLength={3}
        maxLength={32}
      />

      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
        required
      />

      <Input
        label="Confirm Password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm your password"
        required
      />

      {(localError || error) && (
        <p className="text-sm text-red-400">{localError || error}</p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Creating account...' : 'Create Account'}
      </Button>

      <div className="rounded-lg bg-dark-900 border border-dark-700 p-3">
        <p className="text-xs text-dark-300">
          Your encryption keys are generated in this browser and never sent to the server.
          If you lose access to this device, you will need to create a new account.
        </p>
      </div>

      <p className="text-center text-sm text-dark-300">
        Already have an account?{' '}
        <button type="button" onClick={onToggle} className="text-accent hover:text-accent-light">
          Sign in
        </button>
      </p>
    </form>
  );
}

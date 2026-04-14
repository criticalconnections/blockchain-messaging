import { useState } from 'react';
import { LoginForm } from '../components/auth/LoginForm.js';
import { RegisterForm } from '../components/auth/RegisterForm.js';

export function AuthPage() {
  const [isRegister, setIsRegister] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-sm p-6 rounded-2xl bg-dark-800 border border-dark-700 shadow-2xl">
        {isRegister ? (
          <RegisterForm onToggle={() => setIsRegister(false)} />
        ) : (
          <LoginForm onToggle={() => setIsRegister(true)} />
        )}
      </div>
    </div>
  );
}

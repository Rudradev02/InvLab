import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Boxes, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please provide both username and password.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      toast.success('Signed in successfully');
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid username or password.';
      setError(message);
      toast.error('Authentication failed: ' + message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-[#F8F8F5] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-xl bg-[#173D32] items-center justify-center text-white shadow-md mb-3">
          <Boxes className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#173D32]">InvLab</h1>
        <p className="mt-1 text-sm text-[#5E6B63]">
          Multi-warehouse inventory &amp; sales management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 border border-[#E3E1DA] rounded-xl shadow-xs">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 rounded-md bg-[#FBE9E7] border border-[#f8c9c4] text-[#B3261E] text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Input
              label="Username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin or rahul.manager"
            />

            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
              Sign in to InvLab
            </Button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-[#E3E1DA]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63] block mb-2 text-center">
              Quick demo sign-in
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'Admin@123')}
                className="p-2 border border-[#E3E1DA] rounded-md text-center bg-[#F1F1EC] hover:bg-[#E6F2EA] hover:border-[#173D32]/30 transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-[#173D32]">Admin</div>
                <div className="text-[10px] text-[#5E6B63]">All WHs</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('rahul.manager', 'Manager@123')}
                className="p-2 border border-[#E3E1DA] rounded-md text-center bg-[#F1F1EC] hover:bg-[#E6F2EA] hover:border-[#173D32]/30 transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-[#173D32]">Manager</div>
                <div className="text-[10px] text-[#5E6B63]">Pune Hub</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('arun.staff', 'Staff@123')}
                className="p-2 border border-[#E3E1DA] rounded-md text-center bg-[#F1F1EC] hover:bg-[#E6F2EA] hover:border-[#173D32]/30 transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-[#173D32]">Staff</div>
                <div className="text-[10px] text-[#5E6B63]">Counter</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

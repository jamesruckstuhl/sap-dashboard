import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user } = await login(form.username, form.password);
      setAuth(token, user);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sap-blue flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded shadow-lg overflow-hidden">
          <div className="bg-sap-blue px-6 py-5">
            <h1 className="text-white text-xl font-semibold">SAP Monitoring Dashboard</h1>
            <p className="text-blue-200 text-xs mt-1">Sign in to continue</p>
          </div>
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="sap-form-group">
              <label className="sap-label">Username</label>
              <input
                type="text"
                className="sap-input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="sap-form-group">
              <label className="sap-label">Password</label>
              <input
                type="password"
                className="sap-input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="sap-btn-primary w-full justify-center py-2 disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

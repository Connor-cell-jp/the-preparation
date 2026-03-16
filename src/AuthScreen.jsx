import { useState } from 'react';
import { supabase } from './supabase';

const T = {
  bg: '#0d1b2a',
  text: '#ffffff',
  textMid: 'rgba(255,255,255,0.65)',
  textDim: 'rgba(255,255,255,0.38)',
  blue: '#3b82f6',
  red: '#f87171',
  fontUI: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
};

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSignIn = async () => {
    if (!email || !password) { setError('Enter email and password'); return; }
    setLoading(true); setError(''); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    // On success, AuthWrapper's onAuthStateChange handles the rest
  };

  const handleSignUp = async () => {
    if (!email || !password) { setError('Enter email and password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true); setError(''); setMessage('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else { setMessage('Check your email to confirm your account, then sign in.'); setLoading(false); }
  };

  const inputSt = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: '13px 14px',
    color: T.text,
    fontSize: 16,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    outline: 'none',
    WebkitAppearance: 'none',
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: T.bg,
      fontFamily: T.fontUI,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(59,130,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.06) 0%, transparent 60%)',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 9, color: T.blue, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>
            The Preparation
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: -0.5 }}>
            Learning Tracker
          </div>
          <div style={{ fontSize: 13, color: T.textDim, marginTop: 6 }}>
            Sign in to sync your progress across devices
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '24px 22px',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, color: T.textDim, display: 'block', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSignIn()}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputSt}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 10, color: T.textDim, display: 'block', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSignIn()}
              placeholder="••••••••"
              autoComplete="current-password"
              style={inputSt}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 12,
              color: T.red,
              marginBottom: 14,
              lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 12,
              color: T.blue,
              marginBottom: 14,
              lineHeight: 1.4,
            }}>
              {message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSignIn}
              disabled={loading}
              style={{
                flex: 1,
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                borderRadius: 12,
                padding: '13px 0',
                color: '#fff',
                fontSize: 14,
                fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'inherit',
                minHeight: 48,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? '...' : 'Sign In'}
            </button>
            <button
              onClick={handleSignUp}
              disabled={loading}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: '13px 0',
                color: T.textMid,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'inherit',
                minHeight: 48,
                transition: 'opacity 0.15s',
              }}
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

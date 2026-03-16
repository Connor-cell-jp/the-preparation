import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OnboardingFlow from './OnboardingFlow';
import { supabase, setActiveUserId, fetchAllUserData } from './supabase';
import './index.css';

const APP_STORAGE_KEYS = [
  'tp_p4','tp_w4','tp_f4','tp_reviews2','tp_profile2','tp_plan2','tp_queue1',
  'tp_wkhours1','tp_custom1','tp_sundaydone1','tp_settings1','tp_notifs1',
  'tp_hidden1','tp_snapshot1','tp_ratios1','tp_history1','tp_focus_input1',
  'tp_bonus1','tp_last_export','tp_onboarding_done',
];

function clearLocalAppData() {
  APP_STORAGE_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0d1b2a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: '#3b82f6', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>
          The Preparation
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>Loading…</div>
      </div>
    </div>
  );
}

function AuthWrapper() {
  // 'loading' | 'unauthenticated' | 'onboarding' | 'ready'
  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setActiveUserId(session.user.id);
        fetchAllUserData(session.user.id)
          .catch(() => {})
          .finally(() => {
            setSession(session);
            const done = localStorage.getItem('tp_onboarding_done');
            setStatus(done ? 'ready' : 'onboarding');
          });
      } else {
        setStatus('unauthenticated');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setActiveUserId(session.user.id);
        fetchAllUserData(session.user.id)
          .catch(() => {})
          .finally(() => {
            setSession(session);
            const done = localStorage.getItem('tp_onboarding_done');
            setStatus(done ? 'ready' : 'onboarding');
          });
      } else if (event === 'SIGNED_OUT') {
        setActiveUserId(null);
        clearLocalAppData();
        setSession(null);
        setStatus('unauthenticated');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange SIGNED_OUT handles the rest
  };

  const handleOnboardingComplete = () => {
    setStatus('ready');
  };

  if (status === 'loading')         return <LoadingScreen />;
  if (status === 'unauthenticated') return <OnboardingFlow preAuth onComplete={handleOnboardingComplete} />;
  if (status === 'onboarding')      return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  return <App key={session.user.id} onSignOut={handleSignOut} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthWrapper />
  </StrictMode>
);

import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { supabase } from './lib/supabase';
import { hasPendingAuthenticatedSave, savePendingAuthenticatedBoard } from './lib/boardCommands';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';

import type { Session } from '@supabase/supabase-js';

function AnimatedRoutes({ session }: { session: Session | null }) {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route 
          path="/login" 
          element={!session ? <Login /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/" 
          element={session ? <Dashboard session={session} /> : <Board />}
        />
        <Route 
          path="/board/:id" 
          element={session ? <Board /> : <Navigate to="/" replace />}
        />
      </Routes>
    </AnimatePresence>
  );
}

function PendingAuthenticatedSaveHandler({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  const savingRef = useRef(false);

  useEffect(() => {
    if (!session || savingRef.current || !hasPendingAuthenticatedSave()) return;

    savingRef.current = true;
    void savePendingAuthenticatedBoard()
      .then((savedId) => {
        if (savedId) navigate(`/board/${savedId}`, { replace: true });
      })
      .catch((error) => {
        console.error('Error saving pending board:', error);
      })
      .finally(() => {
        savingRef.current = false;
      });
  }, [navigate, session]);

  return null;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if there's an error in the URL before it gets cleared
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = params.get('error_description') || hashParams.get('error_description');
    
    if (error) {
      alert(`Authentication Error: ${error.replace(/\+/g, ' ')}`);
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Session error:', error);
      }
      setSession(session);
      // Wait for onAuthStateChange if there's a code in URL to prevent premature redirect
      if (!window.location.search.includes('code=')) {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event);
      setSession(session);
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <PendingAuthenticatedSaveHandler session={session} />
      <AnimatedRoutes session={session} />
    </BrowserRouter>
  );
}

export default App;

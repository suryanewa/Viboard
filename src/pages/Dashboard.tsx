import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCachedWebBoards } from '../lib/boardCommands';

import type { Session } from '@supabase/supabase-js';

interface Moodboard {
  id: string;
  created_at?: string;
  updated_at?: string;
  title: string;
}

export default function Dashboard({ session }: { session: Session }) {
  const [moodboards, setMoodboards] = useState<Moodboard[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchMoodboards = async () => {
    setLoading(true);
    // Check if table exists implicitly
    const { data, error } = await supabase
      .from('moodboards')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const cached = getCachedWebBoards();
      const seen = new Set<string>();
      setMoodboards([...data, ...cached].filter((board) => {
        if (seen.has(board.id)) return false;
        seen.add(board.id);
        return true;
      }));
    } else if (error) {
      console.error('Error fetching moodboards:', error);
      setMoodboards(getCachedWebBoards());
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMoodboards();
  }, []);

  const createMoodboard = async () => {
    // Attempt to insert
    const { data, error } = await supabase
      .from('moodboards')
      .insert([{ title: 'Untitled Board', user_id: session.user.id }])
      .select()
      .single();

    if (!error && data) {
      navigate(`/board/${data.id}`);
    } else {
      console.error('Error creating moodboard:', error);
      // Fallback: Just navigate to a random uuid if db fails
      const randomId = crypto.randomUUID();
      navigate(`/board/${randomId}`);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Your Moodboards</h1>
          <div className="flex gap-4">
            <button
              onClick={createMoodboard}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium cursor-pointer"
            >
              + New Board
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-md hover:bg-zinc-50 font-medium cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-zinc-500">Loading your boards...</div>
        ) : moodboards.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-lg border border-zinc-200 border-dashed">
            <h3 className="text-lg font-medium text-zinc-900">No moodboards yet</h3>
            <p className="mt-1 text-zinc-500">Get started by creating a new board.</p>
            <button
              onClick={createMoodboard}
              className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium cursor-pointer"
            >
              Create New Board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {moodboards.map((board) => (
              <div
                key={board.id}
                onClick={() => navigate(`/board/${board.id}`)}
                className="bg-white p-6 rounded-lg border border-zinc-200 shadow-sm hover:shadow-md cursor-pointer transition-shadow"
              >
                <div className="w-full aspect-video bg-zinc-100 rounded-md mb-4 flex items-center justify-center">
                  <span className="text-zinc-400 text-sm">No preview</span>
                </div>
                <h3 className="font-semibold text-zinc-900 truncate">{board.title || 'Untitled Board'}</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  {new Date(board.updated_at || board.created_at || Date.now()).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getCachedWebBoards, downloadBlob, safeFilename, BOARD_FILE_EXTENSION, parseSnapshot, generateBoardPreview } from '../lib/boardCommands';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Edit2, Trash2, Download, Plus, LogOut } from 'lucide-react';

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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  /** Keeps the kebab control visible briefly after dismiss so Framer can finish the spring. */
  const [menuDismissRevealId, setMenuDismissRevealId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpenIdRef = useRef<string | null>(null);
  const menuDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const clearMenuDismissReveal = () => {
    if (menuDismissTimerRef.current) {
      clearTimeout(menuDismissTimerRef.current);
      menuDismissTimerRef.current = null;
    }
    setMenuDismissRevealId(null);
  };

  const openBoardMenu = (boardId: string) => {
    clearMenuDismissReveal();
    menuOpenIdRef.current = boardId;
    setMenuOpenId(boardId);
  };

  const dismissBoardMenu = () => {
    const id = menuOpenIdRef.current;
    menuOpenIdRef.current = null;
    setMenuOpenId(null);
    if (!id) return;
    setMenuDismissRevealId(id);
    if (menuDismissTimerRef.current) clearTimeout(menuDismissTimerRef.current);
    menuDismissTimerRef.current = setTimeout(() => {
      setMenuDismissRevealId(null);
      menuDismissTimerRef.current = null;
    }, 320);
  };

  const fetchMoodboards = async () => {
    setLoading(true);
    
    // First load from cache for immediate display
    const cached = getCachedWebBoards();
    setMoodboards(cached);
    
    // Start generating previews for cached boards immediately
    void generatePreviews(cached);

    // Fetch from Supabase
    const { data, error } = await supabase
      .from('moodboards')
      .select('id,title,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const seen = new Set<string>();
      const combined = [...data, ...cached].filter((board) => {
        if (seen.has(board.id)) return false;
        seen.add(board.id);
        return true;
      });
      setMoodboards(combined);
      setLoading(false);
      
      // Update cache index
      localStorage.setItem('viboard:web:index', JSON.stringify(combined));
      
      // Generate previews for any new boards from the server
      void generatePreviews(combined);
    } else if (error) {
      console.error('Error fetching boards:', error);
      setLoading(false);
    }
  };

  const generatePreviews = async (boards: Moodboard[]) => {
    for (const board of boards) {
      try {
        // Skip if we already have a preview
        if (previews[board.id]) continue;

        // Try to get snapshot from local storage first
        const cachedSnapshot = localStorage.getItem(`viboard:web:${board.id}`);
        let snapshot = null;
        
        if (cachedSnapshot) {
          snapshot = JSON.parse(cachedSnapshot);
        } else {
          // If not in local storage, fetch the full board data
          const { data: boardData } = await supabase.from('moodboards').select('*').eq('id', board.id).single();
          if (boardData) {
            snapshot = parseSnapshot(boardData as Record<string, unknown>);
          }
        }
        
        if (snapshot && snapshot.blocks) {
          const previewUrl = await generateBoardPreview(snapshot.blocks, snapshot.drawings || []);
          if (previewUrl) {
            setPreviews(prev => ({ ...prev, [board.id]: previewUrl }));
          }
        }
      } catch (err) {
        console.error(`Error generating preview for board ${board.id}:`, err);
      }
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMoodboards();
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissBoardMenu();
      }
    };

    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (menuDismissTimerRef.current) clearTimeout(menuDismissTimerRef.current);
    };
  }, []);

  const createMoodboard = async () => {
    const { data, error } = await supabase
      .from('moodboards')
      .insert([{ title: 'Untitled Board', user_id: session.user.id }])
      .select()
      .single();

    if (!error && data) {
      navigate(`/board/${data.id}`);
    } else {
      console.error('Error creating board:', error);
      const randomId = crypto.randomUUID();
      navigate(`/board/${randomId}`);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissBoardMenu();
    
    // Optimistic update
    setMoodboards(prev => prev.filter(b => b.id !== id));
    
    const { error } = await supabase.from('moodboards').delete().eq('id', id);
    if (error) {
      console.error('Error deleting board:', error);
      fetchMoodboards(); // Revert on error
    } else {
      localStorage.removeItem(`viboard:web:${id}`);
      const cachedBoards = getCachedWebBoards().filter((board) => board.id !== id);
      localStorage.setItem('viboard:web:index', JSON.stringify(cachedBoards));
    }
  };

  const startRename = (board: Moodboard, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissBoardMenu();
    setEditingId(board.id);
    setEditTitle(board.title || 'Untitled Board');
  };

  const saveRename = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }

    // Optimistic update
    setMoodboards(prev => prev.map(b => b.id === id ? { ...b, title: editTitle } : b));
    setEditingId(null);

    const { error } = await supabase
      .from('moodboards')
      .update({ title: editTitle })
      .eq('id', id);

    if (error) {
      console.error('Error renaming board:', error);
      fetchMoodboards(); // Revert on error
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      saveRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleSaveLocally = async (board: Moodboard, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissBoardMenu();

    // Try to get from local storage first
    const cached = localStorage.getItem(`viboard:web:${board.id}`);
    if (cached) {
      const snapshot = JSON.parse(cached);
      downloadBlob(
        new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
        safeFilename(board.title || 'Untitled Board', BOARD_FILE_EXTENSION)
      );
      return;
    }

    // Otherwise fetch from supabase
    const { data, error } = await supabase.from('moodboards').select('*').eq('id', board.id).single();
    if (!error && data) {
      const snapshot = parseSnapshot(data as Record<string, unknown>);
      if (snapshot) {
        downloadBlob(
          new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
          safeFilename(board.title || 'Untitled Board', BOARD_FILE_EXTENSION)
        );
      }
    } else {
      console.error('Error fetching board for local save:', error);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const boardItemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    show: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { 
        type: "spring" as const, 
        stiffness: 300, 
        damping: 24 
      } 
    },
    hover: {
      y: -6,
      scale: 1.015,
      transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
    }
  };

  const menuVariants = {
    hidden: {
      opacity: 0,
      height: 0,
      filter: 'blur(10px)',
    },
    visible: {
      opacity: 1,
      height: 'auto',
      filter: 'blur(0px)',
      transition: {
        type: 'spring' as const,
        bounce: 0,
        duration: 0.5,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      filter: 'blur(8px)',
      transition: {
        type: 'spring' as const,
        bounce: 0,
        duration: 0.4,
      },
    },
  };

  const menuItemVariants = {
    hidden: {
      opacity: 0,
      y: -15,
      rotateX: -65,
      transformPerspective: 600,
      filter: 'blur(5px)',
    },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      rotateX: 0,
      filter: 'blur(0px)',
      transition: {
        type: 'spring' as const,
        bounce: 0.3,
        duration: 0.45,
        delay: i * 0.04,
      },
    }),
    exit: (custom: { i: number; total: number }) => ({
      opacity: 0,
      y: 15,
      rotateX: 65,
      filter: 'blur(5px)',
      transition: {
        type: 'spring' as const,
        bounce: 0.3,
        duration: 0.4,
        delay: Math.max(0, custom.total - 1 - custom.i) * 0.03,
      },
    }),
  };

  return (
    <motion.div 
      className="min-h-screen bg-zinc-50 p-8"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)', transition: { duration: 0.3, ease: 'easeIn' } }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {menuOpenId && (
        <div 
          className="fixed inset-0 z-40"
          onPointerDown={(e) => {
            e.stopPropagation();
            dismissBoardMenu();
          }}
        />
      )}
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="m-0 p-0 leading-none">
            <img
              src="/viboard-lockup.svg"
              alt="Viboard"
              className="block h-8 w-auto sm:h-9 md:h-10"
              width={160}
              height={35}
              decoding="async"
            />
          </h1>
          <div className="flex gap-3">
            <motion.button
              whileHover="hover"
              whileTap="tap"
              variants={{ hover: { scale: 1.02 }, tap: { scale: 0.98 } }}
              onClick={createMoodboard}
              className="flex items-center gap-2 px-4 py-2 bg-[#6c5cff] text-white rounded-lg hover:bg-[#5a4be8] transition-colors font-medium cursor-pointer shadow-sm"
            >
              <motion.div variants={{ hover: { rotate: -15, scale: 1.15, transition: { type: 'spring', bounce: 0.6 } } }}>
                <Plus className="w-4 h-4" />
              </motion.div>
              New Board
            </motion.button>
            <motion.button
              whileHover="hover"
              whileTap="tap"
              variants={{ hover: { scale: 1.02 }, tap: { scale: 0.98 } }}
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors font-medium cursor-pointer shadow-sm"
            >
              <motion.div variants={{ hover: { rotate: -15, scale: 1.15, transition: { type: 'spring', bounce: 0.6 } } }}>
                <LogOut className="w-4 h-4" />
              </motion.div>
              Sign Out
            </motion.button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6c5cff]"></div>
          </div>
        ) : moodboards.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-24 bg-white rounded-xl border border-zinc-200 border-dashed shadow-sm"
          >
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900">No boards yet</h3>
            <p className="mt-1 text-zinc-500 max-w-sm mx-auto">Create your first board to start organizing your ideas and inspiration.</p>
            <button
              onClick={createMoodboard}
              className="mt-6 px-6 py-2.5 bg-[#6c5cff] text-white rounded-lg hover:bg-[#5a4be8] transition-colors font-medium cursor-pointer shadow-sm"
            >
              Create New Board
            </button>
          </motion.div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            <AnimatePresence mode="popLayout">
              {moodboards.map((board) => (
                <motion.div
                  key={board.id}
                  variants={boardItemVariants}
                  layout
                  animate={menuOpenId === board.id ? "hover" : "show"}
                  whileHover="hover"
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)', transition: { duration: 0.25, ease: 'easeOut' } }}
                  onClick={(e) => {
                    if (menuOpenId) {
                      e.preventDefault();
                      e.stopPropagation();
                      dismissBoardMenu();
                      return;
                    }
                    navigate(`/board/${board.id}`);
                  }}
                  className={`group relative bg-white p-5 rounded-2xl border shadow-sm cursor-pointer transition-[box-shadow,border-color,z-index] duration-300 ${
                    menuOpenId === board.id 
                      ? 'z-50 border-zinc-300' 
                      : menuDismissRevealId === board.id 
                        ? 'z-50 border-zinc-200' 
                        : 'hover:z-10 hover:border-zinc-300 border-zinc-200'
                  }`}
                >
                  <div className="w-full aspect-video bg-zinc-50 rounded-lg mb-4 flex items-center justify-center border border-zinc-100 overflow-hidden relative">
                    {previews[board.id] ? (
                      <motion.img 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        src={previews[board.id]} 
                        alt={`${board.title || 'Untitled Board'} preview`} 
                        className={`w-full h-full object-cover transition-transform duration-700 ease-out ${menuOpenId === board.id ? 'scale-105' : 'group-hover:scale-105'}`}
                      />
                    ) : (
                      <span className="text-zinc-400 text-sm font-medium">No preview</span>
                    )}
                    <div className={`absolute inset-0 bg-gradient-to-t from-[#6c5cff]/10 to-transparent transition-opacity duration-300 pointer-events-none ${menuOpenId === board.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                  </div>
                  
                  <div className="flex justify-between items-start gap-2 relative">
                    <div className="flex-1 min-w-0">
                      {editingId === board.id ? (
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => saveRename(board.id)}
                          onKeyDown={(e) => handleKeyDown(e, board.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 -ml-2 text-zinc-900 font-semibold bg-zinc-100 rounded border-none outline-none focus:ring-2 focus:ring-[#6c5cff]/50"
                        />
                      ) : (
                        <h3 className={`font-semibold text-zinc-900 truncate transform transition-all duration-300 ease-out ${menuOpenId === board.id ? 'text-[#6c5cff] translate-x-1' : 'group-hover:text-[#6c5cff] group-hover:translate-x-1'}`}>
                          {board.title || 'Untitled Board'}
                        </h3>
                      )}
                      <p className="text-xs text-zinc-500 mt-1">
                        {board.updated_at || board.created_at ? `Edited ${new Date(board.updated_at || board.created_at || '').toLocaleDateString()}` : 'Recently edited'}
                      </p>
                    </div>

                    <div className="relative" ref={menuOpenId === board.id ? menuRef : null}>
                      <motion.button
                        type="button"
                        layout={false}
                        whileHover="hover"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuOpenId === board.id) dismissBoardMenu();
                          else openBoardMenu(board.id);
                        }}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-lg p-1.5 transition-[color,opacity] duration-200 ${
                          menuOpenId === board.id || menuDismissRevealId === board.id
                            ? 'text-zinc-900 opacity-100'
                            : 'text-zinc-400 hover:text-zinc-900 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <motion.div
                          className="absolute inset-0 -z-10 rounded-lg bg-zinc-100"
                          initial={false}
                          animate={{ opacity: menuOpenId === board.id ? 1 : 0 }}
                          variants={{ hover: { opacity: 1 } }}
                          transition={{ duration: 0.18 }}
                        />
                        <motion.div
                          className="absolute inset-0 z-10 flex items-center justify-center"
                          layout={false}
                          initial={false}
                          animate={menuOpenId === board.id ? "open" : "closed"}
                          variants={{
                            open: { scale: 1.1, rotate: 90 },
                            closed: { scale: 1, rotate: 0 },
                            hover: { scale: 1.1, rotate: 90 }
                          }}
                          transition={{ type: 'spring', duration: 0.3 }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </motion.div>
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {menuOpenId === board.id && (
                      <motion.div
                        key={`menu-${board.id}`}
                        variants={menuVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-[calc(100%+8px)] w-48 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-zinc-200/80 p-1.5 z-50 origin-top-right flex flex-col gap-0.5"
                      >
                            <motion.button
                              custom={0}
                              variants={menuItemVariants}
                              whileHover="hover"
                              whileTap="tap"
                              onClick={(e) => startRename(board, e)}
                              className="relative z-10 flex w-full items-center justify-start rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-700 outline-none cursor-default group"
                            >
                              <motion.div
                                className="absolute inset-0 -z-10 rounded-lg mx-1 bg-zinc-100"
                                initial={{ opacity: 0, scale: 0.95 }}
                                variants={{
                                  hover: { opacity: 1, scale: 1, transition: { type: 'spring' as const, bounce: 0.25, duration: 0.4 } },
                                  tap: { scale: 0.95, opacity: 1 },
                                }}
                              />
                              <motion.span
                                className="flex min-w-0 items-center gap-2.5 z-10"
                                variants={{
                                  hover: { x: 4, transition: { type: 'spring' as const, bounce: 0.4, duration: 0.4 } },
                                }}
                              >
                                <motion.div variants={{ hover: { rotate: -15, scale: 1.15, transition: { type: 'spring' as const, bounce: 0.6 } } }}>
                                  <Edit2 className="w-4 h-4 shrink-0" />
                                </motion.div>
                                <span className="truncate">Rename</span>
                              </motion.span>
                            </motion.button>
                            <motion.button
                              custom={1}
                              variants={menuItemVariants}
                              whileHover="hover"
                              whileTap="tap"
                              onClick={(e) => handleSaveLocally(board, e)}
                              className="relative z-10 flex w-full items-center justify-start rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-700 outline-none cursor-default group"
                            >
                              <motion.div
                                className="absolute inset-0 -z-10 rounded-lg mx-1 bg-zinc-100"
                                initial={{ opacity: 0, scale: 0.95 }}
                                variants={{
                                  hover: { opacity: 1, scale: 1, transition: { type: 'spring' as const, bounce: 0.25, duration: 0.4 } },
                                  tap: { scale: 0.95, opacity: 1 },
                                }}
                              />
                              <motion.span
                                className="flex min-w-0 items-center gap-2.5 z-10"
                                variants={{
                                  hover: { x: 4, transition: { type: 'spring' as const, bounce: 0.4, duration: 0.4 } },
                                }}
                              >
                                <motion.div variants={{ hover: { rotate: -15, scale: 1.15, transition: { type: 'spring' as const, bounce: 0.6 } } }}>
                                  <Download className="w-4 h-4 shrink-0" />
                                </motion.div>
                                <span className="truncate">Save locally</span>
                              </motion.span>
                            </motion.button>
                            <div className="h-px bg-zinc-100 my-0.5 mx-1" />
                            <motion.button
                              custom={2}
                              variants={menuItemVariants}
                              whileHover="hover"
                              whileTap="tap"
                              onClick={(e) => handleDelete(board.id, e)}
                              className="relative z-10 flex w-full items-center justify-start rounded-lg px-2.5 py-1.5 text-left text-sm text-red-600 outline-none cursor-default group"
                            >
                              <motion.div
                                className="absolute inset-0 -z-10 rounded-lg mx-1 bg-red-50"
                                initial={{ opacity: 0, scale: 0.95 }}
                                variants={{
                                  hover: { opacity: 1, scale: 1, transition: { type: 'spring' as const, bounce: 0.25, duration: 0.4 } },
                                  tap: { scale: 0.95, opacity: 1 },
                                }}
                              />
                              <motion.span
                                className="flex min-w-0 items-center gap-2.5 z-10"
                                variants={{
                                  hover: { x: 4, transition: { type: 'spring' as const, bounce: 0.4, duration: 0.4 } },
                                }}
                              >
                                <motion.div variants={{ hover: { rotate: -15, scale: 1.15, transition: { type: 'spring' as const, bounce: 0.6 } } }}>
                                  <Trash2 className="w-4 h-4 shrink-0" />
                                </motion.div>
                                <span className="truncate">Delete</span>
                              </motion.span>
                            </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

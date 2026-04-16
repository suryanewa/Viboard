import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBoardStore } from '../store';
import { Search, Plus, Mic, X } from 'lucide-react';

export const SearchOverlay: React.FC = () => {
  const isSearchOpen = useBoardStore((state) => state.isSearchOpen);
  const setIsSearchOpen = useBoardStore((state) => state.setIsSearchOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(!isSearchOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setIsSearchOpen]);

  return (
    <AnimatePresence>
      {isSearchOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-950/20 backdrop-blur-xl"
          onClick={() => setIsSearchOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative group">
              <div className="absolute -inset-[2px] rounded-2xl bg-[conic-gradient(from_var(--rotation),#4285f4,#34a853,#fbbc05,#ea4335,#4285f4)] animate-rotate-gradient opacity-100 blur-[2px]" />
              
              <div className="relative flex items-center bg-white rounded-2xl p-4 shadow-2xl border border-white/20">
                <Plus className="w-5 h-5 text-zinc-400 mr-3 cursor-pointer hover:text-zinc-600 transition-colors" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask Gemini"
                  className="flex-1 bg-transparent border-none outline-none text-xl text-zinc-900 placeholder-zinc-400 font-medium"
                />
                <div className="flex items-center gap-3 ml-3">
                  <Mic className="w-5 h-5 text-zinc-400 cursor-pointer hover:text-zinc-600 transition-colors" />
                  <div className="w-px h-6 bg-zinc-200" />
                  <Search className="w-5 h-5 text-zinc-400 cursor-pointer hover:text-zinc-600 transition-colors" />
                </div>
              </div>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 flex justify-center"
            >
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium transition-colors border border-white/10"
              >
                <X className="w-4 h-4" />
                Close Search
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

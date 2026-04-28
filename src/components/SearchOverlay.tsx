import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBoardStore } from '../store';
import { searchBlocks, type BoardBlockDocument } from '../lib/typesense';
import { Search, X, FileText, Link, StickyNote } from 'lucide-react';
import { clsx } from 'clsx';

const blockTypeIcons = {
  sticky: StickyNote,
  text: FileText,
  link: Link,
};

export const SearchOverlay: React.FC = () => {
  const isSearchOpen = useBoardStore((state) => state.isSearchOpen);
  const setIsSearchOpen = useBoardStore((state) => state.setIsSearchOpen);
  const blocks = useBoardStore((state) => state.blocks);
  const setSelection = useBoardStore((state) => state.setSelection);
  const setViewport = useBoardStore((state) => state.setViewport);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BoardBlockDocument[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (isSearchOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
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

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      const searchResults = await searchBlocks(query, { per_page: 10 });
      setResults(searchResults);
      setSelectedIndex(0);
      setIsSearching(false);
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      selectResult(results[selectedIndex]);
    }
  };

  const selectResult = (result: BoardBlockDocument) => {
    const block = blocks[result.id];
    if (!block) return;

    setViewport({ x: -block.x + window.innerWidth / 2, y: -block.y + window.innerHeight / 2 });
    setSelection([result.id]);
    setIsSearchOpen(false);
  };

  const getBlockPreview = (result: BoardBlockDocument) => {
    if (result.blockType === 'sticky' || result.blockType === 'text') {
      return result.text?.slice(0, 80) || 'Empty';
    }
    if (result.blockType === 'link') {
      return result.title || result.url || 'Link';
    }
    return result.id;
  };

  return (
    <AnimatePresence>
      {isSearchOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh] bg-zinc-950/40 backdrop-blur-xl"
          onClick={() => setIsSearchOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.85, scaleY: 0.1, opacity: 0, y: 30, filter: "blur(20px)" }}
            animate={{ scale: 1, scaleY: 1, opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ scale: 0.85, scaleY: 0.1, opacity: 0, y: 30, filter: "blur(20px)" }}
            transition={{ type: "spring", damping: 18, stiffness: 250, mass: 0.8 }}
            className="relative w-full max-w-2xl px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative group">
              <div className="absolute -inset-[3px] rounded-2xl bg-[conic-gradient(from_var(--rotation),#FF0000,#FF7A00,#FF0069,#D300C5,#7638FA,#0055FF,#FF0000)] animate-rotate-gradient opacity-70 blur-xl" />
              <div className="absolute -inset-[1px] rounded-2xl bg-[conic-gradient(from_var(--rotation),#FF0000,#FF7A00,#FF0069,#D300C5,#7638FA,#0055FF,#FF0000)] animate-rotate-gradient opacity-100 blur-[4px]" />
              
              <div className="relative bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 overflow-hidden">
                <div className="flex items-center px-4 py-3 border-b border-zinc-200/50">
                  <Search className={clsx("w-5 h-5 mr-3 transition-colors", isSearching ? "text-zinc-400 animate-pulse" : "text-zinc-400")} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search for objects and commands..."
                    className="flex-1 bg-transparent border-none outline-none text-xl text-zinc-900 placeholder-zinc-400 font-medium"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="p-1 rounded-lg hover:bg-zinc-100 transition-colors"
                    >
                      <X className="w-4 h-4 text-zinc-400" />
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {results.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="max-h-80 overflow-y-auto py-2"
                    >
                      {results.map((result, index) => {
                        const Icon = blockTypeIcons[result.blockType as keyof typeof blockTypeIcons] || FileText;
                        return (
                          <button
                            type="button"
                            key={result.id}
                            onClick={() => selectResult(result)}
                            className={clsx(
                              "w-full flex items-center px-4 py-3 transition-colors text-left",
                              index === selectedIndex ? "bg-zinc-100" : "hover:bg-zinc-50"
                            )}
                          >
                            <div className={clsx(
                              "w-10 h-10 rounded-xl flex items-center justify-center mr-3",
                              result.blockType === 'sticky' ? "bg-yellow-100 text-yellow-700" :
                              result.blockType === 'link' ? "bg-blue-100 text-blue-700" :
                              "bg-zinc-100 text-zinc-700"
                            )}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-zinc-900 truncate">
                                {result.blockType === 'link' ? result.title : result.text?.slice(0, 50) || 'Empty'}
                              </div>
                              <div className="text-xs text-zinc-500 truncate">
                                {getBlockPreview(result)}
                              </div>
                            </div>
                            <span className="text-xs text-zinc-400 capitalize">{result.blockType}</span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                {query && !isSearching && results.length === 0 && (
                  <div className="px-4 py-8 text-center text-zinc-400">
                    No results found for "{query}"
                  </div>
                )}
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
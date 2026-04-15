import React, { useEffect, useState } from 'react';
import { useBoardStore } from '../store';

import { Copy, Scissors, Clipboard, Trash2, CopyPlus, RotateCcw, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';

const menuVariants: Variants = {
  hidden: { 
    opacity: 0, 
    height: 0,
    filter: "blur(10px)",
  },
  visible: { 
    opacity: 1, 
    height: "auto",
    filter: "blur(0px)",
    transition: {
      type: "spring",
      bounce: 0,
      duration: 0.5
    }
  },
  exit: { 
    opacity: 0, 
    height: 0,
    filter: "blur(8px)",
    transition: { 
      type: "spring",
      bounce: 0,
      duration: 0.35
    }
  }
};

const itemVariants: Variants = {
  hidden: (_i: number) => ({ 
    opacity: 0, 
    y: -15, 
    rotateX: -65, 
    transformPerspective: 600, 
    filter: "blur(5px)",
    transition: { duration: 0 }
  }),
  visible: (i: number) => ({ 
    opacity: 1, 
    y: 0, 
    rotateX: 0, 
    filter: "blur(0px)",
    transition: { type: "spring", bounce: 0.3, duration: 0.45, delay: i * 0.04 } 
  }),
  exit: (_i: number) => ({
    opacity: 0,
    y: 10,
    rotateX: 65,
    filter: "blur(5px)",
    transition: { type: "spring", bounce: 0.2, duration: 0.3 }
  })
};

export const ContextMenu: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const selection = useBoardStore((state) => state.selection);
  const copy = useBoardStore((state) => state.copy);
  const cut = useBoardStore((state) => state.cut);
  const paste = useBoardStore((state) => state.paste);
  const undo = useBoardStore((state) => state.undo);
  const redo = useBoardStore((state) => state.redo);
  const duplicate = useBoardStore((state) => state.duplicate);
  const removeBlocks = useBoardStore((state) => state.removeBlocks);

  const removeDrawings = useBoardStore((state) => state.removeDrawings);
  const drawingSelection = useBoardStore((state) => state.drawingSelection);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      
      const { selection, setSelection, drawingSelection, setDrawingSelection, blocks, drawings, viewport } = useBoardStore.getState();
      
      if (selection.length === 0 && drawingSelection.length === 0) {
        const rect = document.querySelector('main')?.getBoundingClientRect();
        if (rect) {
          const canvasX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
          const canvasY = (e.clientY - rect.top - viewport.y) / viewport.zoom;
          
          const clickedBlock = Object.values(blocks).find(b => 
            canvasX >= b.x && canvasX <= b.x + b.width &&
            canvasY >= b.y && canvasY <= b.y + b.height
          );
          
          if (clickedBlock) {
            setSelection([clickedBlock.id]);
          } else {
            const clickedDrawing = drawings.find(d => 
              d.points.some(p => Math.abs(p.x - canvasX) < 10 && Math.abs(p.y - canvasY) < 10)
            );
            if (clickedDrawing) {
              setDrawingSelection([clickedDrawing.id]);
            }
          }
        }
      }

      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    const handleClick = () => setVisible(false);

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleClick);
    };
  }, []);

  const handleAction = (action: () => void) => {
    action();
    setVisible(false);
  };

  const hasSelection = selection.length > 0 || drawingSelection.length > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed top-0 left-0 z-[10000]"
          initial={{ x: pos.x, y: pos.y }}
          animate={{ x: pos.x, y: pos.y }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          style={{ pointerEvents: 'none' }}
        >
          <motion.div 
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={menuVariants}
            className="bg-white/95 backdrop-blur-md border border-zinc-200/80 shadow-2xl rounded-xl min-w-[180px] overflow-hidden"
            style={{ originX: 0, originY: 0, pointerEvents: 'auto' }}
          >
            <div className="py-1.5 flex flex-col">
              <motion.button custom={0} variants={itemVariants} type="button" onClick={() => handleAction(undo)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                  <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { rotate: -45, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                    <RotateCcw className="w-4 h-4" />
                  </motion.div>
                  <span>Undo</span>
                </motion.div>
                <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘Z</motion.span>
              </motion.button>

              <motion.button custom={1} variants={itemVariants} type="button" onClick={() => handleAction(redo)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                  <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { rotate: 45, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                    <RotateCw className="w-4 h-4" />
                  </motion.div>
                  <span>Redo</span>
                </motion.div>
                <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘⇧Z</motion.span>
              </motion.button>

              <motion.button custom={2} variants={itemVariants} type="button" onClick={() => handleAction(() => paste())} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                  <motion.div style={{ scale: 1, rotate: 0, x: 0, y: 0 }} variants={{ hover: { y: 2, scale: 1.1, transition: { type: "spring", bounce: 0.6 } } }}>
                    <Clipboard className="w-4 h-4" />
                  </motion.div>
                  <span>Paste</span>
                </motion.div>
                <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘V</motion.span>
              </motion.button>

              {hasSelection && (
                <motion.div custom={3} variants={itemVariants} className="h-px bg-zinc-100 my-1 mx-2 shrink-0" />
              )}

              {hasSelection && (
                <>
                  <motion.button custom={4} variants={itemVariants} type="button" onClick={() => handleAction(copy)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0, x: 0, y: 0 }} variants={{ hover: { scale: 1.15, x: 1, y: -1, transition: { type: "spring", bounce: 0.6 } } }}>
                        <Copy className="w-4 h-4" />
                      </motion.div>
                      <span>Copy</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘C</motion.span>
                  </motion.button>

                  <motion.button custom={5} variants={itemVariants} type="button" onClick={() => handleAction(cut)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0, x: 0, y: 0 }} variants={{ hover: { rotate: -25, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                        <Scissors className="w-4 h-4" />
                      </motion.div>
                      <span>Cut</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘X</motion.span>
                  </motion.button>

                  <motion.button custom={6} variants={itemVariants} type="button" onClick={() => handleAction(() => duplicate(selection))} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0, x: 0, y: 0 }} variants={{ hover: { scale: 1.15, x: 2, y: -2, transition: { type: "spring", bounce: 0.6 } } }}>
                        <CopyPlus className="w-4 h-4" />
                      </motion.div>
                      <span>Duplicate</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘D</motion.span>
                  </motion.button>

                  <motion.button custom={7} variants={itemVariants} type="button" onClick={() => handleAction(() => { if (selection.length > 0) removeBlocks(selection); if (drawingSelection.length > 0) removeDrawings(drawingSelection); })} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-red-600 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-red-50" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { rotate: [0, -10, 10, -10, 10, 0], scale: 1.15, transition: { duration: 0.4 } } }} className="group-hover:text-red-600 transition-colors duration-300">
                        <Trash2 className="w-4 h-4" />
                      </motion.div>
                      <span className="group-hover:text-red-600 transition-colors duration-300">Delete</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌫</motion.span>
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

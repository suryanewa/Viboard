import React, { useEffect, useState } from 'react';
import { useBoardStore } from '../store';
import clsx from 'clsx';
import { Copy, Scissors, Clipboard, RotateCcw, RotateCw, Trash2, CopyPlus } from 'lucide-react';
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
      duration: 0.5,
      delayChildren: 0.05,
      staggerChildren: 0.035
    }
  },
  exit: { 
    opacity: 0, 
    height: 0,
    filter: "blur(8px)",
    transition: { 
      type: "spring",
      bounce: 0,
      duration: 0.35,
      staggerChildren: 0.02,
      staggerDirection: -1
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: -12, rotateX: -60, transformPerspective: 500, filter: "blur(4px)" },
  visible: { 
    opacity: 1, 
    y: 0, 
    rotateX: 0, 
    filter: "blur(0px)",
    transition: { type: "spring", bounce: 0.25, duration: 0.5 } 
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15 }
  }
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
              <ContextMenuItem 
                icon={<RotateCcw className="w-4 h-4" />} 
                label="Undo" 
                shortcut="⌘Z" 
                hoverEffect="undo"
                onClick={() => handleAction(undo)} 
              />
              <ContextMenuItem 
                icon={<RotateCw className="w-4 h-4" />} 
                label="Redo" 
                shortcut="⌘⇧Z" 
                hoverEffect="redo"
                onClick={() => handleAction(redo)} 
              />
              <motion.div variants={itemVariants} className="h-px bg-zinc-100 my-1 mx-2 shrink-0" />
              <ContextMenuItem 
                icon={<Copy className="w-4 h-4" />} 
                label="Copy" 
                shortcut="⌘C" 
                disabled={selection.length === 0}
                hoverEffect="copy"
                onClick={() => handleAction(copy)} 
              />
              <ContextMenuItem 
                icon={<Scissors className="w-4 h-4" />} 
                label="Cut" 
                shortcut="⌘X" 
                disabled={selection.length === 0}
                hoverEffect="cut"
                onClick={() => handleAction(cut)} 
              />
              <ContextMenuItem 
                icon={<Clipboard className="w-4 h-4" />} 
                label="Paste" 
                shortcut="⌘V" 
                hoverEffect="paste"
                onClick={() => handleAction(() => paste())} 
              />
              <ContextMenuItem 
                icon={<CopyPlus className="w-4 h-4" />} 
                label="Duplicate" 
                shortcut="⌘D" 
                disabled={selection.length === 0}
                hoverEffect="duplicate"
                onClick={() => handleAction(() => duplicate(selection))} 
              />
              <motion.div variants={itemVariants} className="h-px bg-zinc-100 my-1 mx-2 shrink-0" />
              <ContextMenuItem 
                icon={<Trash2 className="w-4 h-4" />} 
                label="Delete" 
                shortcut="⌫" 
                disabled={!hasSelection}
                hoverEffect="delete"
                className="text-red-600"
                onClick={() => handleAction(() => {
                  if (selection.length > 0) removeBlocks(selection);
                  if (drawingSelection.length > 0) removeDrawings(drawingSelection);
                })} 
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

type HoverEffect = 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'duplicate' | 'delete';

interface ContextMenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  hoverEffect?: HoverEffect;
}

const customIconVariants: Record<string, any> = {
  undo: { rotate: -45, scale: 1.15, transition: { type: "spring", bounce: 0.6 } },
  redo: { rotate: 45, scale: 1.15, transition: { type: "spring", bounce: 0.6 } },
  copy: { scale: 1.15, x: 1, y: -1, transition: { type: "spring", bounce: 0.6 } },
  cut: { rotate: -25, scale: 1.15, transition: { type: "spring", bounce: 0.6 } },
  paste: { y: 2, scale: 1.1, transition: { type: "spring", bounce: 0.6 } },
  duplicate: { scale: 1.15, x: 2, y: -2, transition: { type: "spring", bounce: 0.6 } },
  delete: { rotate: [0, -10, 10, -10, 10, 0], scale: 1.15, transition: { duration: 0.4 } },
  default: { scale: 1.1, transition: { type: "spring", bounce: 0.6 } }
};

const ContextMenuItem: React.FC<ContextMenuItemProps> = ({ icon, label, shortcut, onClick, disabled, className, hoverEffect }) => (
  <motion.button
    variants={itemVariants}
    type="button"
    disabled={disabled}
    onClick={onClick}
    whileHover={disabled ? undefined : "hover"}
    whileTap={disabled ? undefined : "tap"}
    className={clsx(
      "relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10",
      disabled ? "opacity-40 cursor-not-allowed" : "text-zinc-700 cursor-default",
      className
    )}
  >
    <motion.div
      className={clsx(
        "absolute inset-0 rounded-lg mx-1 -z-10",
        hoverEffect === 'delete' ? "bg-red-50" : "bg-zinc-100"
      )}
      style={{ opacity: 0, scale: 0.95 }}
      variants={{
        hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } },
        tap: { scale: 0.95, opacity: 1 }
      }}
    />
    
    <motion.div 
      className="flex items-center gap-2.5 z-10"
      style={{ x: 0 }}
      variants={{
        hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } }
      }}
    >
      <motion.div
        style={{ scale: 1, rotate: 0, x: 0, y: 0 }}
        variants={{
          hover: hoverEffect ? customIconVariants[hoverEffect] : customIconVariants.default
        }}
        className={hoverEffect === 'delete' ? "group-hover:text-red-600 transition-colors duration-300" : ""}
      >
        {icon}
      </motion.div>
      <span className={hoverEffect === 'delete' ? "group-hover:text-red-600 transition-colors duration-300" : ""}>{label}</span>
    </motion.div>
    
    {shortcut && (
      <motion.span 
        style={{ x: 0, opacity: 1 }}
        variants={{
          hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } }
        }}
        className="text-xs text-zinc-400 font-mono ml-2 z-10"
      >
        {shortcut}
      </motion.span>
    )}
  </motion.button>
);

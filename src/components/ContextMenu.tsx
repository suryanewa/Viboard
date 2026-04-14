import React, { useEffect, useState } from 'react';
import { useBoardStore } from '../store';
import clsx from 'clsx';
import { Copy, Scissors, Clipboard, RotateCcw, RotateCw, Trash2, CopyPlus } from 'lucide-react';

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

  if (!visible) return null;

  const handleAction = (action: () => void) => {
    action();
    setVisible(false);
  };

  const hasSelection = selection.length > 0 || drawingSelection.length > 0;

  return (
    <div 
      className="fixed z-[10000] bg-white border border-zinc-200 shadow-xl rounded-lg py-1 min-w-[160px]"
      style={{ left: pos.x, top: pos.y }}
    >
      <ContextMenuItem 
        icon={<RotateCcw className="w-4 h-4" />} 
        label="Undo" 
        shortcut="⌘Z" 
        onClick={() => handleAction(undo)} 
      />
      <ContextMenuItem 
        icon={<RotateCw className="w-4 h-4" />} 
        label="Redo" 
        shortcut="⌘⇧Z" 
        onClick={() => handleAction(redo)} 
      />
      <div className="h-px bg-zinc-100 my-1" />
      <ContextMenuItem 
        icon={<Copy className="w-4 h-4" />} 
        label="Copy" 
        shortcut="⌘C" 
        disabled={selection.length === 0}
        onClick={() => handleAction(copy)} 
      />
      <ContextMenuItem 
        icon={<Scissors className="w-4 h-4" />} 
        label="Cut" 
        shortcut="⌘X" 
        disabled={selection.length === 0}
        onClick={() => handleAction(cut)} 
      />
      <ContextMenuItem 
        icon={<Clipboard className="w-4 h-4" />} 
        label="Paste" 
        shortcut="⌘V" 
        onClick={() => handleAction(() => paste())} 
      />
      <ContextMenuItem 
        icon={<CopyPlus className="w-4 h-4" />} 
        label="Duplicate" 
        shortcut="⌘D" 
        disabled={selection.length === 0}
        onClick={() => handleAction(() => duplicate(selection))} 
      />
      <div className="h-px bg-zinc-100 my-1" />
      <ContextMenuItem 
        icon={<Trash2 className="w-4 h-4" />} 
        label="Delete" 
        shortcut="⌫" 
        disabled={!hasSelection}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => handleAction(() => {
          if (selection.length > 0) removeBlocks(selection);
          if (drawingSelection.length > 0) removeDrawings(drawingSelection);
        })} 
      />
    </div>
  );
};

interface ContextMenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const ContextMenuItem: React.FC<ContextMenuItemProps> = ({ icon, label, shortcut, onClick, disabled, className }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      "w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors",
      disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-zinc-100 text-zinc-700",
      className
    )}
  >
    <div className="flex items-center gap-2">
      {icon}
      <span>{label}</span>
    </div>
    {shortcut && <span className="text-xs text-zinc-400 font-mono">{shortcut}</span>}
  </button>
);

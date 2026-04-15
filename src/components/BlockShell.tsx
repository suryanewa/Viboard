import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import type { Block } from '../types';
import { useBoardStore } from '../store';
import clsx from 'clsx';

interface BlockShellProps {
  block: Block;
  children: React.ReactNode;
}



export const BlockShell: React.FC<BlockShellProps> = ({ block, children }) => {
  const isSelected = useBoardStore((state) => state.selection.includes(block.id));
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const bringToFront = useBoardStore((state) => state.bringToFront);
  
  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0, pointerX: 0, pointerY: 0 });

  const x = useMotionValue(block.x);
  const y = useMotionValue(block.y);
  const scale = useMotionValue(1);
  const boxShadow = useMotionValue('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)');

  const isStoreDraggingGroup = useBoardStore((state) => state.isDraggingGroup && state.selection.includes(block.id));

  useEffect(() => {
    if (isStoreDraggingGroup) {
      scale.set(1.02);
      boxShadow.set('0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)');
    } else if (!isDragging.current) {
      scale.set(1);
      boxShadow.set('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)');
    }
  }, [isStoreDraggingGroup, scale, boxShadow]);

  useEffect(() => {
    if (!isDragging.current) {
      x.set(block.x);
      y.set(block.y);
    }
  }, [block.x, block.y, x, y]);

  const altDupeIds = useRef<string[]>([]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1) return;
    if (e.button === 2 && isDragging.current) return;

    const target = e.target as HTMLElement;
    const isContentEditable = target.closest?.('[contenteditable="true"]');

    if (isContentEditable) return;

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    const { selection, setSelection, setIsDraggingGroup } = useBoardStore.getState();
    const isCurrentlySelected = selection.includes(block.id);

    bringToFront(block.id);
    if (e.shiftKey || e.metaKey) {
      if (isCurrentlySelected) setSelection(selection.filter(id => id !== block.id));
      else setSelection([...selection, block.id]);
    } else if (!isCurrentlySelected) {
      setSelection([block.id]);
    }

    if (e.button !== 0) return;

    if (useBoardStore.getState().selection.length > 1) {
      setIsDraggingGroup(true);
    }

    isDragging.current = true;
    dragStartPos.current = { 
      x: x.get(), 
      y: y.get(),
      pointerX: e.clientX,
      pointerY: e.clientY
    };

    if (e.altKey) {
      const { duplicate, selection: currentSelection } = useBoardStore.getState();
      duplicate(currentSelection, true);
      altDupeIds.current = useBoardStore.getState().selection;
    } else {
      altDupeIds.current = [];
    }

    scale.set(1.02);
    boxShadow.set('0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)');
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();

    const { viewport, selection, blocks, updateBlocks, snapping } = useBoardStore.getState();
    const zoom = viewport.zoom;
    const deltaX = (e.clientX - dragStartPos.current.pointerX) / zoom;
    const deltaY = (e.clientY - dragStartPos.current.pointerY) / zoom;

    const GRID_SIZE = 24;

    if (altDupeIds.current.length > 0) {
      const updates = altDupeIds.current.map(id => {
        const b = blocks[id];
        if (!b) return null;
        
        const rawX = b.x + (e.movementX / zoom);
        const rawY = b.y + (e.movementY / zoom);
        
        const newX = snapping ? Math.round(rawX / GRID_SIZE) * GRID_SIZE : rawX;
        const newY = snapping ? Math.round(rawY / GRID_SIZE) * GRID_SIZE : rawY;
        
        return { id, updates: { x: newX, y: newY } };
      }).filter(Boolean) as { id: string, updates: any }[];
      
      updateBlocks(updates);
      return;
    }

    if (selection.length > 0) {
      const updates = selection.map(id => {
        const b = blocks[id];
        if (!b) return null;
        
        const newX = b.x + (e.movementX / zoom);
        const newY = b.y + (e.movementY / zoom);
        return { id, updates: { x: newX, y: newY } };
      }).filter(Boolean) as { id: string, updates: any }[];
      
      updateBlocks(updates);
    }

    if (selection.includes(block.id)) {
      const rawX = dragStartPos.current.x + deltaX;
      const rawY = dragStartPos.current.y + deltaY;

      if (snapping) {
        x.set(Math.round(rawX / GRID_SIZE) * GRID_SIZE);
        y.set(Math.round(rawY / GRID_SIZE) * GRID_SIZE);
      } else {
        x.set(rawX);
        y.set(rawY);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDragging.current = false;
    altDupeIds.current = [];
    
    const { selection, setIsDraggingGroup } = useBoardStore.getState();
    setIsDraggingGroup(false);
    
    scale.set(1);
    boxShadow.set('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)');

    if (!(selection.length > 1 && selection.includes(block.id))) {
      updateBlock(block.id, { x: x.get(), y: y.get() });
    }
  };

  return (
    <motion.div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        x,
        y,
        scale,
        boxShadow: (block.type === 'shape' || block.type === 'drawing' || block.type === 'text' || block.type === 'link') ? 'none' : boxShadow,
        width: block.width,
        height: block.height,
        zIndex: block.zIndex,
        pointerEvents: 'auto'
      }}
      className={clsx(
        'group absolute outline-none select-none touch-none',
        'transition-colors duration-200',
        block.type !== 'shape' && block.type !== 'drawing' && block.type !== 'text' && block.type !== 'link' && [
          'border shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),_0_2px_4px_-1px_rgba(0,0,0,0.06)]',
          isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-200 hover:border-zinc-300'
        ],
        (block.type === 'shape' || block.type === 'drawing' || block.type === 'text' || block.type === 'link') && isSelected && 'border border-blue-400 rounded-sm'
      )}
    >
      <div className="w-full h-full overflow-hidden">
        {children}
      </div>
    </motion.div>
  );
};
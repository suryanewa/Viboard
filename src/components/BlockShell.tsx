import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue, AnimatePresence } from 'framer-motion';
import type { Block } from '../types';
import { useBoardStore } from '../store';
import clsx from 'clsx';

interface BlockShellProps {
  block: Block;
  children: React.ReactNode;
}

let globalPointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  const updateGlobalPointer = (e: PointerEvent) => {
    globalPointer = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener('pointerdown', updateGlobalPointer, { capture: true });
  window.addEventListener('pointermove', updateGlobalPointer, { capture: true });
}

const getSplitPathsForPoint = (w: number, h: number, p: { x: number, y: number, edge: string }) => {
  const { x, y, edge } = p;
  const perim = 2 * (w + h);
  
  const tStart = edge === 'top' ? x :
                 edge === 'right' ? w + y :
                 edge === 'bottom' ? w + h + (w - x) :
                 2 * w + h + (h - y);

  const getPt = (t: number) => {
    let pt = ((t % perim) + perim) % perim;
    if (pt <= w + 0.01) return [pt, 0];
    if (pt <= w + h + 0.01) return [w, pt - w];
    if (pt <= 2 * w + h + 0.01) return [w - (pt - (w + h)), h];
    return [0, h - (pt - (2 * w + h))];
  };

  const baseCorners = [0, w, w + h, 2 * w + h];
  const allCorners: number[] = [];
  for (let i = -2; i <= 2; i++) {
    for (let bc of baseCorners) {
      allCorners.push(i * perim + bc);
    }
  }
  
  let cwPts = [getPt(tStart)];
  for (let c of allCorners) {
    if (c > tStart && c < tStart + w + h) cwPts.push(getPt(c));
  }
  cwPts.push(getPt(tStart + w + h));
  
  let ccwPts = [getPt(tStart)];
  for (let i = allCorners.length - 1; i >= 0; i--) {
    let c = allCorners[i];
    if (c < tStart && c > tStart - (w + h)) ccwPts.push(getPt(c));
  }
  ccwPts.push(getPt(tStart - (w + h)));
  
  const toPath = (pts: number[][]) => `M ${pts[0][0]} ${pts[0][1]} ` + pts.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ');
  return [toPath(cwPts), toPath(ccwPts)];
};

export const BlockShell: React.FC<BlockShellProps> = ({ block, children }) => {
  const isSelected = useBoardStore((state) => state.selection.includes(block.id));
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const bringToFront = useBoardStore((state) => state.bringToFront);
  
  const clickPoint = useRef({ x: 0, y: 0, edge: 'top' });
  const wasSelected = useRef(isSelected);
  const shellRef = useRef<HTMLDivElement>(null);

  if (isSelected && !wasSelected.current) {
    if (shellRef.current) {
      const rect = shellRef.current.getBoundingClientRect();
      const { viewport } = useBoardStore.getState();
      const zoom = viewport.zoom;
      
      const relX = (globalPointer.x - rect.left) / zoom;
      const relY = (globalPointer.y - rect.top) / zoom;
      
      const cx = Math.max(0, Math.min(block.width, relX));
      const cy = Math.max(0, Math.min(block.height, relY));

      const distToTop = cy;
      const distToBottom = block.height - cy;
      const distToLeft = cx;
      const distToRight = block.width - cx;

      const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

      let edge = 'top';
      let px = cx;
      let py = cy;

      if (minDist === distToTop) { py = 0; edge = 'top'; }
      else if (minDist === distToRight) { px = block.width; edge = 'right'; }
      else if (minDist === distToBottom) { py = block.height; edge = 'bottom'; }
      else if (minDist === distToLeft) { px = 0; edge = 'left'; }

      clickPoint.current = { x: px, y: py, edge };
    }
  }
  wasSelected.current = isSelected;

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
      const { duplicate, selection: currentSelection, setIsDuplicatingGroup } = useBoardStore.getState();
      duplicate(currentSelection, true);
      altDupeIds.current = useBoardStore.getState().selection;
      setIsDuplicatingGroup(true);
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
    
    const { selection, setIsDraggingGroup, setIsDuplicatingGroup } = useBoardStore.getState();
    setIsDraggingGroup(false);
    setIsDuplicatingGroup(false);
    
    scale.set(1);
    boxShadow.set('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)');

    if (!(selection.length > 1 && selection.includes(block.id))) {
      updateBlock(block.id, { x: x.get(), y: y.get() });
    }

    window.getSelection()?.removeAllRanges();
    
    const activeEl = document.activeElement;
    if (activeEl && (activeEl as HTMLElement).isContentEditable) {
      (activeEl as HTMLElement).blur();
    }
  };

  return (
    <motion.div
      ref={shellRef}
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
          isSelected ? 'border-transparent ring-2 ring-blue-500/20' : 'border-zinc-200 hover:border-zinc-300'
        ],
        block.type === 'shape' && isSelected && 'ring-2 ring-blue-500/20'
      )}
    >
      <AnimatePresence>
        {isSelected && (
          <svg
            aria-hidden="true"
            className="absolute pointer-events-none"
            style={{ 
              top: (block.type === 'shape' || block.type === 'drawing' || block.type === 'text' || block.type === 'link') ? 0 : -1,
              left: (block.type === 'shape' || block.type === 'drawing' || block.type === 'text' || block.type === 'link') ? 0 : -1,
              width: block.width,
              height: block.height,
              overflow: 'visible', 
              zIndex: 10 
            }}
          >
            {getSplitPathsForPoint(block.width, block.height, clickPoint.current).map((path, index) => (
              <motion.path
                key={index === 0 ? 'cw' : 'ccw'}
                d={path}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ pathLength: 0, opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </svg>
        )}
      </AnimatePresence>
      <div className={clsx("w-full h-full", block.type !== 'shape' && block.type !== 'drawing' && "overflow-hidden")}>
        {children}
      </div>
    </motion.div>
  );
};
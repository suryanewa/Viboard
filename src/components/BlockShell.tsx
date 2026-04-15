import React, { useRef, useEffect, useState } from 'react';
import { motion, useMotionValue, AnimatePresence } from 'framer-motion';
import type { Block } from '../types';
import { useBoardStore } from '../store';
import clsx from 'clsx';

import { createPortal } from 'react-dom';

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

interface ResizeHandleProps {
  direction: string;
  cursor: string;
  styles: React.CSSProperties;
  delay?: number;
  onPointerDown: (e: React.PointerEvent, handle: string) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

const ResizeHandle = ({ direction, cursor, styles, delay = 0, onPointerDown, onPointerMove, onPointerUp }: ResizeHandleProps) => (
  <motion.div
    data-handle={direction}
    onPointerDown={(e) => onPointerDown(e, direction)}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0, opacity: 0, transition: { duration: 0.15, delay: 0 } }}
    transition={{ type: 'spring', stiffness: 500, damping: 25, mass: 1, delay }}
    style={{
      position: 'absolute',
      width: 12,
      height: 12,
      background: '#fff',
      border: '2px solid #3b82f6',
      borderRadius: '50%',
      cursor,
      zIndex: 20,
      ...styles,
    }}
    whileHover={{ scale: 1.3 }}
    whileTap={{ scale: 0.85 }}
  />
);

export const BlockShell: React.FC<BlockShellProps> = ({ block, children }) => {
  const isSelected = useBoardStore((state) => state.selection.includes(block.id));
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const bringToFront = useBoardStore((state) => state.bringToFront);
  
  const clickPoint = useRef({ x: 0, y: 0, edge: 'top' });
  const wasSelected = useRef(isSelected);
  const shellRef = useRef<HTMLDivElement>(null);
  const [overlayElement, setOverlayElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setOverlayElement(document.getElementById('viboard-overlay-layer'));
  }, []);

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

  const isResizing = useRef(false);
  const resizeHandle = useRef<string | null>(null);
  const resizeStartPos = useRef({ 
    x: 0, y: 0, width: 0, height: 0, blockX: 0, blockY: 0, 
    selectedBlocks: [] as Block[],
    groupBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  });

  const x = useMotionValue(block.x);
  const y = useMotionValue(block.y);
  const width = useMotionValue(block.width);
  const height = useMotionValue(block.height);
  const scale = useMotionValue(1);
  const boxShadow = useMotionValue('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)');

  const pathCw = useMotionValue('');
  const pathCcw = useMotionValue('');

  useEffect(() => {
    const updatePaths = () => {
      const [cw, ccw] = getSplitPathsForPoint(width.get(), height.get(), clickPoint.current);
      pathCw.set(cw);
      pathCcw.set(ccw);
    };

    updatePaths();
    
    const unsubW = width.on('change', updatePaths);
    const unsubH = height.on('change', updatePaths);
    
    return () => {
      unsubW();
      unsubH();
    };
  }, [width, height, pathCw, pathCcw]);

  useEffect(() => {
    if (!isDragging.current && !isResizing.current) {
      scale.set(1);
      boxShadow.set('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)');
    }
  }, [scale, boxShadow]);

  useEffect(() => {
    if (!isDragging.current && !isResizing.current) {
      x.set(block.x);
      y.set(block.y);
      width.set(block.width);
      height.set(block.height);
    }
  }, [block.x, block.y, block.width, block.height, x, y, width, height]);

  const altDupeIds = useRef<string[]>([]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1) return;
    if (e.button === 2 && isDragging.current) return;

    const target = e.target as HTMLElement;
    const isContentEditable = target.closest?.('[contenteditable="true"]');
    const isResizeHandle = target.dataset.handle;

    if (isContentEditable || isResizeHandle) return;

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
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();

    const { viewport, selection, blocks, updateBlocks, snapping, setSnapLines } = useBoardStore.getState();
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
      
      updateBlocks(updates, true);
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
      
      updateBlocks(updates, true);
    }

    if (selection.includes(block.id)) {
      let rawX = dragStartPos.current.x + deltaX;
      let rawY = dragStartPos.current.y + deltaY;

      if (snapping) {
        x.set(Math.round(rawX / GRID_SIZE) * GRID_SIZE);
        y.set(Math.round(rawY / GRID_SIZE) * GRID_SIZE);
        setSnapLines([]);
      } else {
        const SNAP_THRESHOLD = 5 / zoom;
        const currentW = width.get();
        const currentH = height.get();
        
        let snapX = rawX;
        let snapY = rawY;
        let bestDistX = SNAP_THRESHOLD;
        let bestDistY = SNAP_THRESHOLD;
        
        const activeSnapLines: { x?: number, y?: number }[] = [];
        
        const myEdgesX = [rawX, rawX + currentW / 2, rawX + currentW];
        const myEdgesY = [rawY, rawY + currentH / 2, rawY + currentH];
        
        const unselectedBlocks = Object.values(blocks).filter(b => !selection.includes(b.id));

        unselectedBlocks.forEach(other => {
          const otherEdgesX = [other.x, other.x + other.width / 2, other.x + other.width];
          const otherEdgesY = [other.y, other.y + other.height / 2, other.y + other.height];
          
          myEdgesX.forEach((myEx, i) => {
            otherEdgesX.forEach(otherEx => {
              const dist = Math.abs(myEx - otherEx);
              if (dist < bestDistX) {
                bestDistX = dist;
                snapX = otherEx - (i === 0 ? 0 : i === 1 ? currentW / 2 : currentW);
                activeSnapLines.push({ x: otherEx });
              }
            });
          });
          
          myEdgesY.forEach((myEy, i) => {
            otherEdgesY.forEach(otherEy => {
              const dist = Math.abs(myEy - otherEy);
              if (dist < bestDistY) {
                bestDistY = dist;
                snapY = otherEy - (i === 0 ? 0 : i === 1 ? currentH / 2 : currentH);
                activeSnapLines.push({ y: otherEy });
              }
            });
          });
        });

        let bestSnapXLines: { x?: number, y?: number }[] = [];
        let bestSnapYLines: { x?: number, y?: number }[] = [];

        unselectedBlocks.forEach(B => {
          unselectedBlocks.forEach(C => {
            if (B.id === C.id) return;

            const overlapY_BC = B.y < C.y + C.height && B.y + B.height > C.y;
            if (overlapY_BC && C.x >= B.x + B.width) {
              const overlapY_A = rawY < B.y + B.height && rawY + currentH > B.y;
              if (overlapY_A) {
                const gapX = C.x - (B.x + B.width);
                
                const targetLeftX = B.x - gapX - currentW;
                const distLeft = Math.abs(rawX - targetLeftX);
                if (distLeft < bestDistX) {
                  bestDistX = distLeft;
                  snapX = targetLeftX;
                  bestSnapXLines = [{ x: targetLeftX + currentW }, { x: B.x }, { x: C.x }];
                }
                
                const targetRightX = C.x + C.width + gapX;
                const distRight = Math.abs(rawX - targetRightX);
                if (distRight < bestDistX) {
                  bestDistX = distRight;
                  snapX = targetRightX;
                  bestSnapXLines = [{ x: B.x + B.width }, { x: C.x }, { x: C.x + C.width }, { x: targetRightX }];
                }
                
                const spaceForA = C.x - (B.x + B.width);
                if (spaceForA >= currentW) {
                  const midGap = (spaceForA - currentW) / 2;
                  const targetMidX = B.x + B.width + midGap;
                  const distMid = Math.abs(rawX - targetMidX);
                  if (distMid < bestDistX) {
                    bestDistX = distMid;
                    snapX = targetMidX;
                    bestSnapXLines = [{ x: B.x + B.width }, { x: targetMidX }, { x: targetMidX + currentW }, { x: C.x }];
                  }
                }
              }
            }

            const overlapX_BC = B.x < C.x + C.width && B.x + B.width > C.x;
            if (overlapX_BC && C.y >= B.y + B.height) {
              const overlapX_A = rawX < B.x + B.width && rawX + currentW > B.x;
              if (overlapX_A) {
                const gapY = C.y - (B.y + B.height);
                
                const targetTopY = B.y - gapY - currentH;
                const distTop = Math.abs(rawY - targetTopY);
                if (distTop < bestDistY) {
                  bestDistY = distTop;
                  snapY = targetTopY;
                  bestSnapYLines = [{ y: targetTopY + currentH }, { y: B.y }, { y: B.y + B.height }, { y: C.y }];
                }
                
                const targetBotY = C.y + C.height + gapY;
                const distBot = Math.abs(rawY - targetBotY);
                if (distBot < bestDistY) {
                  bestDistY = distBot;
                  snapY = targetBotY;
                  bestSnapYLines = [{ y: B.y + B.height }, { y: C.y }, { y: C.y + C.height }, { y: targetBotY }];
                }
                
                const spaceForA = C.y - (B.y + B.height);
                if (spaceForA >= currentH) {
                  const midGap = (spaceForA - currentH) / 2;
                  const targetMidY = B.y + B.height + midGap;
                  const distMid = Math.abs(rawY - targetMidY);
                  if (distMid < bestDistY) {
                    bestDistY = distMid;
                    snapY = targetMidY;
                    bestSnapYLines = [{ y: B.y + B.height }, { y: targetMidY }, { y: targetMidY + currentH }, { y: C.y }];
                  }
                }
              }
            }
          });
        });

        if (bestSnapXLines.length > 0) {
          activeSnapLines.push(...bestSnapXLines);
        }
        if (bestSnapYLines.length > 0) {
          activeSnapLines.push(...bestSnapYLines);
        }
        
        x.set(snapX);
        y.set(snapY);
        setSnapLines(activeSnapLines);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDragging.current = false;
    altDupeIds.current = [];
    
    const { selection, setIsDraggingGroup, setIsDuplicatingGroup, setSnapLines } = useBoardStore.getState();
    setIsDraggingGroup(false);
    setIsDuplicatingGroup(false);
    setSnapLines([]);

    if (!(selection.length > 1 && selection.includes(block.id))) {
      updateBlock(block.id, { x: x.get(), y: y.get() });
    }

    window.getSelection()?.removeAllRanges();
    
    const activeEl = document.activeElement;
    if (activeEl && (activeEl as HTMLElement).isContentEditable) {
      (activeEl as HTMLElement).blur();
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isResizing.current = true;
    resizeHandle.current = handle;
    
    const { selection, blocks } = useBoardStore.getState();
    const selectedBlocks = selection.includes(block.id)
      ? selection.map(id => ({ ...blocks[id] })).filter(Boolean) as Block[]
      : [{ ...block }];

    useBoardStore.getState().setSnapLines([]);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedBlocks.forEach(b => {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    });

    resizeStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: width.get(),
      height: height.get(),
      blockX: x.get(),
      blockY: y.get(),
      selectedBlocks,
      groupBounds: { minX, minY, maxX, maxY }
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing.current) return;
    e.stopPropagation();

    const { viewport, snapping, updateBlocks, setSnapLines, blocks } = useBoardStore.getState();
    const zoom = viewport.zoom;
    const deltaX = (e.clientX - resizeStartPos.current.x) / zoom;
    const deltaY = (e.clientY - resizeStartPos.current.y) / zoom;

    const GRID_SIZE = 24;
    const SNAP_THRESHOLD = 5 / zoom;
    const handle = resizeHandle.current!;
    const { groupBounds, selectedBlocks, blockX, blockY, width: oldWidth, height: oldHeight } = resizeStartPos.current;

    let initialHandleX = blockX;
    let originX = groupBounds.minX;
    if (handle.includes('right')) {
      initialHandleX = blockX + oldWidth;
      originX = groupBounds.minX;
    } else if (handle.includes('left')) {
      initialHandleX = blockX;
      originX = groupBounds.maxX;
    }

    let initialHandleY = blockY;
    let originY = groupBounds.minY;
    if (handle.includes('bottom')) {
      initialHandleY = blockY + oldHeight;
      originY = groupBounds.minY;
    } else if (handle.includes('top')) {
      initialHandleY = blockY;
      originY = groupBounds.maxY;
    }

    let currentHandleX = initialHandleX + deltaX;
    let currentHandleY = initialHandleY + deltaY;

    if (snapping) {
      if (handle.includes('right') || handle.includes('left')) {
        currentHandleX = Math.round(currentHandleX / GRID_SIZE) * GRID_SIZE;
      }
      if (handle.includes('top') || handle.includes('bottom')) {
        currentHandleY = Math.round(currentHandleY / GRID_SIZE) * GRID_SIZE;
      }
      setSnapLines([]);
    } else {
      const activeSnapLines: { x?: number, y?: number }[] = [];
      Object.values(blocks).forEach(other => {
        if (selectedBlocks.some(b => b.id === other.id)) return;
        
        const otherEdgesX = [other.x, other.x + other.width / 2, other.x + other.width];
        const otherEdgesY = [other.y, other.y + other.height / 2, other.y + other.height];
        
        if (handle.includes('right') || handle.includes('left')) {
          otherEdgesX.forEach(otherEx => {
            if (Math.abs(currentHandleX - otherEx) < SNAP_THRESHOLD) {
              currentHandleX = otherEx;
              activeSnapLines.push({ x: otherEx });
            }
          });
        }
        
        if (handle.includes('top') || handle.includes('bottom')) {
          otherEdgesY.forEach(otherEy => {
            if (Math.abs(currentHandleY - otherEy) < SNAP_THRESHOLD) {
              currentHandleY = otherEy;
              activeSnapLines.push({ y: otherEy });
            }
          });
        }
      });
      setSnapLines(activeSnapLines);
    }

    let scaleX = 1;
    if (handle.includes('right') || handle.includes('left')) {
      const denom = initialHandleX - originX;
      scaleX = Math.abs(denom) > 0.01 ? (currentHandleX - originX) / denom : 1;
    }

    let scaleY = 1;
    if (handle.includes('bottom') || handle.includes('top')) {
      const denom = initialHandleY - originY;
      scaleY = Math.abs(denom) > 0.01 ? (currentHandleY - originY) / denom : 1;
    }

    if (e.shiftKey) {
      const dominantScale = Math.abs(scaleX - 1) > Math.abs(scaleY - 1) ? scaleX : scaleY;
      scaleX = dominantScale;
      scaleY = dominantScale;

      if (!handle.includes('top') && !handle.includes('bottom')) {
        originY = groupBounds.minY + (groupBounds.maxY - groupBounds.minY) / 2;
      }
      if (!handle.includes('left') && !handle.includes('right')) {
        originX = groupBounds.minX + (groupBounds.maxX - groupBounds.minX) / 2;
      }
    }

    let minScaleX = 0.01;
    let minScaleY = 0.01;
    selectedBlocks.forEach(b => {
      if (b.width > 0) minScaleX = Math.max(minScaleX, Math.min(1, 10 / b.width));
      if (b.height > 0) minScaleY = Math.max(minScaleY, Math.min(1, 10 / b.height));
    });

    scaleX = Math.max(minScaleX, scaleX);
    scaleY = Math.max(minScaleY, scaleY);

    let draggedUpdate: any = null;
    const updates = selectedBlocks.map(b => {
      const bx = originX + (b.x - originX) * scaleX;
      const by = originY + (b.y - originY) * scaleY;
      const bw = Math.max(10, b.width * scaleX);
      const bh = Math.max(10, b.height * scaleY);
      
      if (b.id === block.id) {
        draggedUpdate = { x: bx, y: by, width: bw, height: bh };
      }
      return { id: b.id, updates: { x: bx, y: by, width: bw, height: bh } };
    });

    if (draggedUpdate) {
      x.set(draggedUpdate.x);
      y.set(draggedUpdate.y);
      width.set(draggedUpdate.width);
      height.set(draggedUpdate.height);
    }

    const otherUpdates = updates.filter(u => u.id !== block.id);
    if (otherUpdates.length > 0) {
      updateBlocks(otherUpdates, true);
    }
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (!isResizing.current) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    isResizing.current = false;
    resizeHandle.current = null;
    useBoardStore.getState().setSnapLines([]);
    
    const finalUpdates = resizeStartPos.current.selectedBlocks.map(b => {
      if (b.id === block.id) {
        return { id: b.id, updates: { x: x.get(), y: y.get(), width: width.get(), height: height.get() } };
      }
      const storeBlock = useBoardStore.getState().blocks[b.id];
      return { id: b.id, updates: { x: storeBlock.x, y: storeBlock.y, width: storeBlock.width, height: storeBlock.height } };
    });
    
    useBoardStore.getState().updateBlocks(finalUpdates, false);
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
        width,
        height,
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
      {isSelected && overlayElement && createPortal(
        <motion.div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            x,
            y,
            width,
            height,
            scale,
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <AnimatePresence>
            {[
              <motion.svg
                key="outline"
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{ 
                  top: (block.type === 'shape' || block.type === 'drawing' || block.type === 'text' || block.type === 'link') ? 0 : -1,
                  left: (block.type === 'shape' || block.type === 'drawing' || block.type === 'text' || block.type === 'link') ? 0 : -1,
                  width,
                  height,
                  overflow: 'visible', 
                  zIndex: 10 
                }}
              >
                <motion.path
                  d={pathCw}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
                <motion.path
                  d={pathCcw}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </motion.svg>,
              
              <ResizeHandle key="tl" delay={0.1} direction="top-left" cursor="nwse-resize" styles={{ top: -6, left: -6, pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />,
              <ResizeHandle key="tr" delay={0.1} direction="top-right" cursor="nesw-resize" styles={{ top: -6, right: -6, pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />,
              <ResizeHandle key="bl" delay={0.1} direction="bottom-left" cursor="nesw-resize" styles={{ bottom: -6, left: -6, pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />,
              <ResizeHandle key="br" delay={0.1} direction="bottom-right" cursor="nwse-resize" styles={{ bottom: -6, right: -6, pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />,
              <ResizeHandle key="t" delay={0.15} direction="top" cursor="ns-resize" styles={{ top: -6, left: 'calc(50% - 6px)', pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />,
              <ResizeHandle key="b" delay={0.15} direction="bottom" cursor="ns-resize" styles={{ bottom: -6, left: 'calc(50% - 6px)', pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />,
              <ResizeHandle key="l" delay={0.15} direction="left" cursor="ew-resize" styles={{ top: 'calc(50% - 6px)', left: -6, pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />,
              <ResizeHandle key="r" delay={0.15} direction="right" cursor="ew-resize" styles={{ top: 'calc(50% - 6px)', right: -6, pointerEvents: 'auto' }} onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />
            ]}
          </AnimatePresence>
        </motion.div>,
        overlayElement
      )}
      <div className={clsx("w-full h-full", block.type !== 'shape' && block.type !== 'drawing' && "overflow-hidden")}>
        {children}
      </div>
    </motion.div>
  );
};

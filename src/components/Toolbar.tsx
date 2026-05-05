import React, { useState, useEffect } from 'react';
import { useBoardStore } from '../store';
import { Type, Link, Magnet, Pencil, Circle, MousePointer, Hand, ZoomIn, ZoomOut, Search, Send, Eye, Edit3, MoreVertical, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { Block, BlockType } from '../types';
import { Tooltip } from './Tooltip';
import { SearchOverlay } from './SearchOverlay';


const VennDiagramIcon = ({ className }: { className?: string }) => (
  <svg className={className || ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="9" r="4.5" />
    <circle cx="8" cy="15" r="4.5" />
    <circle cx="16" cy="15" r="4.5" />
  </svg>
);

const SerifAIcon = ({ className }: { className?: string }) => (
  <svg className={className || ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4 L4 20 M12 4 L20 20 M8 14 L16 14" />
    <path d="M3 20 L5 20 M19 20 L21 20 M10 4 L14 4" />
  </svg>
);

type ToolbarTool = 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky' | 'link' | 'palette' | 'font';
type ToolbarVisualTool = ToolbarTool | 'plus';

export const Toolbar: React.FC = () => {
  const addBlock = useBoardStore((state) => state.addBlock);
  const viewport = useBoardStore((state) => state.viewport);
  const setViewport = useBoardStore((state) => state.setViewport);
  const blocks = useBoardStore((state) => state.blocks);
  const snapping = useBoardStore((state) => state.snapping);
  const setSnapping = useBoardStore((state) => state.setSnapping);
  const gridView = useBoardStore((state) => state.gridView);
  const setGridView = useBoardStore((state) => state.setGridView);
  const canvasTitle = useBoardStore((state) => state.canvasTitle);
  const mode = useBoardStore((state) => state.mode);
  const setMode = useBoardStore((state) => state.setMode);
  const setIsSearchOpen = useBoardStore((state) => state.setIsSearchOpen);
  const isPlusMenuOpen = useBoardStore((state) => state.isPlusMenuOpen);
  const setIsPlusMenuOpen = useBoardStore((state) => state.setIsPlusMenuOpen);

  const tool = useBoardStore((state) => state.tool);
  const setTool = useBoardStore((state) => state.setTool);
  const animationState = useBoardStore((state) => state.animationState);
  const setAnimationState = useBoardStore((state) => state.setAnimationState);

  const [hopDirection, setHopDirection] = useState<1 | -1>(1);
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [lastSelectedTool, setLastSelectedTool] = useState<string | null>(null);
  const [hoveredTopRight, setHoveredTopRight] = useState<string | null>(null);
  const [hoveredTopLeft, setHoveredTopLeft] = useState<string | null>(null);
  const [activeToolbarTool, setActiveToolbarTool] = useState<ToolbarVisualTool>(tool);
  const [activePlusTool, setActivePlusTool] = useState<ToolbarVisualTool>('plus');
  const animationTimeoutRef = React.useRef<number | null>(null);
  const plusMenuCloseTimeoutRef = React.useRef<number | null>(null);

  const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 2];
  const cycleZoom = () => {
    const { viewport, setViewport } = useBoardStore.getState();
    const currentIndex = ZOOM_LEVELS.findIndex(z => Math.abs(z - viewport.zoom) < 0.01);
    const nextIndex = (currentIndex + 1) % ZOOM_LEVELS.length;
    const newZoom = ZOOM_LEVELS[nextIndex];
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const scaleRatio = newZoom / viewport.zoom;
    const newX = centerX - (centerX - viewport.x) * scaleRatio;
    const newY = centerY - (centerY - viewport.y) * scaleRatio;
    setViewport({ x: newX, y: newY, zoom: newZoom });
  };

  const TOOLS = React.useMemo(() => [
    { id: 'select', icon: MousePointer, shortcut: 'V', color: 'blue', hasSecondary: false, hoverAnim: { scale: 1.1, rotate: -15, x: -1, y: -1 } as any },
    { id: 'pan', icon: Hand, shortcut: 'P', color: 'blue', hasSecondary: false, hoverAnim: { scale: 1.1, rotate: [0, -15, 15, -10, 0] } as any },
    { id: 'sticky', icon: ({ isSelected }: { isSelected?: boolean }) => <div className={clsx("w-4 h-4 border-2 transition-colors", isSelected ? 'border-red-600' : 'border-currentColor')} />, shortcut: 'S', color: 'red', hasSecondary: true, hoverAnim: { scale: 1.15, rotate: 10, y: -1 } as any },
    { id: 'text', icon: Type, shortcut: 'T', color: 'red', hasSecondary: false, hoverAnim: { scale: 1.1, y: -2 } as any },
    { id: 'marker', icon: Pencil, shortcut: 'M', color: 'red', hasSecondary: true, hoverAnim: { scale: 1.1, rotate: -20, x: 2, y: -2 } as any },
    { id: 'shape', icon: Circle, shortcut: 'K', color: 'red', hasSecondary: true, hoverAnim: { scale: 1.15 } as any },
    { id: 'plus', icon: Plus, shortcut: 'L', color: 'red', hasSecondary: false, hoverAnim: { scale: 1.1, rotate: 90 } as any },
    { id: 'link', icon: Link, shortcut: 'L', color: 'red', hasSecondary: false, hoverAnim: { scale: 1.1 } as any },
    { id: 'palette', icon: VennDiagramIcon, shortcut: 'C', color: 'red', hasSecondary: false, hoverAnim: { scale: 1.1 } as any },
    { id: 'font', icon: SerifAIcon, shortcut: 'F', color: 'red', hasSecondary: false, hoverAnim: { scale: 1.1 } as any },
  ], []);

  const handleToolSelect = React.useCallback((nextTool: ToolbarVisualTool, options?: { deferPlusMenuClose?: boolean, isSubTool?: boolean }) => {
    const currentState = useBoardStore.getState();
    const currentVisualTool = options?.isSubTool ? 'plus' : activeToolbarTool;
    
    if (currentVisualTool === nextTool && !options?.isSubTool) {
      if (nextTool === 'plus' ? currentState.isPlusMenuOpen : !currentState.isPlusMenuOpen) {
        return;
      }
    }
    
    const currentIndex = TOOLS.findIndex(t => t.id === currentVisualTool);
    const nextIndex = TOOLS.findIndex(t => t.id === nextTool);
    if (currentIndex !== -1 && nextIndex !== -1 && currentIndex !== nextIndex) {
      setHopDirection(nextIndex > currentIndex ? 1 : -1);
    }
    
    const nextToolHasSecondary = TOOLS.find(t => t.id === (options?.isSubTool ? 'plus' : nextTool))?.hasSecondary;
    
    if (options?.isSubTool) {
      setActivePlusTool(nextTool);
      setActiveToolbarTool('plus');
    } else {
      setActiveToolbarTool(nextTool);
    }

    if (plusMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(plusMenuCloseTimeoutRef.current);
      plusMenuCloseTimeoutRef.current = null;
    }
    
    if (nextTool !== 'plus' && !options?.isSubTool) {
      setTool(nextTool === 'palette' || nextTool === 'font' ? 'text' : nextTool as any);
      if (nextTool === 'sticky' || nextTool === 'text' || nextTool === 'shape' || nextTool === 'marker' || nextTool === 'link' || nextTool === 'palette' || nextTool === 'font') {
        currentState.setSelection([]);
        currentState.setDrawingSelection([]);
      }
      if (currentState.isPlusMenuOpen && options?.deferPlusMenuClose) {
        plusMenuCloseTimeoutRef.current = window.setTimeout(() => {
          setIsPlusMenuOpen(false);
          plusMenuCloseTimeoutRef.current = null;
        }, 520);
      } else {
        setIsPlusMenuOpen(false);
      }
    } else if (nextTool === 'plus') {
      const isOpening = !currentState.isPlusMenuOpen;
      setIsPlusMenuOpen(isOpening);
    } else if (options?.isSubTool) {
      setTool(nextTool === 'palette' || nextTool === 'font' ? 'text' : nextTool as any);
      if (nextTool === 'sticky' || nextTool === 'text' || nextTool === 'shape' || nextTool === 'marker' || nextTool === 'link' || nextTool === 'palette' || nextTool === 'font') {
        currentState.setSelection([]);
        currentState.setDrawingSelection([]);
      }
      if (currentState.isPlusMenuOpen) {
        plusMenuCloseTimeoutRef.current = window.setTimeout(() => {
          setIsPlusMenuOpen(false);
          plusMenuCloseTimeoutRef.current = null;
        }, 520);
      }
    }
    
    setHoveredTool(null);
    setHoveredTopRight(null);
    setHoveredTopLeft(null);
    setAnimationState('hopping');
    if (animationTimeoutRef.current !== null) {
      window.clearTimeout(animationTimeoutRef.current);
    }
    
    animationTimeoutRef.current = window.setTimeout(() => {
      setAnimationState(nextToolHasSecondary && (nextTool !== 'plus' || options?.isSubTool) ? 'animating-in' : 'idle');
      animationTimeoutRef.current = null;
    }, 450);
  }, [activeToolbarTool, setAnimationState, setTool, TOOLS, setIsPlusMenuOpen]);

  const activeToolbarToolRef = React.useRef(activeToolbarTool);
  activeToolbarToolRef.current = activeToolbarTool;
  const activePlusToolRef = React.useRef(activePlusTool);
  activePlusToolRef.current = activePlusTool;

  useEffect(() => {
    if (!isPlusMenuOpen) {
      if (tool === 'link') {
        setActiveToolbarTool('plus');
        setActivePlusTool('link');
      } else if (tool === 'text' && activeToolbarToolRef.current === 'plus' && (activePlusToolRef.current === 'font' || activePlusToolRef.current === 'palette')) {
        return;
      } else {
        setActiveToolbarTool(tool);
        setActivePlusTool('plus');
      }
    }
  }, [isPlusMenuOpen, tool]);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current);
      }
      if (plusMenuCloseTimeoutRef.current !== null) {
        window.clearTimeout(plusMenuCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (e.key.toLowerCase() === 's' && !e.shiftKey && !cmdOrCtrl) {
        handleToolSelect('sticky');
      } else if (e.key.toLowerCase() === 't' && !cmdOrCtrl) {
        handleToolSelect('text');
      } else if (e.key.toLowerCase() === 'm' && !cmdOrCtrl) {
        handleToolSelect('marker');
      } else if (e.key.toLowerCase() === 'k' && !cmdOrCtrl) {
        handleToolSelect('shape');
      } else if (e.key.toLowerCase() === 'v' && !cmdOrCtrl) {
        handleToolSelect('select');
      } else if (e.key.toLowerCase() === 'p' && !cmdOrCtrl) {
        handleToolSelect('pan');
      } else if (e.key.toLowerCase() === 'l' && !cmdOrCtrl) {
        handleToolSelect('link');
      }

      if (e.key.toLowerCase() === 'g') {
        if (e.shiftKey) {
          const nextView = gridView === 'none' ? 'box' : gridView === 'box' ? 'dot' : 'none';
          setGridView(nextView);
        } else {
          setSnapping(!snapping);
        }
      }

      if (cmdOrCtrl) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const newZoom = Math.min(5, viewport.zoom + 0.1);
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          const scaleRatio = newZoom / viewport.zoom;
          const newX = centerX - (centerX - viewport.x) * scaleRatio;
          const newY = centerY - (centerY - viewport.y) * scaleRatio;
          setViewport({ x: newX, y: newY, zoom: newZoom });
        } else if (e.key === '-') {
          e.preventDefault();
          const newZoom = Math.max(0.1, viewport.zoom - 0.1);
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          const scaleRatio = newZoom / viewport.zoom;
          const newX = centerX - (centerX - viewport.x) * scaleRatio;
          const newY = centerY - (centerY - viewport.y) * scaleRatio;
          setViewport({ x: newX, y: newY, zoom: newZoom });
        } else if (e.key === '0') {
          e.preventDefault();
          setViewport({ x: 300, y: 200, zoom: 0.5 });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [snapping, gridView, viewport, handleToolSelect, setSnapping, setGridView, setViewport]);

  const plusMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        if (useBoardStore.getState().isPlusMenuOpen) {
          handleToolSelect(useBoardStore.getState().tool);
        }
      }
    };
    window.addEventListener('pointerdown', handleClickOutside);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [handleToolSelect]);

  const handleAddBlock = React.useCallback((type: BlockType, dataOverride: any = {}) => {
    setTool('select');
    const centerX = -viewport.x / viewport.zoom + window.innerWidth / 2 / viewport.zoom;
    const centerY = -viewport.y / viewport.zoom + window.innerHeight / 2 / viewport.zoom;
    
    const GRID_SIZE = 24;
    const snappedX = Math.round(centerX / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(centerY / GRID_SIZE) * GRID_SIZE;

    const highestZ = Math.max(0, ...Object.values(blocks).map((b) => b.zIndex));

    const id = uuidv4();
    let newBlock: Block = {
      id,
      type,
      x: snappedX,
      y: snappedY,
      width: 240,
      height: 240,
      zIndex: highestZ + 1,
      data: dataOverride
    };

    if (type === 'shape') {
      newBlock.width = 120;
      newBlock.height = 120;
      newBlock.data = { shape: dataOverride.shape || 'square', color: dataOverride.color || '#4ade80' };
    } else if (type === 'sticky') {
      newBlock.data = { text: 'New sticky', color: 'yellow', hue: 55 };
    } else if (type === 'text') {
      newBlock.height = 60;
      newBlock.data = { text: '' };
    } else if (type === 'link') {
      newBlock.width = 480;
      newBlock.height = 240;
      newBlock.data = { url: dataOverride.url || '', title: dataOverride.title || '', description: dataOverride.description || '' };
    } else if (type === 'image') {
      newBlock.data = { url: dataOverride.url || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809' };
      newBlock.width = 240;
      newBlock.height = 240;
    }

    addBlock(newBlock);
    if (type === 'text') {
      useBoardStore.getState().setSelection([id]);
    }
  }, [setTool, viewport, blocks, addBlock]);

  useEffect(() => {
    (window as any).__handleAddBlock = handleAddBlock;
    return () => {
      delete (window as any).__handleAddBlock;
    };
  }, [handleAddBlock]);

  return (
    <>
      <SearchOverlay />
      <motion.div 
        className="fixed bottom-8 right-8 flex justify-center z-[9999] pointer-events-none"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { 
            clipPath: "inset(0 0 0 100% round 12px)", 
            opacity: 0,
            transition: { type: "spring", bounce: 0, duration: 0.4, staggerChildren: 0.03, staggerDirection: -1 } 
          },
          visible: { 
            clipPath: "inset(0 0% 0 0% round 12px)", 
            opacity: 1,
            transitionEnd: { clipPath: "none" },
            transition: { type: "spring", bounce: 0, duration: 0.4, delayChildren: 0.1, staggerChildren: 0.05 } 
          }
        }}
      >
        <motion.div 
          className="flex items-center gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-md shadow-none border border-zinc-200 pointer-events-auto rounded-xl"
          onPointerLeave={() => setHoveredTopRight(null)}
        >
        <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
          <Tooltip content="Snap" shortcut="G" position="top">
          <motion.button 
            type="button"
            whileHover="hover"
            onClick={() => setSnapping(!snapping)}
            onPointerEnter={() => setHoveredTopRight('snap')}
            className={clsx(
              "relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg",
              snapping 
                ? "text-blue-600" 
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            {(hoveredTopRight || (snapping ? 'snap' : gridView !== 'none' ? 'grid' : null)) === 'snap' && (
              <motion.div
                layoutId={snapping ? undefined : "top-right-hover-bg"}
                initial={false}
                animate={{ opacity: hoveredTopRight === 'snap' && !snapping ? 1 : 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
              />
            )}
            {snapping && (
              <motion.div
                layoutId="top-right-snap-active-bg"
                className="absolute inset-0 rounded-lg bg-blue-50 -z-10"
              />
            )}
            <motion.div variants={{ hover: { scale: 1.1, rotate: -15, x: -1, y: -1 } }} transition={{ duration: 0.3, type: "spring" }}>
              <Magnet className={clsx("w-5 h-5 relative z-10", snapping && "fill-blue-600/10")} />
            </motion.div>
          </motion.button>
        </Tooltip>
          </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
          <Tooltip content="Grid" shortcut="⇧G" position="top">
          <motion.button 
            type="button"
            whileHover="hover"
            onClick={() => {
              const nextView = gridView === 'none' ? 'box' : gridView === 'box' ? 'dot' : 'none';
              setGridView(nextView);
            }}
            onPointerEnter={() => setHoveredTopRight('grid')}
            className={clsx(
              "relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg",
              gridView !== 'none'
                ? "text-blue-600" 
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            {(hoveredTopRight || (snapping ? 'snap' : gridView !== 'none' ? 'grid' : null)) === 'grid' && (
              <motion.div
                layoutId={gridView !== 'none' ? undefined : "top-right-hover-bg"}
                initial={false}
                animate={{ opacity: hoveredTopRight === 'grid' && gridView === 'none' ? 1 : 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
              />
            )}
            {gridView !== 'none' && (
              <motion.div
                layoutId="top-right-grid-active-bg"
                className="absolute inset-0 rounded-lg bg-blue-50 -z-10"
              />
            )}
            <motion.div className="relative z-10" variants={{ hover: { scale: 1.15 } }} transition={{ duration: 0.3, type: "spring" }}>
              <AnimatePresence mode="wait">
                {gridView === 'box' ? (
                  <motion.svg
                    key="box"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8, rotate: 45 }}
                    transition={{ duration: 0.2 }}
                    className="w-5 h-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <title>Box Grid</title>
                    <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="12" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="2" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="12" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                  </motion.svg>
                ) : gridView === 'dot' ? (
                  <motion.svg
                    key="dot"
                    initial={{ opacity: 0, scale: 0.8, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className="w-5 h-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <title>Dot Grid</title>
                    <circle cx="5" cy="5" r="2" fill="currentColor"/>
                    <circle cx="15" cy="5" r="2" fill="currentColor"/>
                    <circle cx="5" cy="15" r="2" fill="currentColor"/>
                    <circle cx="15" cy="15" r="2" fill="currentColor"/>
                  </motion.svg>
                ) : (
                  <motion.svg
                    key="none"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className="w-5 h-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <title>No Grid</title>
                    <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="12" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="2" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="12" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                  </motion.svg>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.button>
        </Tooltip>
          </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
          <Tooltip content={mode === 'view' ? 'Edit' : 'View'} shortcut={mode === 'view' ? 'E' : 'V'} position="top">
          <motion.button 
            type="button"
            whileHover="hover"
            onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
            onPointerEnter={() => setHoveredTopRight('mode')}
            className="relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900"
          >
            {hoveredTopRight === 'mode' && (
              <motion.div
                layoutId="top-right-hover-bg"
                initial={false}
                animate={{ opacity: 1 }}
                transition={{
                  layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
              />
            )}
            <motion.div variants={{ hover: { scale: 1.1 } }} transition={{ duration: 0.3, type: "spring" }}>
              {mode === 'view' ? (
                <Eye className="w-5 h-5 relative z-10" />
              ) : (
                <Edit3 className="w-5 h-5 relative z-10" />
              )}
            </motion.div>
          </motion.button>
        </Tooltip>
          </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
          <div className="w-px h-6 bg-zinc-200 mx-1" />
          </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
          <Tooltip content="Zoom Out" shortcut="⌘-" position="top">
          <motion.button 
            type="button"
            whileHover="hover"
            onClick={() => {
              const newZoom = Math.max(0.1, viewport.zoom - 0.1);
              const centerX = window.innerWidth / 2;
              const centerY = window.innerHeight / 2;
              const scaleRatio = newZoom / viewport.zoom;
              const newX = centerX - (centerX - viewport.x) * scaleRatio;
              const newY = centerY - (centerY - viewport.y) * scaleRatio;
              setViewport({ x: newX, y: newY, zoom: newZoom });
            }}
            onPointerEnter={() => setHoveredTopRight('zoom-out')}
            className="relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900"
          >
            {(hoveredTopRight || (snapping ? 'snap' : gridView !== 'none' ? 'grid' : null)) === 'zoom-out' && (
              <motion.div
                layoutId="top-right-hover-bg-zoom-out"
                initial={false}
                animate={{ opacity: hoveredTopRight === 'zoom-out' ? 1 : 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
              />
            )}
            <motion.div variants={{ hover: { scale: 1.1, rotate: -15 } }} transition={{ duration: 0.3, type: "spring" }}>
              <ZoomOut className="w-5 h-5 relative z-10" />
            </motion.div>
          </motion.button>
        </Tooltip>
          </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
          <Tooltip content="Zoom" shortcut="⌘0" position="top">
          <motion.button 
            type="button"
            whileHover="hover"
            onClick={cycleZoom}
            onPointerEnter={() => setHoveredTopRight('zoom-text')}
            className="relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900 text-xs font-mono"
          >
            {(hoveredTopRight || (snapping ? 'snap' : gridView !== 'none' ? 'grid' : null)) === 'zoom-text' && (
              <motion.div
                layoutId="top-right-hover-bg-zoom-text"
                initial={false}
                animate={{ opacity: hoveredTopRight === 'zoom-text' ? 1 : 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
              />
            )}
            <motion.span className="relative z-10 inline-block text-sm font-medium text-zinc-900" variants={{ hover: { scale: 1.1 } }} transition={{ duration: 0.3, type: "spring" }}>
              {Math.round(viewport.zoom * 100)}%
            </motion.span>
          </motion.button>
        </Tooltip>
          </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
          <Tooltip content="Zoom In" shortcut="⌘+" position="top">
          <motion.button 
            type="button"
            whileHover="hover"
            onClick={() => {
              const newZoom = Math.min(5, viewport.zoom + 0.1);
              const centerX = window.innerWidth / 2;
              const centerY = window.innerHeight / 2;
              const scaleRatio = newZoom / viewport.zoom;
              const newX = centerX - (centerX - viewport.x) * scaleRatio;
              const newY = centerY - (centerY - viewport.y) * scaleRatio;
              setViewport({ x: newX, y: newY, zoom: newZoom });
            }}
            onPointerEnter={() => setHoveredTopRight('zoom-in')}
            className="relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900"
          >
            {(hoveredTopRight || (snapping ? 'snap' : gridView !== 'none' ? 'grid' : null)) === 'zoom-in' && (
              <motion.div
                layoutId="top-right-hover-bg-zoom-in"
                initial={false}
                animate={{ opacity: hoveredTopRight === 'zoom-in' ? 1 : 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
              />
            )}
            <motion.div variants={{ hover: { scale: 1.1, rotate: 15 } }} transition={{ duration: 0.3, type: "spring" }}>
              <ZoomIn className="w-5 h-5 relative z-10" />
            </motion.div>
          </motion.button>
        </Tooltip>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div 
        className="fixed top-8 right-8 flex justify-center z-[9999] pointer-events-none"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { 
            clipPath: "inset(0 0 0 100% round 12px)", 
            opacity: 0,
            transition: { type: "spring", bounce: 0, duration: 0.4, staggerChildren: 0.03, staggerDirection: -1 } 
          },
          visible: { 
            clipPath: "inset(0 0% 0 0% round 12px)", 
            opacity: 1,
            transitionEnd: { clipPath: "none" },
            transition: { type: "spring", bounce: 0, duration: 0.4, delayChildren: 0.1, staggerChildren: 0.05 } 
          }
        }}
      >
        <motion.div 
          className="flex items-center gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-md shadow-none border border-zinc-200 pointer-events-auto rounded-xl"
        >
          <AnimatePresence>
            {mode === 'edit' && (
              <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
                <Tooltip content="Share" shortcut="⌘⇧S" position="bottom">
                  <motion.button 
                    type="button"
                    whileHover="hover"
                    onPointerEnter={() => setHoveredTopRight('share')}
                    className="relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900"
                  >
                    {hoveredTopRight === 'share' && (
                      <motion.div
                        layoutId="top-right-share-hover-bg"
                        initial={false}
                        animate={{ opacity: 1 }}
                        transition={{
                          layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                          opacity: { duration: 0.2 }
                        }}
                        className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
                      />
                    )}
                    <motion.div variants={{ hover: { scale: 1.1, x: 2, y: -2 } }} transition={{ duration: 0.3, type: "spring" }}>
                      <Send className="w-5 h-5 relative z-10" />
                    </motion.div>
                  </motion.button>
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {mode === 'edit' && (
          <motion.div 
            className="fixed bottom-8 left-0 right-0 flex justify-center z-[9999] pointer-events-none"
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <motion.div 
              className="flex items-center gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-md shadow-none border border-zinc-200 pointer-events-auto rounded-xl"
              onPointerLeave={() => setHoveredTool(null)}
              variants={{
                hidden: { 
                  clipPath: "inset(0 50% 0 50% round 12px)", 
                  opacity: 0,
                  transition: { type: "spring", bounce: 0, duration: 0.4, staggerChildren: 0.03, staggerDirection: -1 } 
                },
                visible: { 
                  clipPath: "inset(0 0% 0 0% round 12px)", 
                  opacity: 1,
                  transitionEnd: { clipPath: "none" },
                  transition: { type: "spring", bounce: 0, duration: 0.4, delayChildren: 0.1, staggerChildren: 0.05 } 
                }
              }}
            >
              {TOOLS.filter(t => !['link', 'palette', 'font'].includes(t.id)).map((t) => {
                const isSelected = activeToolbarTool === t.id;
                const Icon = t.id === 'plus' && activePlusTool !== 'plus' ? TOOLS.find(tool => tool.id === activePlusTool)?.icon || t.icon : t.icon;
                
                const ButtonContent = (
                    <motion.button
                      type="button"
                      initial="rest"
                      animate={isSelected ? "selected" : "rest"}
                      whileHover="hover"
                      onPointerEnter={() => setHoveredTool(t.id)}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (t.id === 'plus' || activeToolbarTool !== t.id) {
                          handleToolSelect(t.id as ToolbarVisualTool);
                        }
                      }}
                      className="relative p-2 flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
                    >
                    {(hoveredTool || (isPlusMenuOpen ? 'plus' : activeToolbarTool)) === t.id && (
                      <motion.div
                        layoutId={isSelected ? "active-tool-bg-shim" : "toolbar-hover-bg"}
                        initial={false}
                        animate={{ opacity: hoveredTool === t.id && !isSelected && !isPlusMenuOpen ? 1 : 0 }}
                        transition={{
                          layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                          opacity: { duration: 0.2 }
                        }}
                        className="absolute inset-0 rounded-lg bg-zinc-100 -z-20"
                      />
                    )}

                    <AnimatePresence>
                      
                    {t.id === 'plus' && (
                      <AnimatePresence>
                        {isPlusMenuOpen && (
                            <motion.div
                              initial="hidden"
                              animate="visible"
                              exit="hidden"
                              className="absolute bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2 z-50 pointer-events-none"
                              variants={{
                                hidden: { opacity: 0 },
                                visible: { 
                                  opacity: 1,
                                  transition: { staggerChildren: 0.05, delayChildren: 0.05 } 
                                }
                              }}
                            >
                              {[
                                { id: 'link', icon: Link, title: 'Link', x: 0, y: -56 },
                                { id: 'palette', icon: VennDiagramIcon, title: 'Palette', x: 56, y: -56 },
                                { id: 'font', icon: SerifAIcon, title: 'Font', x: 56, y: 0 }
                              ].map((sub, i) => {
                                const isSelected = activePlusTool === sub.id;
                                const isAnySelected = activePlusTool !== 'plus';
                                
                                return (
                                <motion.button
                                  key={sub.id}
                                  type="button"
                                  onPointerEnter={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToolSelect(sub.id as ToolbarVisualTool, { deferPlusMenuClose: true, isSubTool: true });
                                  }}
                                  variants={{
                                    hidden: { 
                                      opacity: 0, 
                                      x: 0, 
                                      y: 0, 
                                      scale: 0.5,
                                      backgroundColor: "#ffffff",
                                      borderRadius: "9999px",
                                      boxShadow: "0 8px 16px -4px rgba(0,0,0,0), 0 4px 8px -2px rgba(0,0,0,0)",
                                      width: 44,
                                      height: 44,
                                      transition: { type: "spring", stiffness: 300, damping: 25 }
                                    },
                                    visible: { 
                                      opacity: isAnySelected && !isSelected ? 0 : 1, 
                                      x: isSelected ? 0 : sub.x, 
                                      y: isSelected ? 0 : sub.y, 
                                      scale: 1, 
                                      zIndex: isSelected ? 10 : 1,
                                      backgroundColor: isSelected ? "#fee2e2" : "#ffffff",
                                      borderRadius: isSelected ? "8px" : "9999px",
                                      boxShadow: isSelected ? "0 8px 16px -4px rgba(0,0,0,0), 0 4px 8px -2px rgba(0,0,0,0)" : "0 8px 16px -4px rgba(0,0,0,0.1), 0 4px 8px -2px rgba(0,0,0,0.05)",
                                      width: isSelected ? 40 : 44,
                                      height: isSelected ? 40 : 44,
                                      transition: { type: "spring", stiffness: 300, damping: 25 } 
                                    }
                                  }}
                                  whileHover={isAnySelected ? {} : { scale: 1.15, rotate: i % 2 === 0 ? 5 : -5 }}
                                  className={clsx(
                                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center border border-solid pointer-events-auto transition-colors duration-300",
                                    isSelected ? "text-red-600 border-transparent" : "text-zinc-700 hover:text-zinc-900 border-zinc-200"
                                  )}
                                >
                                  <sub.icon className="w-5 h-5" />
                                </motion.button>
                              )})}
                            </motion.div>
                        )}
                      </AnimatePresence>
                    )}

                    {isSelected && animationState === 'animating-out' && (
                        <motion.div
                          initial={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 1.2, transition: { duration: 0.2 } }}
                          className="absolute inset-0 border-2 border-current rounded-lg"
                        />
                      )}
                    </AnimatePresence>

                    {isSelected && (
                      <motion.div
                        layoutId="active-tool-bg"
                        transition={{
                          layout: {
                            type: "spring",
                            stiffness: 250,
                            damping: 25,
                            mass: 0.5
                          },
                          y: { duration: 0.4, times: [0, 0.5, 1], ease: ["circOut", "circIn"] },
                          rotate: { duration: animationState === 'hopping' ? 0.45 : 0, times: [0, 0.85, 1], ease: ["easeInOut", "easeOut"] },
                          scale: { duration: 0.45, times: [0, 0.4, 0.85, 1], ease: ["easeOut", "easeIn", "easeOut"] }
                        }}
                        animate={
                          animationState === 'hopping' 
                            ? { 
                                rotate: [0, hopDirection === 1 ? 385 : -385, hopDirection === 1 ? 360 : -360], 
                                y: [0, -50, 0], 
                                scale: [1, 1.15, 0.9, 1] 
                              } 
                            : { rotate: 0, y: 0, scale: 1 }
                        }
                        className={clsx(
                          "absolute inset-0 rounded-lg -z-10",
                          t.color === 'blue' ? 'bg-blue-100' : 'bg-red-100'
                        )}
                      />
                    )}
                    
                    <motion.div
                      variants={{ 
                        hover: isSelected ? {} : t.hoverAnim,
                        rest: { scale: 1, rotate: 0, x: 0, y: 0 },
                        selected: { 
                          scale: [1, 0.8, 1.2, 1],
                          rotate: 0,
                          x: 0,
                          y: 0
                        }
                      }}
                      transition={{ duration: 0.3, type: "spring" }}
                      className={clsx(
                        "relative z-10 transition-colors duration-200 flex items-center justify-center w-5 h-5",
                        isSelected 
                          ? (t.color === 'blue' ? 'text-blue-600' : 'text-red-600')
                          : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={t.id === 'plus' ? activePlusTool : t.id}
                          initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                          transition={{ duration: 0.15 }}
                          className="flex items-center justify-center absolute inset-0"
                        >
                          <Icon 
                            className={clsx(
                              "w-5 h-5 transition-colors duration-200", 
                              isSelected && (t.color === 'blue' ? 'fill-blue-600/10' : 'fill-red-600/10')
                            )} 
                            isSelected={isSelected} 
                          />
                        </motion.div>
                      </AnimatePresence>
                    </motion.div>
                  </motion.button>
                );

                return (
                  <motion.div 
                    key={t.id} 
                    ref={t.id === 'plus' ? plusMenuRef : undefined}
                    variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}
                  >
                    {t.id === 'plus' ? (
                      ButtonContent
                    ) : (
                      <Tooltip content={t.id.charAt(0).toUpperCase() + t.id.slice(1)} shortcut={t.shortcut} position="top">
                        {ButtonContent}
                      </Tooltip>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode === 'edit' && (
          <motion.div 
            className="fixed bottom-8 left-8 flex items-center z-[9999] pointer-events-none"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{
              hidden: { 
                clipPath: "inset(0 100% 0 0% round 12px)", 
                opacity: 0,
                transition: { type: "spring", bounce: 0, duration: 0.4, staggerChildren: 0.03, staggerDirection: -1 } 
              },
              visible: { 
                clipPath: "inset(0 0% 0 0% round 12px)", 
                opacity: 1,
                transitionEnd: { clipPath: "none" },
                transition: { type: "spring", bounce: 0, duration: 0.4, delayChildren: 0.1, staggerChildren: 0.05 } 
              }
            }}
          >
            <motion.div 
              className="flex items-center gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-md shadow-none border border-zinc-200 pointer-events-auto rounded-xl"
            >
              <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
                <Tooltip content="Search" shortcut="⌘K" position="top">
                  <motion.button 
                    type="button"
                    whileHover="hover"
                    onClick={() => setIsSearchOpen(true)}
                    onPointerEnter={() => setHoveredTopLeft('search')}
                    className="relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900"
                  >
                    {hoveredTopLeft === 'search' && (
                      <motion.div
                        layoutId="top-left-hover-bg"
                        initial={false}
                        animate={{ opacity: 1 }}
                        transition={{
                          layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                          opacity: { duration: 0.2 }
                        }}
                        className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
                      />
                    )}
                    <motion.div variants={{ hover: { scale: 1.1, rotate: -15 } }} transition={{ duration: 0.3, type: "spring" }}>
                      <Search className="w-5 h-5 relative z-10" />
                    </motion.div>
                  </motion.button>
                </Tooltip>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode === 'edit' && (
          <motion.div 
            className="fixed top-8 left-8 flex items-center gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-md shadow-none border border-zinc-200 pointer-events-auto rounded-xl"
            onPointerLeave={() => setHoveredTopLeft(null)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{
              hidden: { 
                clipPath: "inset(0 100% 0 0% round 12px)", 
                opacity: 0,
                transition: { type: "spring", bounce: 0, duration: 0.4, staggerChildren: 0.03, staggerDirection: -1 } 
              },
              visible: { 
                clipPath: "inset(0 0% 0 0% round 12px)", 
                opacity: 1,
                transitionEnd: { clipPath: "none" },
                transition: { type: "spring", bounce: 0, duration: 0.4, delayChildren: 0.1, staggerChildren: 0.05 } 
              }
            }}
          >
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
              <Tooltip content="Menu" position="bottom">
                <motion.button 
                  type="button"
                  whileHover="hover"
                  onPointerEnter={() => setHoveredTopLeft('more')}
                  className="relative w-9 h-9 p-2 transition-colors flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900"
                >
                  {hoveredTopLeft === 'more' && (
                    <motion.div
                      layoutId="top-left-hover-bg"
                      initial={false}
                      animate={{ opacity: 1 }}
                      transition={{
                        layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                        opacity: { duration: 0.2 }
                      }}
                      className="absolute inset-0 rounded-lg bg-zinc-100 -z-10"
                    />
                  )}
                  <motion.div variants={{ hover: { scale: 1.1, rotate: 90 } }} transition={{ duration: 0.3, type: "spring" }}>
                    <MoreVertical className="w-5 h-5 relative z-10" />
                  </motion.div>
                </motion.button>
              </Tooltip>
            </motion.div>

            <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4 } } }}>
              <span className="text-sm font-medium text-zinc-900 min-w-[120px] text-center truncate px-2">
                {canvasTitle}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

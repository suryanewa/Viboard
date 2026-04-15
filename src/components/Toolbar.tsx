import React, { useState, useRef, useEffect } from 'react';
import { useBoardStore } from '../store';
import { Type, Link, Magnet, Upload, Pencil, Circle, MousePointer, Hand, ZoomIn, ZoomOut, Search, Send } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { Block, BlockType } from '../types';
import { Tooltip } from './Tooltip';
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

  const tool = useBoardStore((state) => state.tool);
  const setTool = useBoardStore((state) => state.setTool);

  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showLinkPopup && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkPopup]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (e.key.toLowerCase() === 's' && !e.shiftKey && !cmdOrCtrl) {
        setTool('sticky');
      } else if (e.key.toLowerCase() === 't' && !cmdOrCtrl) {
        setTool('text');
      } else if (e.key.toLowerCase() === 'm' && !cmdOrCtrl) {
        setTool('marker');
      } else if (e.key.toLowerCase() === 'k' && !cmdOrCtrl) {
        setTool('shape');
      } else if (e.key.toLowerCase() === 'v' && !cmdOrCtrl) {
        setTool('select');
      } else if (e.key.toLowerCase() === 'p' && !cmdOrCtrl) {
        setTool('pan');
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
          setViewport({ zoom: Math.min(5, viewport.zoom + 0.1) });
        } else if (e.key === '-') {
          e.preventDefault();
          setViewport({ zoom: Math.max(0, viewport.zoom - 0.1) });
        } else if (e.key === '0') {
          e.preventDefault();
          setViewport({ x: 300, y: 200, zoom: 0.5 });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [snapping, gridView, viewport, setTool, setSnapping, setGridView, setViewport]);

  const handleAddBlock = (type: BlockType, dataOverride: any = {}) => {
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
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkUrl.trim()) {
      handleAddBlock('link', {
        url: linkUrl.trim(),
        title: linkUrl.trim(),
        description: ''
      });
      setLinkUrl('');
      setShowLinkPopup(false);
    }
  };

  const handleLinkCancel = () => {
    setLinkUrl('');
    setShowLinkPopup(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTool('select');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      handleAddBlock('image', { url });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center z-[9998] pointer-events-none">
      <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md shadow-lg border border-zinc-200 pointer-events-auto">
        <Tooltip content="Select" shortcut="V">
          <button 
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              const nextTool = 'select';
              setTool(nextTool);
            }}
            className={clsx(
              "p-2 transition-colors",
              tool === 'select' 
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <MousePointer className="w-5 h-5" />
          </button>
        </Tooltip>

        <Tooltip content="Pan" shortcut="P">
          <button 
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              const nextTool = tool === 'pan' ? 'select' : 'pan';
              setTool(nextTool);
            }}
            className={clsx(
              "p-2 transition-colors",
              tool === 'pan' 
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Hand className="w-5 h-5" />
          </button>
        </Tooltip>

        <Tooltip content="Sticky" shortcut="S">
          <button 
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              const nextTool = tool === 'sticky' ? 'select' : 'sticky';
              setTool(nextTool);
              if (nextTool === 'sticky') {
                useBoardStore.getState().setSelection([]);
                useBoardStore.getState().setDrawingSelection([]);
              }
            }}
            className={clsx(
              "p-2 transition-colors",
              tool === 'sticky' 
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <div className={clsx("w-4 h-4 bg-white border-2", tool === 'sticky' ? 'border-blue-600' : 'border-currentColor')} />
          </button>
        </Tooltip>
        
        <Tooltip content="Text" shortcut="T">
          <button 
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              const nextTool = tool === 'text' ? 'select' : 'text';
              setTool(nextTool);
              if (nextTool === 'text') {
                useBoardStore.getState().setSelection([]);
                useBoardStore.getState().setDrawingSelection([]);
              }
            }}
            className={clsx(
              "p-2 transition-colors",
              tool === 'text' 
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Type className="w-5 h-5" />
          </button>
        </Tooltip>
        
        <Tooltip content="Marker" shortcut="M">
          <button 
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              const nextTool = tool === 'marker' ? 'select' : 'marker';
              setTool(nextTool);
              if (nextTool === 'marker') {
                useBoardStore.getState().setSelection([]);
              }
            }}
            className={clsx(
              "p-2 transition-colors",
              tool === 'marker' 
                ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Pencil className={clsx("w-5 h-5", tool === 'marker' && "fill-yellow-600/10")} />
          </button>
        </Tooltip>

        <Tooltip content="Shape" shortcut="K">
          <button 
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              const nextTool = tool === 'shape' ? 'select' : 'shape';
              setTool(nextTool);
              if (nextTool === 'shape') {
                useBoardStore.getState().setSelection([]);
                useBoardStore.getState().setDrawingSelection([]);
              }
            }}
            className={clsx(
              "p-2 transition-colors",
              tool === 'shape' 
                ? "bg-red-50 text-red-600 hover:bg-red-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Circle className={clsx("w-5 h-5", tool === 'shape' && "fill-red-600/10")} />
          </button>
        </Tooltip>

        <Tooltip content="Upload" shortcut="U">
          <label className="p-2 hover:bg-zinc-100 transition-colors text-zinc-600 hover:text-zinc-900 cursor-pointer">
            <Upload className="w-5 h-5" />
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
          </label>
        </Tooltip>

        <Tooltip content="Link" shortcut="L">
          <button 
            type="button"
            onClick={() => setShowLinkPopup(true)}
            className="p-2 hover:bg-zinc-100 transition-colors text-zinc-600 hover:text-zinc-900"
          >
            <Link className="w-5 h-5" />
          </button>
        </Tooltip>
      </div>

      <div className="fixed top-8 right-8 flex items-center gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-md shadow-lg border border-zinc-200 pointer-events-auto">
        <Tooltip content="Snap" shortcut="G" position="bottom">
          <button 
            type="button"
            onClick={() => setSnapping(!snapping)}
            className={clsx(
              "w-9 h-9 p-2 transition-colors",
              snapping 
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Magnet className={clsx("w-5 h-5", snapping && "fill-blue-600/10")} />
          </button>
        </Tooltip>

        <Tooltip content="Grid" shortcut="⇧G" position="bottom">
          <button 
            type="button"
            onClick={() => {
              const nextView = gridView === 'none' ? 'box' : gridView === 'box' ? 'dot' : 'none';
              setGridView(nextView);
            }}
            className={clsx(
              "w-9 h-9 p-2 transition-colors",
              gridView !== 'none'
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100" 
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            {gridView === 'box' ? (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <title>Box Grid</title>
                <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="12" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="12" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            ) : gridView === 'dot' ? (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <title>Dot Grid</title>
                <circle cx="5" cy="5" r="2" fill="currentColor"/>
                <circle cx="15" cy="5" r="2" fill="currentColor"/>
                <circle cx="5" cy="15" r="2" fill="currentColor"/>
                <circle cx="15" cy="15" r="2" fill="currentColor"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <title>No Grid</title>
                <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="12" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="12" y="12" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            )}
          </button>
        </Tooltip>

        <div className="w-px h-6 bg-zinc-200 mx-1" />

        <Tooltip content="Zoom Out" shortcut="⌘-" position="bottom">
          <button 
            type="button"
            onClick={() => setViewport({ zoom: Math.max(0, viewport.zoom - 0.1) })}
            className="w-9 h-9 p-2 hover:bg-zinc-100 transition-colors text-zinc-600 hover:text-zinc-900"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
        </Tooltip>

        <Tooltip content="Zoom" shortcut="⌘0" position="bottom">
          <button 
            type="button"
            onClick={cycleZoom}
            className="w-9 h-9 p-2 hover:bg-zinc-100 transition-colors text-zinc-600 hover:text-zinc-900 text-xs font-mono flex items-center justify-center"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
        </Tooltip>

        <Tooltip content="Zoom In" shortcut="⌘+" position="bottom">
          <button 
            type="button"
            onClick={() => setViewport({ zoom: Math.min(5, viewport.zoom + 0.1) })}
            className="w-9 h-9 p-2 hover:bg-zinc-100 transition-colors text-zinc-600 hover:text-zinc-900"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
        </Tooltip>
      </div>

      <div className="fixed top-8 left-8 flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-md shadow-lg border border-zinc-200 pointer-events-auto">
        <Tooltip content="Search" shortcut="⌘K" position="bottom">
          <button 
            type="button"
            className="w-9 h-9 p-2 hover:bg-zinc-100 transition-colors text-zinc-600 hover:text-zinc-900"
          >
            <Search className="w-5 h-5" />
          </button>
        </Tooltip>

        <span className="text-sm font-medium text-zinc-900 min-w-[120px] text-center truncate">
          {canvasTitle}
        </span>

        <Tooltip content="Share" shortcut="⌘⇧S" position="bottom">
          <button 
            type="button"
            className="w-9 h-9 p-2 hover:bg-zinc-100 transition-colors text-zinc-600 hover:text-zinc-900"
          >
            <Send className="w-5 h-5" />
          </button>
        </Tooltip>
      </div>

      <AnimatePresence>
        {showLinkPopup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-auto"
            onClick={handleLinkCancel}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.95, y: 5, filter: "blur(2px)" }}
              transition={{ 
                type: "spring", 
                damping: 25, 
                stiffness: 350,
                mass: 0.5
              }}
              className="bg-white/90 backdrop-blur-md shadow-lg border border-zinc-200 p-4 w-80 max-w-[90vw] pointer-events-auto flex flex-col gap-3"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-900">Add Link</h3>
              </div>
              <form onSubmit={handleLinkSubmit} className="flex flex-col gap-3">
                <input
                  ref={linkInputRef}
                  type="url"
                  required
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleLinkCancel}
                    className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm text-zinc-900 bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 transition-colors shadow-sm"
                  >
                    Add
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useState } from 'react';
import { useBoardStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Highlighter, Eraser, Circle, Square, Triangle, Upload, CornerDownLeft } from 'lucide-react';
import clsx from 'clsx';

import { ColorSlider } from './ColorSlider';
import { ThicknessSlider } from './ThicknessSlider';

const STICKY_COLORS = [
  { name: 'yellow', hue: 55 },
  { name: 'orange', hue: 30 },
  { name: 'green', hue: 140 },
  { name: 'blue', hue: 210 },
  { name: 'purple', hue: 280 },
  { name: 'pink', hue: 330 },
  { name: 'red', hue: 0 },
];

export const PropertyToolbar: React.FC = () => {
  const tool = useBoardStore((state) => state.tool);
  const updateBlock = useBoardStore((state) => state.updateBlock);
  const blocks = useBoardStore((state) => state.blocks);
  const selection = useBoardStore((state) => state.selection);
  
  const markerType = useBoardStore((state) => state.markerType);
  const setMarkerType = useBoardStore((state) => state.setMarkerType);
  const markerThickness = useBoardStore((state) => state.markerThickness);
  const setMarkerThickness = useBoardStore((state) => state.setMarkerThickness);
  const markerColor = useBoardStore((state) => state.markerColor);
  const setMarkerColor = useBoardStore((state) => state.setMarkerColor);
  const stickyHue = useBoardStore((state) => state.stickyHue);
  const setStickyHue = useBoardStore((state) => state.setStickyHue);
  const shapeType = useBoardStore((state) => state.shapeType);
  const setShapeType = useBoardStore((state) => state.setShapeType);
  const shapeHue = useBoardStore((state) => state.shapeHue);
  const setShapeHue = useBoardStore((state) => state.setShapeHue);
  const animationState = useBoardStore((state) => state.animationState);
  const isPlusMenuOpen = useBoardStore((state) => state.isPlusMenuOpen);

  const selectedBlocks = selection.map(id => blocks[id]).filter(Boolean);
  const hasSelectedStickies = selectedBlocks.length > 0 && selectedBlocks.every(b => b.type === 'sticky');
  const hasSelectedShapes = selectedBlocks.length > 0 && selectedBlocks.every(b => b.type === 'shape');

  const initialHue = tool === 'marker' 
    ? parseInt(markerColor.match(/\d+/)?.[0] || '45', 10)
    : tool === 'shape'
      ? (hasSelectedShapes && selectedBlocks[0]?.data?.hue !== undefined ? selectedBlocks[0].data.hue : shapeHue)
      : hasSelectedStickies && selectedBlocks[0]?.data?.hue !== undefined 
        ? selectedBlocks[0].data.hue 
        : stickyHue;
  const [currentHue, setCurrentHue] = useState(initialHue);
  const [hoveredProperty, setHoveredProperty] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');

  const handleHueChangeSlider = (newHue: number) => {
    setCurrentHue(newHue);
    if (tool === 'sticky' && hasSelectedStickies) {
      selection.forEach(id => {
        updateBlock(id, { data: { ...blocks[id].data, hue: newHue } });
      });
    } else if (tool === 'marker') {
      setMarkerColor(`hsl(${newHue}, 90%, 65%)`);
    } else if (tool === 'shape') {
      setShapeHue(newHue);
      if (hasSelectedShapes) {
        selection.forEach(id => {
          updateBlock(id, { data: { ...blocks[id].data, hue: newHue, color: `hsl(${newHue}, 90%, 65%)` } });
        });
      }
    }
  };

  const handleStickyColorClick = (hue: number) => {
    setCurrentHue(hue);
    setStickyHue(hue);
    if (hasSelectedStickies) {
      selection.forEach(id => {
        updateBlock(id, { data: { ...blocks[id].data, hue } });
      });
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkUrl.trim()) {
      if ((window as any).__handleAddBlock) {
        (window as any).__handleAddBlock('link', {
          url: linkUrl.trim(),
          title: linkUrl.trim(),
          description: ''
        });
      }
      setLinkUrl('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if ((window as any).__handleAddBlock) {
        (window as any).__handleAddBlock('image', { url });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <AnimatePresence mode="wait">
      {!isPlusMenuOpen && (tool === 'sticky' || tool === 'marker' || tool === 'shape' || tool === 'link') && (animationState === 'animating-in' || animationState === 'idle') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10, transition: { duration: 0.15, ease: 'easeIn' } }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-[110px] left-1/2 -translate-x-1/2 flex items-center justify-center px-[10px] bg-white/90 backdrop-blur-md border border-zinc-200 pointer-events-auto rounded-full z-[9998] w-[380px] h-[52px] !overflow-visible"
        >
          {tool === 'sticky' && (
          <div className="flex items-center justify-center gap-3 w-full h-8">
            {STICKY_COLORS.map(({ hue }) => {
              const isSelected = currentHue === hue;
              return (
                <motion.button
                  key={hue}
                  type="button"
                  whileHover="hover"
                  whileTap="tap"
                  onClick={() => handleStickyColorClick(hue)}
                  className="relative w-6 h-6 rounded-full flex items-center justify-center"
                  variants={{
                    hover: { scale: 1.15 },
                    tap: { scale: 0.95 }
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <div 
                    className={clsx(
                      "w-full h-full rounded-full",
                      !isSelected && "border border-zinc-200/50"
                    )}
                    style={{ backgroundColor: `hsl(${hue}, 90%, 85%)` }}
                  />
                  {isSelected && (
                    <motion.div
                      layoutId="sticky-color-active"
                      className="absolute inset-0 rounded-full ring-2 ring-zinc-900 ring-offset-2 pointer-events-none"
                      transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        )}

        {tool === 'marker' && (
          <div 
            className="flex items-center gap-4 w-full h-8 !overflow-visible"
            onPointerLeave={() => setHoveredProperty(null)}
          >
            <div className="flex items-center gap-1 border-r border-zinc-200 pr-4">
              <motion.button
                type="button"
                whileHover="hover"
                onPointerEnter={() => setHoveredProperty('marker')}
                onClick={() => setMarkerType('marker')}
                className={clsx(
                  "relative p-1.5 rounded-md transition-colors flex items-center justify-center w-8 h-8",
                  markerType === 'marker' 
                    ? "text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Marker"
              >
                {(hoveredProperty || markerType) === 'marker' && (
                  <motion.div
                    layoutId="property-hover-bg"
                    initial={false}
                    animate={{ opacity: hoveredProperty === 'marker' && markerType !== 'marker' ? 1 : 0 }}
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                      opacity: { duration: 0.2 }
                    }}
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                {markerType === 'marker' && (
                  <motion.div
                    layoutId="property-active-bg"
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                <motion.div variants={{ hover: { scale: 1.1, rotate: -15 } }} transition={{ duration: 0.3, type: "spring" }}>
                  <Pencil className="w-4 h-4 relative z-10" />
                </motion.div>
              </motion.button>
              <motion.button
                type="button"
                whileHover="hover"
                onPointerEnter={() => setHoveredProperty('highlighter')}
                onClick={() => setMarkerType('highlighter')}
                className={clsx(
                  "relative p-1.5 rounded-md transition-colors flex items-center justify-center w-8 h-8",
                  markerType === 'highlighter' 
                    ? "text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Highlighter"
              >
                {(hoveredProperty || markerType) === 'highlighter' && (
                  <motion.div
                    layoutId="property-hover-bg"
                    initial={false}
                    animate={{ opacity: hoveredProperty === 'highlighter' && markerType !== 'highlighter' ? 1 : 0 }}
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                      opacity: { duration: 0.2 }
                    }}
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                {markerType === 'highlighter' && (
                  <motion.div
                    layoutId="property-active-bg"
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                <motion.div variants={{ hover: { scale: 1.1, rotate: -15 } }} transition={{ duration: 0.3, type: "spring" }}>
                  <Highlighter className="w-4 h-4 relative z-10" />
                </motion.div>
              </motion.button>
              <motion.button
                type="button"
                whileHover="hover"
                onPointerEnter={() => setHoveredProperty('eraser')}
                onClick={() => setMarkerType('eraser')}
                className={clsx(
                  "relative p-1.5 rounded-md transition-colors flex items-center justify-center w-8 h-8",
                  markerType === 'eraser' 
                    ? "text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Eraser"
              >
                {(hoveredProperty || markerType) === 'eraser' && (
                  <motion.div
                    layoutId="property-hover-bg"
                    initial={false}
                    animate={{ opacity: hoveredProperty === 'eraser' && markerType !== 'eraser' ? 1 : 0 }}
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                      opacity: { duration: 0.2 }
                    }}
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                {markerType === 'eraser' && (
                  <motion.div
                    layoutId="property-active-bg"
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                <motion.div variants={{ hover: { scale: 1.1, rotate: 15 } }} transition={{ duration: 0.3, type: "spring" }}>
                  <Eraser className="w-4 h-4 relative z-10" />
                </motion.div>
              </motion.button>
            </div>
            
            <div className="flex items-center gap-3 border-r border-zinc-200 pr-4">
              <div className="relative w-24 h-8 flex items-center !overflow-visible">
                <ThicknessSlider 
                  value={markerThickness} 
                  onChange={setMarkerThickness}
                  color={`hsl(${currentHue}, 90%, 65%)`}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-1 px-2 !overflow-visible">
              <ColorSlider 
                value={currentHue} 
                onChange={handleHueChangeSlider}
                className="flex-1"
              />
            </div>
            <style>{`
              input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: white;
                border: 2px solid #a1a1aa;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              input[type="range"]::-moz-range-thumb {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: white;
                border: 2px solid #a1a1aa;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
            `}</style>
          </div>
        )}
        {tool === 'shape' && (
          <div 
            className="flex items-center gap-4 w-full h-8 !overflow-visible"
            onPointerLeave={() => setHoveredProperty(null)}
          >
            <div className="flex items-center gap-1 border-r border-zinc-200 pr-4">
              <motion.button
                type="button"
                whileHover="hover"
                onPointerEnter={() => setHoveredProperty('circle')}
                onClick={() => {
                  setShapeType('circle');
                  if (hasSelectedShapes) {
                    selection.forEach(id => { updateBlock(id, { data: { ...blocks[id].data, shape: 'circle' } }); });
                  }
                }}
                className={clsx(
                  "relative p-1.5 rounded-md transition-colors flex items-center justify-center w-8 h-8",
                  shapeType === 'circle' 
                    ? "text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Circle"
              >
                {(hoveredProperty || shapeType) === 'circle' && (
                  <motion.div
                    layoutId="property-hover-bg"
                    initial={false}
                    animate={{ opacity: hoveredProperty === 'circle' && shapeType !== 'circle' ? 1 : 0 }}
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                      opacity: { duration: 0.2 }
                    }}
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                {shapeType === 'circle' && (
                  <motion.div
                    layoutId="property-active-bg"
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                <motion.div variants={{ hover: { scale: 1.15 } }} transition={{ duration: 0.3, type: "spring" }}>
                  <Circle className="w-4 h-4 relative z-10" />
                </motion.div>
              </motion.button>
              <motion.button
                type="button"
                whileHover="hover"
                onPointerEnter={() => setHoveredProperty('square')}
                onClick={() => {
                  setShapeType('square');
                  if (hasSelectedShapes) {
                    selection.forEach(id => { updateBlock(id, { data: { ...blocks[id].data, shape: 'square' } }); });
                  }
                }}
                className={clsx(
                  "relative p-1.5 rounded-md transition-colors flex items-center justify-center w-8 h-8",
                  shapeType === 'square' 
                    ? "text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Square"
              >
                {(hoveredProperty || shapeType) === 'square' && (
                  <motion.div
                    layoutId="property-hover-bg"
                    initial={false}
                    animate={{ opacity: hoveredProperty === 'square' && shapeType !== 'square' ? 1 : 0 }}
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                      opacity: { duration: 0.2 }
                    }}
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                {shapeType === 'square' && (
                  <motion.div
                    layoutId="property-active-bg"
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                <motion.div variants={{ hover: { scale: 1.15 } }} transition={{ duration: 0.3, type: "spring" }}>
                  <Square className="w-4 h-4 relative z-10" />
                </motion.div>
              </motion.button>
              <motion.button
                type="button"
                whileHover="hover"
                onPointerEnter={() => setHoveredProperty('triangle')}
                onClick={() => {
                  setShapeType('triangle');
                  if (hasSelectedShapes) {
                    selection.forEach(id => { updateBlock(id, { data: { ...blocks[id].data, shape: 'triangle' } }); });
                  }
                }}
                className={clsx(
                  "relative p-1.5 rounded-md transition-colors flex items-center justify-center w-8 h-8",
                  shapeType === 'triangle' 
                    ? "text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Triangle"
              >
                {(hoveredProperty || shapeType) === 'triangle' && (
                  <motion.div
                    layoutId="property-hover-bg"
                    initial={false}
                    animate={{ opacity: hoveredProperty === 'triangle' && shapeType !== 'triangle' ? 1 : 0 }}
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 30, mass: 0.8 },
                      opacity: { duration: 0.2 }
                    }}
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                {shapeType === 'triangle' && (
                  <motion.div
                    layoutId="property-active-bg"
                    className="absolute inset-0 rounded-md bg-zinc-100 -z-10"
                  />
                )}
                <motion.div variants={{ hover: { scale: 1.15, y: -1 } }} transition={{ duration: 0.3, type: "spring" }}>
                  <Triangle className="w-4 h-4 relative z-10" />
                </motion.div>
              </motion.button>
            </div>
            
            <div className="flex items-center gap-3 flex-1 px-2 !overflow-visible">
              <ColorSlider 
                value={currentHue} 
                onChange={handleHueChangeSlider}
                className="flex-1"
              />
            </div>
          </div>
        )}
        
        {tool === 'link' && (
          <div className="flex items-center gap-2 w-full h-8">
            <form onSubmit={handleLinkSubmit} className="flex flex-1 items-center gap-2">
              <input
                type="url"
                required
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 px-4 py-1.5 bg-zinc-100/50 border border-zinc-200/50 rounded-full text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <button
                type="submit"
                className="flex items-center justify-center w-8 h-8 text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors shadow-sm shrink-0"
              >
                <CornerDownLeft className="w-4 h-4" />
              </button>
            </form>
            <motion.label 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative flex items-center justify-center w-8 h-8 rounded-full transition-colors text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer shrink-0"
              title="Upload File"
            >
              <Upload className="w-4 h-4" />
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </motion.label>
          </div>
        )}
      </motion.div>
      )}
    </AnimatePresence>
  );
};

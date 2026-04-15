import React, { useState } from 'react';
import { useBoardStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Highlighter, Eraser, Circle, Square, Triangle } from 'lucide-react';
import clsx from 'clsx';

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

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseInt(e.target.value, 10);
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

  const handleStrokeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMarkerThickness(parseFloat(e.target.value));
  };

  return (
    <AnimatePresence mode="wait">
      {(tool === 'sticky' || tool === 'marker' || tool === 'shape') && (animationState === 'animating-in' || animationState === 'idle') && (
        <motion.div
          initial={{ opacity: 0, y: 20, clipPath: 'circle(0% at 50% 100%)' }}
          animate={{ opacity: 1, y: 0, clipPath: 'circle(150% at 50% 100%)' }}
          exit={{ opacity: 0, y: 10, clipPath: 'circle(0% at 50% 100%)', transition: { duration: 0.15, ease: 'easeIn' } }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-[88px] left-1/2 -translate-x-1/2 flex items-center justify-center px-4 bg-white/90 backdrop-blur-md shadow-lg border border-zinc-200 pointer-events-auto rounded-full z-[9998] w-[380px] h-[52px]"
        >
          {tool === 'sticky' && (
          <div className="flex items-center justify-center gap-3 w-full h-8">
            {STICKY_COLORS.map(({ hue }) => (
              <button
                key={hue}
                type="button"
                onClick={() => handleStickyColorClick(hue)}
                className={clsx(
                  "w-6 h-6 rounded-full transition-transform hover:scale-110",
                  currentHue === hue ? "ring-2 ring-zinc-900 ring-offset-2" : "border border-zinc-200/50"
                )}
                style={{ backgroundColor: `hsl(${hue}, 90%, 85%)` }}
              />
            ))}
          </div>
        )}

        {tool === 'marker' && (
          <div className="flex items-center gap-4 w-full h-8">
            <div className="flex items-center gap-1 border-r border-zinc-200 pr-4">
              <button
                type="button"
                onClick={() => setMarkerType('marker')}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  markerType === 'marker' 
                    ? "bg-zinc-100 text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
                title="Marker"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMarkerType('highlighter')}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  markerType === 'highlighter' 
                    ? "bg-zinc-100 text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
                title="Highlighter"
              >
                <Highlighter className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMarkerType('eraser')}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  markerType === 'eraser' 
                    ? "bg-zinc-100 text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
                title="Eraser"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-3 border-r border-zinc-200 pr-4">
              <div 
                className="relative w-24 h-8 flex items-center"
                style={{ '--thumb-size': `${Math.max(10, Math.min(22, markerThickness + 4))}px` } as React.CSSProperties}
              >
                <svg 
                  className="absolute left-0 w-full h-full overflow-visible pointer-events-none"
                  viewBox="0 0 96 32"
                  aria-label="Thickness slider"
                >
                  <path 
                    d="M 5 15 A 1 1 0 0 0 5 17 L 85 25 A 9 9 0 0 0 85 7 Z"
                    fill={`hsl(${currentHue}, 90%, 65%)`}
                  />
                </svg>
                <input 
                  type="range" 
                  min="1" 
                  max="20" 
                  step="0.1"
                  value={markerThickness} 
                  onChange={handleStrokeChange}
                  className="thickness-slider relative w-full h-full cursor-pointer z-10 m-0"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-1">
              <input 
                type="range" 
                min="0" 
                max="360" 
                value={currentHue} 
                onChange={handleHueChange}
                className="flex-1 w-full h-2 appearance-none rounded-full outline-none"
                style={{
                  background: `linear-gradient(to right, 
                    hsl(0, 90%, 65%), 
                    hsl(60, 90%, 65%), 
                    hsl(120, 90%, 65%), 
                    hsl(180, 90%, 65%), 
                    hsl(240, 90%, 65%), 
                    hsl(300, 90%, 65%), 
                    hsl(360, 90%, 65%)
                  )`
                }}
              />
            </div>
            <style>{`
              input[type="range"]:not(.thickness-slider)::-webkit-slider-thumb {
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
              input[type="range"]:not(.thickness-slider)::-moz-range-thumb {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: white;
                border: 2px solid #a1a1aa;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              
              .thickness-slider {
                -webkit-appearance: none;
                appearance: none;
                background: transparent;
              }
              .thickness-slider::-webkit-slider-runnable-track {
                background: transparent;
                height: 100%;
              }
              .thickness-slider::-moz-range-track {
                background: transparent;
                height: 100%;
                border: none;
              }
              .thickness-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: var(--thumb-size);
                height: var(--thumb-size);
                border-radius: 50%;
                background: white;
                border: 2px solid #a1a1aa;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                margin-top: calc(16px - (var(--thumb-size) / 2));
              }
              .thickness-slider::-moz-range-thumb {
                width: var(--thumb-size);
                height: var(--thumb-size);
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
          <div className="flex items-center gap-4 w-full h-8">
            <div className="flex items-center gap-1 border-r border-zinc-200 pr-4">
              <button
                type="button"
                onClick={() => {
                  setShapeType('circle');
                  if (hasSelectedShapes) {
                    selection.forEach(id => { updateBlock(id, { data: { ...blocks[id].data, shape: 'circle' } }); });
                  }
                }}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  shapeType === 'circle' 
                    ? "bg-zinc-100 text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
                title="Circle"
              >
                <Circle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShapeType('square');
                  if (hasSelectedShapes) {
                    selection.forEach(id => { updateBlock(id, { data: { ...blocks[id].data, shape: 'square' } }); });
                  }
                }}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  shapeType === 'square' 
                    ? "bg-zinc-100 text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
                title="Square"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShapeType('triangle');
                  if (hasSelectedShapes) {
                    selection.forEach(id => { updateBlock(id, { data: { ...blocks[id].data, shape: 'triangle' } }); });
                  }
                }}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  shapeType === 'triangle' 
                    ? "bg-zinc-100 text-zinc-900" 
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                )}
                title="Triangle"
              >
                <Triangle className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-3 flex-1">
              <input 
                type="range" 
                min="0" 
                max="360" 
                value={currentHue} 
                onChange={handleHueChange}
                className="flex-1 w-full h-2 appearance-none rounded-full outline-none"
                style={{
                  background: `linear-gradient(to right, 
                    hsl(0, 90%, 65%), 
                    hsl(60, 90%, 65%), 
                    hsl(120, 90%, 65%), 
                    hsl(180, 90%, 65%), 
                    hsl(240, 90%, 65%), 
                    hsl(300, 90%, 65%), 
                    hsl(360, 90%, 65%)
                  )`
                }}
              />
            </div>
          </div>
        )}
      </motion.div>
      )}
    </AnimatePresence>
  );
};

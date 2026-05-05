import React, { useEffect, useState } from 'react';
import { useBoardStore } from '../store';
import type { Block } from '../types';

import { Copy, Scissors, Clipboard, Trash2, CopyPlus, RotateCcw, RotateCw, ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Image as ImageIcon, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';

type LoadedImage = { img: HTMLImageElement | null; block: Block };
type ValidLoadedImage = { img: HTMLImageElement; block: Block };

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
  exit: (total: number) => ({ 
    opacity: 0, 
    height: 0,
    filter: "blur(8px)",
    transition: { 
      type: "spring",
      bounce: 0,
      duration: 0.4,
      delay: (total === 3) ? 0.1 : 0.25
    }
  })
};

const itemVariants: Variants = {
  hidden: () => ({ 
    opacity: 0, 
    y: -15, 
    rotateX: -65, 
    transformPerspective: 600, 
    filter: "blur(5px)",
    transition: { duration: 0 }
  }),
  visible: (custom: { i: number; total: number } | number) => {
    const i = typeof custom === 'number' ? custom : custom.i;
    return { 
      opacity: 1, 
      y: 0, 
      rotateX: 0, 
      filter: "blur(0px)",
      transition: { type: "spring", bounce: 0.3, duration: 0.45, delay: i * 0.04 } 
    };
  },
  exit: (custom: { i: number; total: number } | number) => {
    const i = typeof custom === 'number' ? custom : custom.i;
    const total = typeof custom === 'number' ? 8 : custom.total;
    return {
      opacity: 0,
      y: 15,
      rotateX: 65,
      filter: "blur(5px)",
      transition: { type: "spring", bounce: 0.3, duration: 0.4, delay: Math.max(0, total - 1 - i) * 0.03 }
    };
  }
};

const containsBlockCenter = (frame: Block, block: Block) => {
  const centerX = block.x + block.width / 2;
  const centerY = block.y + block.height / 2;

  return centerX >= frame.x &&
    centerX <= frame.x + frame.width &&
    centerY >= frame.y &&
    centerY <= frame.y + frame.height;
};

const getImageBlocksInFrame = (blocks: Record<string, Block>, frameId: string | null) => {
  if (!frameId) return [];

  const frame = blocks[frameId];
  if (!frame || frame.type !== 'frame') return [];

  return Object.values(blocks).filter((block) =>
    block.type === 'image' &&
    block.data?.url &&
    containsBlockCenter(frame, block)
  );
};

const loadImageBlocks = (imageBlocks: Block[]) => Promise.all(
  imageBlocks.map((block) => {
    return new Promise<LoadedImage>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve({ img, block });
      img.onerror = () => resolve({ img: null, block });
      img.src = block.data.url;
    });
  })
);

const isValidLoadedImage = (item: LoadedImage): item is ValidLoadedImage => item.img !== null;

const drawMoodboardCanvas = (validImages: ValidLoadedImage[]) => {
  const cols = Math.ceil(Math.sqrt(validImages.length));
  const rows = Math.ceil(validImages.length / cols);
  const cellWidth = 400;
  const cellHeight = 400;
  const gap = 20;
  const padding = 40;

  const canvasWidth = cols * cellWidth + (cols - 1) * gap + padding * 2;
  const canvasHeight = rows * cellHeight + (rows - 1) * gap + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  validImages.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = padding + col * (cellWidth + gap);
    const y = padding + row * (cellHeight + gap);

    const imgAspect = item.img.width / item.img.height;
    const cellAspect = cellWidth / cellHeight;
    let drawWidth = cellWidth;
    let drawHeight = cellHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > cellAspect) {
      drawWidth = cellHeight * imgAspect;
      offsetX = (cellWidth - drawWidth) / 2;
    } else {
      drawHeight = cellWidth / imgAspect;
      offsetY = (cellHeight - drawHeight) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellWidth, cellHeight);
    ctx.clip();
    ctx.drawImage(item.img, x + offsetX, y + offsetY, drawWidth, drawHeight);
    ctx.restore();
  });

  return canvas;
};

export const ContextMenu: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genApiKey, setGenApiKey] = useState(localStorage.getItem('OPENAI_API_KEY') || '');
  const [menuState, setMenuState] = useState({ x: 0, y: 0, hasSelection: false, isFrameSelected: false, frameId: null as string | null });
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
  const bringToFront = useBoardStore((state) => state.bringToFront);
  const bringForward = useBoardStore((state) => state.bringForward);
  const sendBackward = useBoardStore((state) => state.sendBackward);
  const sendToBack = useBoardStore((state) => state.sendToBack);
  const addBlock = useBoardStore((state) => state.addBlock);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      
      const { selection, setSelection, drawingSelection, setDrawingSelection, blocks, drawings, viewport } = useBoardStore.getState();
      const targetBlockElement = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-block-id]');
      let clickedBlock = targetBlockElement?.dataset.blockId
        ? blocks[targetBlockElement.dataset.blockId]
        : undefined;
      
      const rect = document.querySelector('main')?.getBoundingClientRect();
      if (rect) {
        const canvasX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
        const canvasY = (e.clientY - rect.top - viewport.y) / viewport.zoom;
        
        clickedBlock ??= Object.values(blocks)
          .sort((a, b) => b.zIndex - a.zIndex)
          .find(b =>
            canvasX >= b.x && canvasX <= b.x + b.width &&
            canvasY >= b.y && canvasY <= b.y + b.height
          );
        
        if (clickedBlock) {
          if (!selection.includes(clickedBlock.id)) {
            setSelection([clickedBlock.id]);
            setDrawingSelection([]);
          }
        } else {
          const clickedDrawing = drawings.find(d => 
            d.points.some(p => Math.abs(p.x - canvasX) < 10 && Math.abs(p.y - canvasY) < 10)
          );
          if (clickedDrawing && !drawingSelection.includes(clickedDrawing.id)) {
            setSelection([]);
            setDrawingSelection([clickedDrawing.id]);
          }
        }
      }

      const currentSelection = useBoardStore.getState().selection;
      let isFrameSelected = false;
      let frameId = null;
      if (currentSelection.length === 1) {
        const block = blocks[currentSelection[0]];
        if (block?.type === 'frame') {
          isFrameSelected = true;
          frameId = block.id;
        }
      }

      setMenuState({ 
        x: e.clientX, 
        y: e.clientY, 
        hasSelection: currentSelection.length > 0 || useBoardStore.getState().drawingSelection.length > 0,
        isFrameSelected,
        frameId
      });
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

  const handleExportMoodboard = async () => {
    setVisible(false);
    const { blocks, viewport } = useBoardStore.getState();
    
    const imageBlocks = getImageBlocksInFrame(blocks, menuState.frameId);
    if (imageBlocks.length === 0) {
      alert("No images found in the frame to create a moodboard.");
      return;
    }

    const loadedImages = await loadImageBlocks(imageBlocks);

    const validImages = loadedImages.filter(isValidLoadedImage);
    if (validImages.length === 0) return;

    const canvas = drawMoodboardCanvas(validImages);
    if (!canvas) return;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Export and copy
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }

      const dataUrl = canvas.toDataURL('image/png');
      const highestZ = Math.max(0, ...Object.values(useBoardStore.getState().blocks).map((b) => b.zIndex));
      
      const targetX = -viewport.x / viewport.zoom + window.innerWidth / 2 / viewport.zoom;
      const targetY = -viewport.y / viewport.zoom + window.innerHeight / 2 / viewport.zoom;

      addBlock({
        id: uuidv4(),
        type: 'image',
        x: targetX,
        y: targetY,
        width: 600,
        height: 600 * (canvasHeight / canvasWidth),
        zIndex: highestZ + 1,
        data: { url: dataUrl, alt: 'Exported Moodboard' }
      });
    }, 'image/png');
  };

  const executeGenerateImage = async () => {
    setVisible(false);
    setShowGenerateModal(false);
    const { blocks, viewport, addBlock } = useBoardStore.getState();
    
    const userPrompt = genPrompt;
    if (!userPrompt) return;
    
    const apiKey =
      import.meta.env.VITE_OPENAI_API_KEY ||
      genApiKey;
    if (!apiKey) return;
    
    if (genApiKey) {
      localStorage.setItem('OPENAI_API_KEY', genApiKey);
    }

    const imageBlocks = getImageBlocksInFrame(blocks, menuState.frameId);
    if (imageBlocks.length === 0) {
      alert("No images found in the frame to create a moodboard.");
      return;
    }

    const loadedImages = await loadImageBlocks(imageBlocks);

    const validImages = loadedImages.filter(isValidLoadedImage);
    if (validImages.length === 0) return;

    const canvas = drawMoodboardCanvas(validImages);
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    
    const highestZ = Math.max(0, ...Object.values(useBoardStore.getState().blocks).map((b) => b.zIndex));
    const targetX = -viewport.x / viewport.zoom + window.innerWidth / 2 / viewport.zoom;
    const targetY = -viewport.y / viewport.zoom + window.innerHeight / 2 / viewport.zoom;
    const newBlockId = uuidv4();

    // Add loading block
    addBlock({
      id: newBlockId,
      type: 'image',
      x: targetX,
      y: targetY,
      width: 512,
      height: 512,
      zIndex: highestZ + 1,
      data: { url: '', alt: 'Generating...', loading: true }
    });

    try {
      // Convert data URL to Blob for FormData
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      
      const formData = new FormData();
      formData.append('image[]', blob, 'moodboard.png');
      formData.append(
        'prompt',
        `${userPrompt}

PLEASE REFERENCE THE ATTACHED MOODBOARD FOR THE AESTHETIC.
Generate a new standalone image, not a collage, grid, moodboard, or reproduction of the reference image. Use the moodboard only for visual direction: palette, materials, lighting, composition, texture, and overall style.`
      );
      formData.append('n', '1');
      formData.append('size', '1024x1024');
      formData.append('model', 'gpt-image-2');

      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      if (data.data && data.data[0]) {
        const imgData = data.data[0];
        const finalUrl = imgData.url || (imgData.b64_json ? `data:image/png;base64,${imgData.b64_json}` : null);
        if (finalUrl) {
          useBoardStore.getState().updateBlock(newBlockId, {
            data: { url: finalUrl, alt: userPrompt, loading: false }
          });
        } else {
          throw new Error("No image returned");
        }
      } else {
        throw new Error("No image returned");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(err);
      alert(`Failed to generate image: ${message}`);
      useBoardStore.getState().removeBlocks([newBlockId]);
    }
  };

  const hasSelection = menuState.hasSelection;
  const isFrameSelected = menuState.isFrameSelected;
  const totalItems = hasSelection ? (isFrameSelected ? 16 : 13) : 3;
  let itemIndex = 0;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            className="fixed top-0 left-0 z-[10000]"
            initial={{ x: menuState.x, y: menuState.y }}
            animate={{ x: menuState.x, y: menuState.y }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            style={{ pointerEvents: 'none' }}
          >
            <motion.div 
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={menuVariants}
              custom={totalItems}
              className="bg-white/95 backdrop-blur-md border border-zinc-200/80 shadow-none rounded-xl min-w-[180px] overflow-hidden"
              style={{ originX: 0, originY: 0, pointerEvents: 'auto' }}
            >
              <div className="py-1.5 flex flex-col">
              <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(undo)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                  <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { rotate: -45, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                    <RotateCcw className="w-4 h-4" />
                  </motion.div>
                  <span>Undo</span>
                </motion.div>
                <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘Z</motion.span>
              </motion.button>

              <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(redo)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                  <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { rotate: 45, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                    <RotateCw className="w-4 h-4" />
                  </motion.div>
                  <span>Redo</span>
                </motion.div>
                <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘⇧Z</motion.span>
              </motion.button>

              <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(() => paste())} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
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
                <motion.div custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} className="h-px bg-zinc-100 my-1 mx-2 shrink-0" />
              )}

              {hasSelection && (
                <>
                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(copy)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0, x: 0, y: 0 }} variants={{ hover: { scale: 1.15, x: 1, y: -1, transition: { type: "spring", bounce: 0.6 } } }}>
                        <Copy className="w-4 h-4" />
                      </motion.div>
                      <span>Copy</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘C</motion.span>
                  </motion.button>

                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(cut)} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0, x: 0, y: 0 }} variants={{ hover: { rotate: -25, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                        <Scissors className="w-4 h-4" />
                      </motion.div>
                      <span>Cut</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘X</motion.span>
                  </motion.button>

                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(() => duplicate(selection))} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0, x: 0, y: 0 }} variants={{ hover: { scale: 1.15, x: 2, y: -2, transition: { type: "spring", bounce: 0.6 } } }}>
                        <CopyPlus className="w-4 h-4" />
                      </motion.div>
                      <span>Duplicate</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘D</motion.span>
                  </motion.button>

                  <motion.div custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} className="h-px bg-zinc-100 my-1 mx-2 shrink-0" />

                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(() => selection.forEach(id => bringToFront(id)))} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { y: -2, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                        <ChevronsUp className="w-4 h-4" />
                      </motion.div>
                      <span>Bring to Front</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘⇧]</motion.span>
                  </motion.button>

                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(() => selection.forEach(id => bringForward(id)))} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { y: -1, scale: 1.1, transition: { type: "spring", bounce: 0.6 } } }}>
                        <ChevronUp className="w-4 h-4" />
                      </motion.div>
                      <span>Bring Forward</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘]</motion.span>
                  </motion.button>

                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(() => selection.forEach(id => sendBackward(id)))} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { y: 1, scale: 1.1, transition: { type: "spring", bounce: 0.6 } } }}>
                        <ChevronDown className="w-4 h-4" />
                      </motion.div>
                      <span>Send Backward</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘[</motion.span>
                  </motion.button>

                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(() => selection.forEach(id => sendToBack(id)))} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                    <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                    <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                      <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { y: 2, scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                        <ChevronsDown className="w-4 h-4" />
                      </motion.div>
                      <span>Send to Back</span>
                    </motion.div>
                    <motion.span style={{ x: 0, opacity: 1 }} variants={{ hover: { x: -4, opacity: 0.6, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }} className="text-xs text-zinc-400 font-mono ml-2 z-10">⌘⇧[</motion.span>
                  </motion.button>

                  {isFrameSelected && (
                    <>
                      <motion.div custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} className="h-px bg-zinc-100 my-1 mx-2 shrink-0" />
                      <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={handleExportMoodboard} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                        <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                        <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                          <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                            <ImageIcon className="w-4 h-4" />
                          </motion.div>
                          <span>Make Moodboard</span>
                        </motion.div>
                      </motion.button>
                      <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => { setVisible(false); setShowGenerateModal(true); }} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-zinc-700 cursor-default">
                        <motion.div className="absolute inset-0 rounded-lg mx-1 -z-10 bg-zinc-100" style={{ opacity: 0, scale: 0.95 }} variants={{ hover: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }, tap: { scale: 0.95, opacity: 1 } }} />
                        <motion.div className="flex items-center gap-2.5 z-10" style={{ x: 0 }} variants={{ hover: { x: 4, transition: { type: "spring", bounce: 0.4, duration: 0.4 } } }}>
                          <motion.div style={{ scale: 1, rotate: 0 }} variants={{ hover: { scale: 1.15, transition: { type: "spring", bounce: 0.6 } } }}>
                            <Sparkles className="w-4 h-4" />
                          </motion.div>
                          <span>Generate Image</span>
                        </motion.div>
                      </motion.button>
                    </>
                  )}

                  <motion.div custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} className="h-px bg-zinc-100 my-1 mx-2 shrink-0" />

                  <motion.button custom={{ i: itemIndex++, total: totalItems }} variants={itemVariants} type="button" onClick={() => handleAction(() => { if (selection.length > 0) removeBlocks(selection); if (drawingSelection.length > 0) removeDrawings(drawingSelection); })} whileHover="hover" whileTap="tap" className="relative w-full flex items-center justify-between px-3 py-1.5 text-sm outline-none group z-10 text-red-600 cursor-default">
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
      
      <AnimatePresence>
        {showGenerateModal && (
          <motion.div
            className="fixed inset-0 z-[10001] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGenerateModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2 text-zinc-900">
                  <Sparkles className="w-5 h-5 text-blue-500" />
                  <h2 className="text-lg font-semibold tracking-tight">Generate Image</h2>
                </div>
                <button 
                  onClick={() => setShowGenerateModal(false)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-6 flex flex-col gap-5 bg-zinc-50/50">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-zinc-700">Image Prompt</label>
                  <textarea
                    value={genPrompt}
                    onChange={(e) => setGenPrompt(e.target.value)}
                    placeholder="Describe the image you want to generate..."
                    className="w-full min-h-[100px] p-3 text-sm border border-zinc-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all resize-none bg-white placeholder:text-zinc-400"
                    autoFocus
                  />
                </div>
                
                {!import.meta.env.VITE_OPENAI_API_KEY && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-zinc-700 flex justify-between">
                      OpenAI API Key
                      <span className="text-xs text-zinc-400 font-normal">Saved locally</span>
                    </label>
                    <input
                      type="password"
                      value={genApiKey}
                      onChange={(e) => setGenApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full p-3 text-sm border border-zinc-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all bg-white font-mono placeholder:font-sans placeholder:text-zinc-400"
                    />
                  </div>
                )}
              </div>
              
              <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-end gap-3 bg-white">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeGenerateImage}
                  disabled={!genPrompt.trim() || (!import.meta.env.VITE_OPENAI_API_KEY && !genApiKey.trim())}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg transition-colors shadow-sm shadow-blue-600/20"
                >
                  Generate
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

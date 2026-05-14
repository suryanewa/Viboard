import { create } from 'zustand';
import type { Block, Viewport, DrawingPath } from './types';
import { v4 as uuidv4 } from 'uuid';
import { indexBlock, removeBlockFromIndex, syncAllBlocks } from './lib/typesense';

type HistoryEntry = { blocks: Record<string, Block>; drawings: DrawingPath[] };

const createDefaultBrutalistImageBlocks = (): Record<string, Block> => {
  const blocks: Record<string, Block> = {};
  const imageWidth = 240;
  const imageHeight = 180;
  const positions = [
    { x: 60, y: 360 },
    { x: 360, y: 410 },
    { x: 690, y: 340 },
    { x: 1020, y: 430 },
    { x: 1330, y: 365 },
    { x: 190, y: 660 },
    { x: 520, y: 740 },
    { x: 860, y: 620 },
    { x: 1180, y: 730 },
    { x: 1530, y: 640 },
    { x: 380, y: 990 },
    { x: 980, y: 930 },
  ];

  for (let i = 0; i < 12; i += 1) {
    const id = `${i + 3}`;
    const position = positions[i];
    blocks[id] = {
      id,
      type: 'image',
      x: position.x,
      y: position.y,
      width: imageWidth,
      height: imageHeight,
      zIndex: i + 3,
      data: {
        url: `https://loremflickr.com/960/720/brutalist,architecture?lock=${i + 1}`,
        alt: `Brutalist architecture reference ${i + 1}`
      }
    };
  }

  return blocks;
};

const createMockBlocks = (): Record<string, Block> => {
  return {
    '1': {
      id: '1',
      type: 'sticky',
      x: 100,
      y: 100,
      width: 240,
      height: 240,
      zIndex: 1,
      data: { text: 'Welcome to Viboard. Drag me around!', color: 'yellow' }
    },
    '2': {
      id: '2',
      type: 'sticky',
      x: 380,
      y: 100,
      width: 320,
      height: 240,
      zIndex: 2,
      data: { text: 'Add stickies, text, drawings, shapes, and uploads using the toolbar on the bottom.', color: 'yellow' }
    },
    ...createDefaultBrutalistImageBlocks(),
    '15': {
      id: '15',
      type: 'frame',
      x: 0,
      y: 40,
      width: 1830,
      height: 1190,
      zIndex: 0,
      data: { title: 'Brutalist Architecture' }
    }
  };
};

interface BoardState {
  blocks: Record<string, Block>;
  selection: string[];
  viewport: Viewport;
  snapping: boolean;
  lastSnapTime: number;
  gridView: 'box' | 'dot' | 'none';
  canvasTitle: string;
  mode: 'view' | 'edit';
  isSearchOpen: boolean;
  isPlusMenuOpen: boolean;
  mousePos: { x: number, y: number };
  clipboard: Block[];
  tool: 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky' | 'link' | 'frame';
  animationState: 'idle' | 'animating-out' | 'hopping' | 'animating-in';
  markerType: 'marker' | 'highlighter' | 'eraser';
  markerColor: string;
  markerThickness: number;
  stickyHue: number;
  textFontSize: number;
  textHue: number;
  shapeType: 'circle' | 'square' | 'triangle';
  shapeHue: number;
  activeShape: { type: string, x1: number, y1: number, x2: number, y2: number } | null;
  isDraggingGroup: boolean;
  isDuplicatingGroup: boolean;
  currentPath: DrawingPath | null;
  drawings: DrawingPath[];
  drawingSelection: string[];
  snapLines: { x?: number, y?: number }[];
  history: {
    past: HistoryEntry[];
    future: HistoryEntry[];
  };
  historyAnimationKey: number;
  
  pushHistory: () => void;
  commitBlockEdit: (beforeBlock: Block) => void;
  addBlock: (block: Block) => void;
  updateBlock: (id: string, updates: Partial<Block>, noHistory?: boolean) => void;
  updateBlocks: (updates: { id: string; updates: Partial<Block> }[], noHistory?: boolean) => void;
  removeBlocks: (ids: string[]) => void;
  setSelection: (ids: string[]) => void;
  setDrawingSelection: (ids: string[]) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  setSnapping: (snapping: boolean) => void;
  setGridView: (gridView: 'box' | 'dot' | 'none') => void;
  setCanvasTitle: (title: string) => void;
  setMode: (mode: 'view' | 'edit') => void;
  setIsSearchOpen: (isOpen: boolean) => void;
  setIsPlusMenuOpen: (isOpen: boolean) => void;
  setMousePos: (x: number, y: number) => void;
  setTool: (tool: 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky' | 'link' | 'frame') => void;
  setAnimationState: (state: 'idle' | 'animating-out' | 'hopping' | 'animating-in') => void;
  setMarkerType: (type: 'marker' | 'highlighter' | 'eraser') => void;
  setMarkerColor: (color: string) => void;
  setMarkerThickness: (thickness: number) => void;
  setStickyHue: (hue: number) => void;
  setTextFontSize: (size: number) => void;
  setTextHue: (hue: number) => void;
  setShapeType: (type: 'circle' | 'square' | 'triangle') => void;
  setShapeHue: (hue: number) => void;
  setSnapLines: (snapLines: { x?: number, y?: number }[]) => void;
  setIsDraggingGroup: (isDragging: boolean) => void;
  setIsDuplicatingGroup: (isDuplicating: boolean) => void;
  setActiveShape: (shape: { type: string, x1: number, y1: number, x2: number, y2: number } | null) => void;
  setCurrentPath: (path: DrawingPath | null) => void;
  addDrawing: (path: DrawingPath) => void;
  removeDrawings: (ids: string[], noHistory?: boolean) => void;
  updateDrawings: (updates: { id: string; deltaX: number; deltaY: number }[], noHistory?: boolean) => void;
  bringToFront: (id: string, noHistory?: boolean) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  sendToBack: (id: string) => void;
  
  copy: () => void;
  cut: () => void;
  paste: (x?: number, y?: number) => void;
  duplicate: (ids: string[], noOffset?: boolean) => void;
  undo: () => void;
  redo: () => void;
  syncBlocksToTypeSense: () => void;
  clearBoard: () => void;
}

const MAX_HISTORY = 25;
let historyAnimationSequence = 0;

const cloneHistoryEntry = (entry: HistoryEntry): HistoryEntry => ({
  blocks: Object.fromEntries(
    Object.entries(structuredClone(entry.blocks)).map(([id, block]) => {
      if (!block.data?.autoFocus) return [id, block];
      const data = { ...block.data };
      delete data.autoFocus;
      return [id, { ...block, data }];
    })
  ),
  drawings: structuredClone(entry.drawings),
});

const currentHistoryEntry = (state: Pick<BoardState, 'blocks' | 'drawings'>): HistoryEntry =>
  cloneHistoryEntry({ blocks: state.blocks, drawings: state.drawings });

const recordsEqual = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

const pushHistoryEntry = (history: BoardState['history'], entry: HistoryEntry) => ({
  past: [...history.past.slice(-MAX_HISTORY + 1), cloneHistoryEntry(entry)],
  future: [],
});

const reindexSearch = (blocks: Record<string, Block>) => {
  syncAllBlocks(blocks);
};

const nextHistoryAnimationKey = () => {
  historyAnimationSequence += 1;
  return historyAnimationSequence;
};

export const useBoardStore = create<BoardState>((set, get) => ({
  blocks: createMockBlocks(),
  selection: [],
  viewport: { x: 300, y: 200, zoom: 0.5 },
  snapping: false,
  lastSnapTime: 0,
  gridView: 'none' as 'box' | 'dot' | 'none',
  canvasTitle: 'Untitled Board',
  mode: 'edit' as 'view' | 'edit',
  isSearchOpen: false,
  isPlusMenuOpen: false,
  mousePos: { x: 0, y: 0 },
  clipboard: [],
  tool: 'select',
  animationState: 'idle' as 'idle' | 'animating-out' | 'hopping' | 'animating-in',
  pendingTool: null as 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky' | 'frame' | null,
  markerType: 'marker',
  markerColor: 'hsl(45, 90%, 65%)',
  markerThickness: 4,
  stickyHue: 55,
  textFontSize: 20,
  textHue: 240,
  shapeType: 'square',
  shapeHue: 0,
  activeShape: null,
  isDraggingGroup: false,
  isDuplicatingGroup: false,
  currentPath: null,
  drawings: [],
  drawingSelection: [],
  snapLines: [],
  history: {
    past: [],
    future: [],
  },
  historyAnimationKey: 0,

  pushHistory: () => {
    const { history } = get();
    set({
      history: pushHistoryEntry(history, currentHistoryEntry(get()))
    });
  },

  commitBlockEdit: (beforeBlock) => {
    const { blocks, drawings, history } = get();
    const currentBlock = blocks[beforeBlock.id];
    if (!currentBlock || recordsEqual(currentBlock, beforeBlock)) return;
    set({
      history: pushHistoryEntry(history, {
        blocks: { ...blocks, [beforeBlock.id]: beforeBlock },
        drawings,
      }),
    });
    if (currentBlock.type === 'sticky' || currentBlock.type === 'text' || currentBlock.type === 'link') {
      indexBlock(currentBlock);
    }
  },

  addBlock: (block) => {
    const { blocks, history } = get();
    set({
      blocks: { ...blocks, [block.id]: block },
      history: pushHistoryEntry(history, currentHistoryEntry(get()))
    });
    if (block.type === 'sticky' || block.type === 'text' || block.type === 'link') {
      indexBlock(block);
    }
  },

  updateBlock: (id, updates, noHistory = false) => {
    const { blocks, history } = get();
    const block = blocks[id];
    if (!block) return;
    
    const updatedBlock = { ...block, ...updates };
    if (recordsEqual(block, updatedBlock)) return;
    if (
      (updates.data?.text !== undefined || updates.data?.url !== undefined ||
       updates.data?.title !== undefined || updates.data?.description !== undefined) &&
      (block.type === 'sticky' || block.type === 'text' || block.type === 'link')
    ) {
      indexBlock(updatedBlock);
    }
    
    set({
      blocks: {
        ...blocks,
        [id]: updatedBlock
      },
      history: noHistory ? history : pushHistoryEntry(history, currentHistoryEntry(get()))
    });
  },

  updateBlocks: (updates, noHistory = false) => {
    const { blocks, history } = get();
    const newBlocks = { ...blocks };
    let hasChanges = false;
    
    updates.forEach(({ id, updates }) => {
      if (newBlocks[id]) {
        const updatedBlock = { ...newBlocks[id], ...updates };
        if (!recordsEqual(newBlocks[id], updatedBlock)) {
          newBlocks[id] = updatedBlock;
          hasChanges = true;
        }
      }
    });
    
    if (hasChanges) {
      set({
        blocks: newBlocks,
        history: noHistory ? history : pushHistoryEntry(history, currentHistoryEntry(get()))
      });
    }
  },

  removeBlocks: (ids) => {
    const { blocks, history, selection } = get();
    const newBlocks = { ...blocks };
    ids.forEach((id) => {
      delete newBlocks[id];
      removeBlockFromIndex(id);
    });
    
    set({
      blocks: newBlocks,
      selection: selection.filter((id) => !ids.includes(id)),
      history: pushHistoryEntry(history, currentHistoryEntry(get()))
    });
  },

  setSelection: (ids) => set({ selection: ids }),
  setDrawingSelection: (ids) => set({ drawingSelection: ids }),

  setViewport: (viewportUpdates) => set((state) => ({
    viewport: { ...state.viewport, ...viewportUpdates }
  })),

  setSnapping: (snapping) => set((state) => {
    if (snapping) {
      const GRID_SIZE = 24;
      const newBlocks = { ...state.blocks };
      Object.keys(newBlocks).forEach(id => {
        newBlocks[id] = {
          ...newBlocks[id],
          x: Math.round(newBlocks[id].x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(newBlocks[id].y / GRID_SIZE) * GRID_SIZE,
        };
      });
      return { snapping, blocks: newBlocks, lastSnapTime: Date.now() };
    }
    return { snapping };
  }),

  setGridView: (gridView) => set({ gridView }),

  setCanvasTitle: (title) => set({ canvasTitle: title }),
  setMode: (mode) => set({ mode }),
  setIsSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
  setIsPlusMenuOpen: (isPlusMenuOpen) => set({ isPlusMenuOpen }),
  setMousePos: (x, y) => set({ mousePos: { x, y } }),

  setTool: (tool) => set({ tool }),
  setAnimationState: (animationState) => set({ animationState }),
  setMarkerType: (markerType) => set({ markerType }),
  setMarkerColor: (markerColor) => set({ markerColor }),
  setMarkerThickness: (markerThickness) => set({ markerThickness }),
  setStickyHue: (stickyHue) => set({ stickyHue }),
  setTextFontSize: (textFontSize) => set({ textFontSize }),
  setTextHue: (textHue) => set({ textHue }),
  setShapeType: (shapeType) => set({ shapeType }),
  setShapeHue: (shapeHue) => set({ shapeHue }),
  setSnapLines: (snapLines) => set({ snapLines }),
  setIsDraggingGroup: (isDraggingGroup) => set({ isDraggingGroup }),
  setIsDuplicatingGroup: (isDuplicatingGroup) => set({ isDuplicatingGroup }),
  setActiveShape: (activeShape) => set({ activeShape }),
  setCurrentPath: (currentPath) => set({ currentPath }),
  
  addDrawing: (path) => {
    const { drawings, history } = get();
    set({
      drawings: [...drawings, path],
      history: pushHistoryEntry(history, currentHistoryEntry(get()))
    });
  },

  removeDrawings: (ids, noHistory = false) => {
    const { drawings, history, drawingSelection } = get();
    const newDrawings = drawings.filter(d => !ids.includes(d.id));
    if (newDrawings.length === drawings.length) return;
    
    set({
      drawings: newDrawings,
      drawingSelection: drawingSelection.filter(id => !ids.includes(id)),
      history: noHistory ? history : pushHistoryEntry(history, currentHistoryEntry(get()))
    });
  },

  updateDrawings: (updates, noHistory = false) => {
    const { drawings, history } = get();
    const newDrawings = [...drawings];
    let hasChanges = false;

    updates.forEach(({ id, deltaX, deltaY }) => {
      const idx = newDrawings.findIndex(d => d.id === id);
      if (idx !== -1) {
        newDrawings[idx] = {
          ...newDrawings[idx],
          points: newDrawings[idx].points.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY
          }))
        };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      set({
        drawings: newDrawings,
        history: noHistory ? history : pushHistoryEntry(history, currentHistoryEntry(get()))
      });
    }
  },

  bringToFront: (id, noHistory = false) => set((state) => {
    const block = state.blocks[id];
    if (!block) return state;
    
    const highestZ = Math.max(0, ...Object.values(state.blocks).map((b) => b.zIndex));
    
    if (block.zIndex === highestZ) return state;
    
    return {
      blocks: {
        ...state.blocks,
        [id]: { ...block, zIndex: highestZ + 1 }
      },
      history: noHistory ? state.history : pushHistoryEntry(state.history, currentHistoryEntry(state)),
    };
  }),

  bringForward: (id) => set((state) => {
    const block = state.blocks[id];
    if (!block) return state;
    
    const otherBlocks = Object.values(state.blocks).filter(b => b.id !== id);
    const higherBlocks = otherBlocks.filter(b => b.zIndex > block.zIndex);
    
    if (higherBlocks.length === 0) return state;
    
    const nextBlock = higherBlocks.reduce((prev, curr) => 
      curr.zIndex < prev.zIndex ? curr : prev
    );
    
    const newBlocks = { ...state.blocks };
    const tempZ = block.zIndex;
    newBlocks[id] = { ...block, zIndex: nextBlock.zIndex };
    newBlocks[nextBlock.id] = { ...newBlocks[nextBlock.id], zIndex: tempZ };
    
    return {
      blocks: newBlocks,
      history: pushHistoryEntry(state.history, currentHistoryEntry(state)),
    };
  }),

  sendBackward: (id) => set((state) => {
    const block = state.blocks[id];
    if (!block) return state;
    
    const otherBlocks = Object.values(state.blocks).filter(b => b.id !== id);
    const lowerBlocks = otherBlocks.filter(b => b.zIndex < block.zIndex);
    
    if (lowerBlocks.length === 0) return state;
    
    const prevBlock = lowerBlocks.reduce((prev, curr) => 
      curr.zIndex > prev.zIndex ? curr : prev
    );
    
    const newBlocks = { ...state.blocks };
    const tempZ = block.zIndex;
    newBlocks[id] = { ...block, zIndex: prevBlock.zIndex };
    newBlocks[prevBlock.id] = { ...newBlocks[prevBlock.id], zIndex: tempZ };
    
    return {
      blocks: newBlocks,
      history: pushHistoryEntry(state.history, currentHistoryEntry(state)),
    };
  }),

  sendToBack: (id) => set((state) => {
    const block = state.blocks[id];
    if (!block) return state;
    
    const lowestZ = Math.min(...Object.values(state.blocks).map((b) => b.zIndex));
    
    if (block.zIndex === lowestZ) return state;
    
    const newBlocks = { ...state.blocks };
    Object.keys(newBlocks).forEach(blockId => {
      newBlocks[blockId] = {
        ...newBlocks[blockId],
        zIndex: newBlocks[blockId].zIndex + 1
      };
    });
    newBlocks[id] = { ...block, zIndex: 0 };
    
    return {
      blocks: newBlocks,
      history: pushHistoryEntry(state.history, currentHistoryEntry(state)),
    };
  }),

  copy: () => {
    const { blocks, selection } = get();
    const selectedBlocks = selection.map(id => blocks[id]).filter(Boolean);
    if (selectedBlocks.length > 0) {
      set({ clipboard: JSON.parse(JSON.stringify(selectedBlocks)) });
    }
  },

  cut: () => {
    const { blocks, selection, history } = get();
    const selectedBlocks = selection.map(id => blocks[id]).filter(Boolean);
    if (selectedBlocks.length > 0) {
      const newBlocks = { ...blocks };
      selection.forEach(id => {
        delete newBlocks[id];
      });
      set({ 
        clipboard: JSON.parse(JSON.stringify(selectedBlocks)),
        blocks: newBlocks,
        selection: [],
        history: pushHistoryEntry(history, currentHistoryEntry(get()))
      });
    }
  },

  paste: (targetX, targetY) => {
    const { clipboard, blocks, history, mousePos } = get();
    if (clipboard.length === 0) return;

    const newBlocks = { ...blocks };
    const newSelection: string[] = [];
    
    let minX = Infinity, minY = Infinity;
    clipboard.forEach(b => {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
    });

    let offX: number;
    let offY: number;
    
    if (targetX !== undefined && targetY !== undefined) {
      offX = targetX - minX;
      offY = targetY - minY;
    } else if (mousePos.x !== 0 || mousePos.y !== 0) {
      offX = mousePos.x - minX;
      offY = mousePos.y - minY;
    } else {
      offX = 40;
      offY = 40;
    }

    const highestZ = Math.max(0, ...Object.values(blocks).map((b) => b.zIndex));

    clipboard.forEach((b, i) => {
      const newId = uuidv4();
      newBlocks[newId] = {
        ...b,
        id: newId,
        x: b.x + offX,
        y: b.y + offY,
        zIndex: highestZ + 1 + i,
        data: { ...b.data, deferSelectionOverlay: true },
      };
      newSelection.push(newId);
    });

    set({
      blocks: newBlocks,
      selection: newSelection,
      history: pushHistoryEntry(history, currentHistoryEntry(get()))
    });
  },

  duplicate: (ids, noOffset = false) => {
    const { blocks, history } = get();
    const newBlocks = { ...blocks };
    const newSelection: string[] = [];
    
    const highestZ = Math.max(0, ...Object.values(blocks).map((b) => b.zIndex));

    ids.forEach((id, i) => {
      const b = blocks[id];
      if (!b) return;
      const newId = uuidv4();
      
      newBlocks[newId] = {
        ...b,
        id: newId,
        x: b.x + (noOffset ? 0 : 20),
        y: b.y + (noOffset ? 0 : 20),
        zIndex: highestZ + 1 + i,
        data: { ...b.data, deferSelectionOverlay: true },
      };
      newSelection.push(newId);
    });

    set({
      blocks: newBlocks,
      selection: newSelection,
      history: pushHistoryEntry(history, currentHistoryEntry(get()))
    });
  },

  undo: () => {
    const { history, blocks, drawings, selection, drawingSelection } = get();
    if (history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);
    const restored = cloneHistoryEntry(previous);
    reindexSearch(restored.blocks);

    set({
      blocks: restored.blocks,
      drawings: restored.drawings,
      selection: selection.filter((id) => restored.blocks[id]),
      drawingSelection: drawingSelection.filter((id) => restored.drawings.some((drawing) => drawing.id === id)),
      historyAnimationKey: nextHistoryAnimationKey(),
      history: {
        past: newPast,
        future: [currentHistoryEntry({ blocks, drawings }), ...history.future.slice(0, MAX_HISTORY - 1)],
      }
    });
  },

  redo: () => {
    const { history, blocks, drawings, selection, drawingSelection } = get();
    if (history.future.length === 0) return;

    const next = history.future[0];
    const newFuture = history.future.slice(1);
    const restored = cloneHistoryEntry(next);
    reindexSearch(restored.blocks);

    set({
      blocks: restored.blocks,
      drawings: restored.drawings,
      selection: selection.filter((id) => restored.blocks[id]),
      drawingSelection: drawingSelection.filter((id) => restored.drawings.some((drawing) => drawing.id === id)),
      historyAnimationKey: nextHistoryAnimationKey(),
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), currentHistoryEntry({ blocks, drawings })],
        future: newFuture,
      }
    });
  },

  syncBlocksToTypeSense: () => {
    const { blocks } = get();
    syncAllBlocks(blocks);
  },

  clearBoard: () => {
    set({
      blocks: {},
      drawings: [],
      selection: [],
      drawingSelection: [],
      canvasTitle: 'Untitled Board',
      history: { past: [], future: [] },
      viewport: { x: 0, y: 0, zoom: 1 }
    });
  }
}));

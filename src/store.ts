import { create } from 'zustand';
import type { Block, Viewport, DrawingPath } from './types';
import { v4 as uuidv4 } from 'uuid';

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
      type: 'shape',
      x: 400,
      y: 200,
      width: 120,
      height: 120,
      zIndex: 2,
      data: { shape: 'circle', color: '#ff6b6b' }
    },
    '3': {
      id: '3',
      type: 'link',
      x: 150,
      y: 400,
      width: 480,
      height: 240,
      zIndex: 3,
      data: { url: 'https://linear.app', title: 'Linear', description: 'A better way to build products' }
    }
  };
};

interface BoardState {
  blocks: Record<string, Block>;
  selection: string[];
  viewport: Viewport;
  snapping: boolean;
  gridView: 'box' | 'dot' | 'none';
  canvasTitle: string;
  mousePos: { x: number, y: number };
  clipboard: Block[];
  tool: 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky';
  markerType: 'marker' | 'highlighter' | 'eraser';
  markerColor: string;
  markerThickness: number;
  activeShape: { type: string, x1: number, y1: number, x2: number, y2: number } | null;
  isDraggingGroup: boolean;
  currentPath: DrawingPath | null;
  drawings: DrawingPath[];
  drawingSelection: string[];
  history: {
    past: { blocks: Record<string, Block>; drawings: DrawingPath[] }[];
    future: { blocks: Record<string, Block>; drawings: DrawingPath[] }[];
  };
  
  addBlock: (block: Block) => void;
  updateBlock: (id: string, updates: Partial<Block>) => void;
  updateBlocks: (updates: { id: string; updates: Partial<Block> }[]) => void;
  removeBlocks: (ids: string[]) => void;
  setSelection: (ids: string[]) => void;
  setDrawingSelection: (ids: string[]) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  setSnapping: (snapping: boolean) => void;
  setGridView: (gridView: 'box' | 'dot' | 'none') => void;
  setCanvasTitle: (title: string) => void;
  setMousePos: (x: number, y: number) => void;
  setTool: (tool: 'select' | 'marker' | 'shape' | 'text' | 'pan' | 'sticky') => void;
  setMarkerType: (type: 'marker' | 'highlighter' | 'eraser') => void;
  setMarkerColor: (color: string) => void;
  setMarkerThickness: (thickness: number) => void;
  setIsDraggingGroup: (isDragging: boolean) => void;
  setActiveShape: (shape: { type: string, x1: number, y1: number, x2: number, y2: number } | null) => void;
  setCurrentPath: (path: DrawingPath | null) => void;
  addDrawing: (path: DrawingPath) => void;
  removeDrawings: (ids: string[]) => void;
  updateDrawings: (updates: { id: string; deltaX: number; deltaY: number }[]) => void;
  bringToFront: (id: string) => void;
  
  copy: () => void;
  cut: () => void;
  paste: (x?: number, y?: number) => void;
  duplicate: (ids: string[], noOffset?: boolean) => void;
  undo: () => void;
  redo: () => void;
}

const MAX_HISTORY = 50;

export const useBoardStore = create<BoardState>((set, get) => ({
  blocks: createMockBlocks(),
  selection: [],
  viewport: { x: 300, y: 200, zoom: 0.5 },
  snapping: false,
  gridView: 'none' as 'box' | 'dot' | 'none',
  canvasTitle: 'Untitled Board',
  mousePos: { x: 0, y: 0 },
  clipboard: [],
  tool: 'select',
  markerType: 'marker',
  markerColor: 'hsl(45, 90%, 65%)',
  markerThickness: 4,
  activeShape: null,
  isDraggingGroup: false,
  currentPath: null,
  drawings: [],
  drawingSelection: [],
  history: {
    past: [],
    future: [],
  },

  addBlock: (block) => {
    const { blocks, drawings, history } = get();
    set({
      blocks: { ...blocks, [block.id]: block },
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
        future: [],
      }
    });
  },

  updateBlock: (id, updates) => {
    const { blocks, drawings, history } = get();
    const block = blocks[id];
    if (!block) return;
    set({
      blocks: {
        ...blocks,
        [id]: { ...block, ...updates }
      },
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
        future: [],
      }
    });
  },

  updateBlocks: (updates) => {
    const { blocks, drawings, history } = get();
    const newBlocks = { ...blocks };
    let hasChanges = false;
    
    updates.forEach(({ id, updates }) => {
      if (newBlocks[id]) {
        newBlocks[id] = { ...newBlocks[id], ...updates };
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      set({
        blocks: newBlocks,
        history: {
          past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
          future: [],
        }
      });
    }
  },

  removeBlocks: (ids) => {
    const { blocks, drawings, history, selection } = get();
    const newBlocks = { ...blocks };
    ids.forEach((id) => {
      delete newBlocks[id];
    });
    
    set({
      blocks: newBlocks,
      selection: selection.filter((id) => !ids.includes(id)),
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
        future: [],
      }
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
      return { snapping, blocks: newBlocks };
    }
    return { snapping };
  }),

  setGridView: (gridView) => set({ gridView }),

  setCanvasTitle: (title) => set({ canvasTitle: title }),

  setMousePos: (x, y) => set({ mousePos: { x, y } }),
  setTool: (tool) => set({ tool }),
  setMarkerType: (markerType) => set({ markerType }),
  setMarkerColor: (markerColor) => set({ markerColor }),
  setMarkerThickness: (markerThickness) => set({ markerThickness }),
  setIsDraggingGroup: (isDraggingGroup) => set({ isDraggingGroup }),
  setActiveShape: (activeShape) => set({ activeShape }),
  setCurrentPath: (currentPath) => set({ currentPath }),
  
  addDrawing: (path) => {
    const { blocks, drawings, history } = get();
    set({
      drawings: [...drawings, path],
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
        future: [],
      }
    });
  },

  removeDrawings: (ids) => {
    const { blocks, drawings, history, drawingSelection } = get();
    const newDrawings = drawings.filter(d => !ids.includes(d.id));
    
    set({
      drawings: newDrawings,
      drawingSelection: drawingSelection.filter(id => !ids.includes(id)),
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
        future: [],
      }
    });
  },

  updateDrawings: (updates) => {
    const { blocks, drawings, history } = get();
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
        history: {
          past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
          future: [],
        }
      });
    }
  },

  bringToFront: (id) => set((state) => {
    const block = state.blocks[id];
    if (!block) return state;
    
    const highestZ = Math.max(0, ...Object.values(state.blocks).map((b) => b.zIndex));
    
    if (block.zIndex === highestZ) return state;
    
    return {
      blocks: {
        ...state.blocks,
        [id]: { ...block, zIndex: highestZ + 1 }
      }
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
    const { blocks, drawings, selection, history } = get();
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
        history: {
          past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
          future: [],
        }
      });
    }
  },

  paste: (targetX, targetY) => {
    const { clipboard, blocks, drawings, history, mousePos } = get();
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
      };
      newSelection.push(newId);
    });

    set({
      blocks: newBlocks,
      selection: newSelection,
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
        future: [],
      }
    });
  },

  duplicate: (ids, noOffset = false) => {
    const { blocks, drawings, history } = get();
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
      };
      newSelection.push(newId);
    });

    set({
      blocks: newBlocks,
      selection: newSelection,
      history: {
        past: [...history.past.slice(-MAX_HISTORY + 1), { blocks, drawings }],
        future: [],
      }
    });
  },

  undo: () => {
    const { history, blocks, drawings } = get();
    if (history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);

    set({
      blocks: previous.blocks,
      drawings: previous.drawings,
      history: {
        past: newPast,
        future: [{ blocks, drawings }, ...history.future],
      }
    });
  },

  redo: () => {
    const { history, blocks, drawings } = get();
    if (history.future.length === 0) return;

    const next = history.future[0];
    const newFuture = history.future.slice(1);

    set({
      blocks: next.blocks,
      drawings: next.drawings,
      history: {
        past: [...history.past, { blocks, drawings }],
        future: newFuture,
      }
    });
  },
}));

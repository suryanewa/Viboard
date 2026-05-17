export type BlockType = 'sticky' | 'text' | 'image' | 'link' | 'shape' | 'drawing' | 'audio' | 'instagram' | 'x' | 'youtube' | 'video' | 'substack' | 'medium' | 'figma' | 'arena' | 'github' | 'wikipedia' | 'codepen' | 'reddit' | 'tiktok' | 'pdf' | 'frame';

// Block data is intentionally open-ended because each block type owns its own payload shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockData = Record<string, any>;

export interface Block {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  data: BlockData;
}

export interface DrawingPath {
  id: string;
  points: { x: number, y: number }[];
  color: string;
  strokeWidth: number;
  toolType?: 'marker' | 'highlighter' | 'eraser';
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

declare global {
  interface Window {
    __handleAddBlock?: (type: BlockType, dataOverride?: BlockData) => void;
  }
}

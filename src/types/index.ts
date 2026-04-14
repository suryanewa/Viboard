export type BlockType = 'sticky' | 'text' | 'image' | 'link' | 'shape' | 'drawing';

export interface Block {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  data: Record<string, any>;
}

export interface DrawingPath {
  id: string;
  points: { x: number, y: number }[];
  color: string;
  strokeWidth: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

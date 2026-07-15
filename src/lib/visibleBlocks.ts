import type { Block, Viewport } from '../types';

const getWorldOverscan = (zoom: number) => {
  const screenOverscanPx = zoom < 0.2 ? 96 : 192;
  return Math.min(2000, Math.max(240, screenOverscanPx / zoom));
};

const intersectsViewport = (
  block: Block,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
) => (
  block.x < bounds.maxX &&
  block.x + block.width > bounds.minX &&
  block.y < bounds.maxY &&
  block.y + block.height > bounds.minY
);

export const getVisibleBlocks = (
  blocks: Record<string, Block>,
  viewport: Viewport,
  selectedIds: string[] = [],
) => {
  if (typeof window === 'undefined') return Object.values(blocks);

  const zoom = Math.max(viewport.zoom, 0.01);
  const selected = new Set(selectedIds);
  const overscan = getWorldOverscan(zoom);
  const bounds = {
    minX: -viewport.x / zoom - overscan,
    minY: -viewport.y / zoom - overscan,
    maxX: (-viewport.x + window.innerWidth) / zoom + overscan,
    maxY: (-viewport.y + window.innerHeight) / zoom + overscan,
  };

  return Object.values(blocks).filter((block) => (
    selected.has(block.id) || intersectsViewport(block, bounds)
  ));
};

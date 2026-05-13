import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../store';
import type { Block, DrawingPath, Viewport } from '../types';

type BoardSnapshot = {
  version: 1;
  title: string;
  blocks: Record<string, Block>;
  drawings: DrawingPath[];
  viewport: Viewport;
};

type ExportFormat = 'png' | 'jpg' | 'pdf';
type TextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'link'
  | 'bulletedList'
  | 'numberedList'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight';

const BOARD_FILE_EXTENSION = 'viboard.json';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const getSnapshot = (): BoardSnapshot => {
  const { canvasTitle, blocks, drawings, viewport } = useBoardStore.getState();
  return {
    version: 1,
    title: canvasTitle,
    blocks,
    drawings,
    viewport,
  };
};

const safeFilename = (name: string, extension: string) => {
  const normalized = name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${normalized || 'Untitled-Board'}.${extension}`;
};

const saveRecentSnapshot = (snapshot: BoardSnapshot) => {
  const recent = JSON.parse(localStorage.getItem('viboard:recent') || '[]') as BoardSnapshot[];
  const next = [snapshot, ...recent.filter((item) => item.title !== snapshot.title)].slice(0, 5);
  localStorage.setItem('viboard:recent', JSON.stringify(next));
};

export const newBoard = () => {
  useBoardStore.setState({
    blocks: {},
    drawings: [],
    selection: [],
    drawingSelection: [],
    canvasTitle: 'Untitled Board',
    viewport: { x: 300, y: 200, zoom: 0.5 },
    history: { past: [], future: [] },
  });
};

export const saveBoard = () => {
  const snapshot = getSnapshot();
  localStorage.setItem('viboard:autosave', JSON.stringify(snapshot));
  saveRecentSnapshot(snapshot);
};

export const saveLocalCopy = () => {
  const snapshot = getSnapshot();
  saveRecentSnapshot(snapshot);
  downloadBlob(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
    safeFilename(snapshot.title, BOARD_FILE_EXTENSION)
  );
};

export const openRecentBoard = () => {
  const recent = JSON.parse(localStorage.getItem('viboard:recent') || '[]') as BoardSnapshot[];
  const latest = recent[0] || JSON.parse(localStorage.getItem('viboard:autosave') || 'null') as BoardSnapshot | null;
  if (latest) loadBoardSnapshot(latest);
};

export const openBoardFile = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadBoardSnapshot(JSON.parse(text) as BoardSnapshot);
  };
  input.click();
};

const loadBoardSnapshot = (snapshot: BoardSnapshot) => {
  useBoardStore.setState({
    blocks: snapshot.blocks || {},
    drawings: snapshot.drawings || [],
    selection: [],
    drawingSelection: [],
    canvasTitle: snapshot.title || 'Untitled Board',
    viewport: snapshot.viewport || { x: 300, y: 200, zoom: 0.5 },
    history: { past: [], future: [] },
  });
  saveRecentSnapshot(snapshot);
};

const getSelectedBlocks = () => {
  const { blocks, selection } = useBoardStore.getState();
  return selection.map((id) => blocks[id]).filter(Boolean);
};

const updateSelectedBlocks = (mapBlock: (block: Block, index: number, selected: Block[]) => Partial<Block>) => {
  const selected = getSelectedBlocks();
  if (selected.length === 0) return;
  const updates = selected.map((block, index) => ({
    id: block.id,
    updates: mapBlock(block, index, selected),
  }));
  useBoardStore.getState().updateBlocks(updates);
};

const getSelectionBounds = (blocks: Block[]) => {
  const minX = Math.min(...blocks.map((block) => block.x));
  const minY = Math.min(...blocks.map((block) => block.y));
  const maxX = Math.max(...blocks.map((block) => block.x + block.width));
  const maxY = Math.max(...blocks.map((block) => block.y + block.height));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

export const selectInverse = () => {
  const { blocks, selection, setSelection } = useBoardStore.getState();
  const current = new Set(selection);
  setSelection(Object.keys(blocks).filter((id) => !current.has(id)));
};

export const deleteSelection = () => {
  const { selection, drawingSelection, removeBlocks, removeDrawings } = useBoardStore.getState();
  if (selection.length > 0) removeBlocks(selection);
  if (drawingSelection.length > 0) removeDrawings(drawingSelection);
};

export const copySelectionAsPng = async () => {
  const canvas = await renderBoardToCanvas(getSelectedBlocks());
  if (!canvas) return;
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    if ('clipboard' in navigator && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
  }, 'image/png');
};

export const setZoomCentered = (zoom: number) => {
  const { viewport, setViewport } = useBoardStore.getState();
  const nextZoom = Math.max(0.1, Math.min(5, zoom));
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const scaleRatio = nextZoom / viewport.zoom;
  setViewport({
    x: centerX - (centerX - viewport.x) * scaleRatio,
    y: centerY - (centerY - viewport.y) * scaleRatio,
    zoom: nextZoom,
  });
};

export const zoomToFit = (ids?: string[]) => {
  const { blocks, setViewport } = useBoardStore.getState();
  const target = (ids && ids.length > 0 ? ids : Object.keys(blocks)).map((id) => blocks[id]).filter(Boolean);
  if (target.length === 0) return;
  const bounds = getSelectionBounds(target);
  const padding = 96;
  const zoom = Math.min(
    5,
    Math.max(0.1, Math.min((window.innerWidth - padding * 2) / bounds.width, (window.innerHeight - padding * 2) / bounds.height))
  );
  setViewport({
    zoom,
    x: window.innerWidth / 2 - (bounds.minX + bounds.width / 2) * zoom,
    y: window.innerHeight / 2 - (bounds.minY + bounds.height / 2) * zoom,
  });
};

export const groupSelection = () => {
  const groupId = uuidv4();
  updateSelectedBlocks((block) => ({ data: { ...block.data, groupId } }));
};

export const ungroupSelection = () => {
  updateSelectedBlocks((block) => {
    const { groupId: _groupId, ...data } = block.data;
    return { data };
  });
};

export const flipSelection = (axis: 'horizontal' | 'vertical') => {
  const selected = getSelectedBlocks();
  if (selected.length === 0) return;
  const bounds = getSelectionBounds(selected);
  updateSelectedBlocks((block) => ({
    x: axis === 'horizontal' ? bounds.minX + bounds.maxX - block.x - block.width : block.x,
    y: axis === 'vertical' ? bounds.minY + bounds.maxY - block.y - block.height : block.y,
    data: {
      ...block.data,
      flipX: axis === 'horizontal' ? !block.data.flipX : block.data.flipX,
      flipY: axis === 'vertical' ? !block.data.flipY : block.data.flipY,
    },
  }));
};

export const rotateSelection = (degrees: 90 | -90 | 180) => {
  updateSelectedBlocks((block) => ({
    data: { ...block.data, rotation: ((block.data.rotation || 0) + degrees + 360) % 360 },
  }));
};

export const applyTextCommand = (command: TextCommand) => {
  updateSelectedBlocks((block) => {
    if (block.type !== 'text' && block.type !== 'sticky') return {};
    const data = { ...block.data };
    if (command === 'bold') data.bold = !data.bold;
    if (command === 'italic') data.italic = !data.italic;
    if (command === 'underline') data.underline = !data.underline;
    if (command === 'strikethrough') data.strikethrough = !data.strikethrough;
    if (command === 'bulletedList') data.listStyle = data.listStyle === 'bullet' ? undefined : 'bullet';
    if (command === 'numberedList') data.listStyle = data.listStyle === 'number' ? undefined : 'number';
    if (command === 'alignLeft') data.textAlign = 'left';
    if (command === 'alignCenter') data.textAlign = 'center';
    if (command === 'alignRight') data.textAlign = 'right';
    if (command === 'link') {
      const url = window.prompt('Link URL', data.href || 'https://');
      if (url) data.href = url;
    }
    return { data };
  });
};

export const alignSelection = (alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => {
  const selected = getSelectedBlocks();
  if (selected.length < 2) return;
  const bounds = getSelectionBounds(selected);
  updateSelectedBlocks((block) => {
    if (alignment === 'left') return { x: bounds.minX };
    if (alignment === 'centerH') return { x: bounds.minX + bounds.width / 2 - block.width / 2 };
    if (alignment === 'right') return { x: bounds.maxX - block.width };
    if (alignment === 'top') return { y: bounds.minY };
    if (alignment === 'centerV') return { y: bounds.minY + bounds.height / 2 - block.height / 2 };
    return { y: bounds.maxY - block.height };
  });
};

export const distributeSelection = (axis: 'horizontal' | 'vertical') => {
  const selected = getSelectedBlocks();
  if (selected.length < 3) return;
  const sorted = [...selected].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y);
  const bounds = getSelectionBounds(sorted);
  const totalSize = sorted.reduce((sum, block) => sum + (axis === 'horizontal' ? block.width : block.height), 0);
  const available = (axis === 'horizontal' ? bounds.width : bounds.height) - totalSize;
  const gap = available / (sorted.length - 1);
  let cursor = axis === 'horizontal' ? bounds.minX : bounds.minY;
  const updates = sorted.map((block) => {
    const update = axis === 'horizontal' ? { x: cursor } : { y: cursor };
    cursor += (axis === 'horizontal' ? block.width : block.height) + gap;
    return { id: block.id, updates: update };
  });
  useBoardStore.getState().updateBlocks(updates);
};

export const tidySelection = () => {
  const selected = getSelectedBlocks();
  if (selected.length < 2) return;
  const bounds = getSelectionBounds(selected);
  const columns = Math.ceil(Math.sqrt(selected.length));
  const gap = 24;
  const cellWidth = Math.max(...selected.map((block) => block.width)) + gap;
  const cellHeight = Math.max(...selected.map((block) => block.height)) + gap;
  const updates = [...selected].sort((a, b) => a.y - b.y || a.x - b.x).map((block, index) => ({
    id: block.id,
    updates: {
      x: bounds.minX + (index % columns) * cellWidth,
      y: bounds.minY + Math.floor(index / columns) * cellHeight,
    },
  }));
  useBoardStore.getState().updateBlocks(updates);
};

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const renderBoardToCanvas = async (targetBlocks?: Block[]) => {
  const { blocks, drawings, canvasTitle } = useBoardStore.getState();
  const blockList = targetBlocks && targetBlocks.length > 0 ? targetBlocks : Object.values(blocks);
  if (blockList.length === 0 && drawings.length === 0) return null;
  const bounds = blockList.length > 0 ? getSelectionBounds(blockList) : { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };
  const padding = 48;
  const width = Math.max(320, Math.ceil(bounds.width + padding * 2));
  const height = Math.max(240, Math.ceil(bounds.height + padding * 2));
  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;

  const blockMarkup = blockList
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((block) => {
      const x = block.x + offsetX;
      const y = block.y + offsetY;
      const transform = `translate(${x + block.width / 2} ${y + block.height / 2}) rotate(${block.data.rotation || 0}) scale(${block.data.flipX ? -1 : 1} ${block.data.flipY ? -1 : 1}) translate(${-block.width / 2} ${-block.height / 2})`;
      if (block.type === 'shape') {
        const fill = `${block.data.color || '#ff6b6b'}55`;
        return block.data.shape === 'circle'
          ? `<ellipse transform="${transform}" cx="${block.width / 2}" cy="${block.height / 2}" rx="${block.width / 2}" ry="${block.height / 2}" fill="${fill}" stroke="${block.data.color || '#ff6b6b'}" stroke-width="2" />`
          : `<rect transform="${transform}" width="${block.width}" height="${block.height}" rx="3" fill="${fill}" stroke="${block.data.color || '#ff6b6b'}" stroke-width="2" />`;
      }
      if (block.type === 'image' && block.data.url) {
        return `<image transform="${transform}" href="${escapeXml(block.data.url)}" width="${block.width}" height="${block.height}" preserveAspectRatio="xMidYMid slice" />`;
      }
      if (block.type === 'frame') {
        return `<rect transform="${transform}" width="${block.width}" height="${block.height}" fill="none" stroke="#a1a1aa" stroke-width="2" stroke-dasharray="8 8" />`;
      }
      const text = escapeXml(block.data.text || block.data.title || '');
      const bg = block.type === 'sticky' ? `hsl(${block.data.hue ?? 55}, 90%, 85%)` : 'transparent';
      const decoration = [block.data.underline ? 'underline' : '', block.data.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ');
      return `<g transform="${transform}"><rect width="${block.width}" height="${block.height}" rx="6" fill="${bg}" /><text x="12" y="28" font-family="system-ui, sans-serif" font-size="${block.data.fontSize || 20}" font-weight="${block.data.bold ? 700 : 500}" font-style="${block.data.italic ? 'italic' : 'normal'}" text-decoration="${decoration}" fill="${block.data.color || '#27272a'}">${text}</text></g>`;
    })
    .join('');

  const drawingMarkup = drawings
    .map((path) => `<path d="M ${path.points.map((point) => `${point.x + offsetX} ${point.y + offsetY}`).join(' L ')}" fill="none" stroke="${path.color}" stroke-width="${path.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${path.toolType === 'highlighter' ? 0.4 : 1}" />`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escapeXml(canvasTitle)}</title><rect width="100%" height="100%" fill="#fafafa" />${drawingMarkup}${blockMarkup}</svg>`;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = url;
  });
  URL.revokeObjectURL(url);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return canvas;
};

export const exportBoard = async (format: ExportFormat) => {
  const canvas = await renderBoardToCanvas();
  if (!canvas) return;
  const { canvasTitle } = useBoardStore.getState();
  if (format === 'pdf') {
    const dataUrl = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    printWindow?.document.write(`<title>${escapeXml(canvasTitle)}</title><img src="${dataUrl}" style="max-width:100%;height:auto" onload="window.print()" />`);
    printWindow?.document.close();
    return;
  }
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, safeFilename(canvasTitle, format));
  }, mime, 0.95);
};


import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../store';
import { supabase } from './supabase';
import { getSavedBoardId, markBoardImported, markBoardSaved, markBoardUnsaved } from './boardSession';
import type { Block, DrawingPath, Viewport } from '../types';

type BoardSnapshot = {
  version: 1;
  title: string;
  blocks: Record<string, Block>;
  drawings: DrawingPath[];
  viewport: Viewport;
};

type ExportFormat = 'png' | 'jpg' | 'pdf';
export type SavedBoardSummary = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};
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
const BOARD_CONTENT_COLUMNS = ['snapshot', 'data', 'content'];

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

const boardContentPayloads = (snapshot: BoardSnapshot) => ({
  snapshot,
  data: snapshot,
  content: snapshot,
});

const parseSnapshot = (row: Record<string, unknown> | null): BoardSnapshot | null => {
  if (!row) return null;
  const maybeSnapshot = BOARD_CONTENT_COLUMNS.map((column) => row[column]).find(Boolean);
  if (maybeSnapshot && typeof maybeSnapshot === 'object') {
    return maybeSnapshot as BoardSnapshot;
  }
  return null;
};

const blankSnapshotForRow = (row: Record<string, unknown> | null): BoardSnapshot => ({
  version: 1,
  title: String(row?.title || 'Untitled Board'),
  blocks: {},
  drawings: [],
  viewport: { x: 300, y: 200, zoom: 0.5 },
});

const normalizeSnapshot = (value: unknown): BoardSnapshot => {
  if (!value || typeof value !== 'object') throw new Error('This file is not a Viboard board.');
  const record = value as Record<string, unknown>;
  const nested = BOARD_CONTENT_COLUMNS.map((column) => record[column]).find((item) => item && typeof item === 'object');
  if (nested) return normalizeSnapshot(nested);

  const blocks = record.blocks;
  const drawings = record.drawings;
  const viewport = record.viewport as Partial<Viewport> | undefined;
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) {
    throw new Error('This Viboard file does not include board blocks.');
  }

  return {
    version: 1,
    title: typeof record.title === 'string' && record.title.trim() ? record.title : 'Imported Board',
    blocks: blocks as Record<string, Block>,
    drawings: Array.isArray(drawings) ? drawings as DrawingPath[] : [],
    viewport: {
      x: typeof viewport?.x === 'number' ? viewport.x : 300,
      y: typeof viewport?.y === 'number' ? viewport.y : 200,
      zoom: typeof viewport?.zoom === 'number' ? viewport.zoom : 0.5,
    },
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

const saveWebSnapshotCache = (boardId: string, snapshot: BoardSnapshot) => {
  localStorage.setItem(`viboard:web:${boardId}`, JSON.stringify(snapshot));
  const cachedBoards = JSON.parse(localStorage.getItem('viboard:web:index') || '[]') as SavedBoardSummary[];
  const now = new Date().toISOString();
  const next = [
    { id: boardId, title: snapshot.title, updated_at: now },
    ...cachedBoards.filter((board) => board.id !== boardId),
  ].slice(0, 25);
  localStorage.setItem('viboard:web:index', JSON.stringify(next));
};

export const getCachedWebBoards = () => JSON.parse(localStorage.getItem('viboard:web:index') || '[]') as SavedBoardSummary[];

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
  markBoardUnsaved();
};

export const saveBoard = () => {
  const snapshot = getSnapshot();
  localStorage.setItem('viboard:autosave', JSON.stringify(snapshot));
  saveRecentSnapshot(snapshot);
};

export const saveBoardToWeb = async (title: string, boardId?: string | null) => {
  const snapshot = { ...getSnapshot(), title: title.trim() || 'Untitled Board' };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('You must be signed in to save this board.');

  const timestampedPayload = {
    title: snapshot.title,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  const basePayload = {
    title: snapshot.title,
    user_id: userId,
  };
  const payloadWithContent = {
    ...timestampedPayload,
    ...boardContentPayloads(snapshot),
  };

  const savePayloads = [
    { ...timestampedPayload, snapshot },
    { ...basePayload, snapshot },
    payloadWithContent,
    { ...basePayload, ...boardContentPayloads(snapshot) },
    timestampedPayload,
    basePayload,
  ];
  let data: { id: string } | null = null;
  const errors: unknown[] = [];

  const trySave = async (mode: 'update' | 'insert', options: { includeRouteId?: boolean } = {}) => {
    for (const payload of savePayloads) {
      const query = mode === 'update' && boardId
        ? supabase.from('moodboards').update(payload).eq('id', boardId).select('id').single()
        : supabase
          .from('moodboards')
          .insert([{ ...(options.includeRouteId && boardId ? { id: boardId } : {}), ...payload }])
          .select('id')
          .single();
      const result = await query;
      data = result.data as { id: string } | null;
      if (result.error) errors.push(result.error);
      if (!result.error && data) return true;
    }
    return false;
  };

  if (boardId) {
    await trySave('update');
  }
  if (!data) {
    await trySave('insert', { includeRouteId: true });
  }
  if (!data) {
    await trySave('insert');
  }

  const savedBoard = data as { id: string } | null;
  if (!savedBoard) {
    const lastError = errors[errors.length - 1];
    console.error('Error saving moodboard:', lastError);
    const fallbackId = boardId || crypto.randomUUID();
    useBoardStore.setState({ canvasTitle: snapshot.title });
    saveWebSnapshotCache(fallbackId, snapshot);
    localStorage.setItem('viboard:autosave', JSON.stringify(snapshot));
    saveRecentSnapshot(snapshot);
    markBoardSaved(fallbackId);
    return fallbackId;
  }

  useBoardStore.setState({ canvasTitle: snapshot.title });
  saveWebSnapshotCache(savedBoard.id, snapshot);
  localStorage.setItem('viboard:autosave', JSON.stringify(snapshot));
  saveRecentSnapshot(snapshot);
  markBoardSaved(savedBoard.id);
  return savedBoard.id;
};

export const saveLocalCopy = () => {
  const snapshot = getSnapshot();
  saveRecentSnapshot(snapshot);
  downloadBlob(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
    safeFilename(snapshot.title, BOARD_FILE_EXTENSION)
  );
};

export const deleteCurrentBoard = async () => {
  const boardId = getSavedBoardId();
  if (!boardId) return;
  const { error } = await supabase.from('moodboards').delete().eq('id', boardId);
  if (error) throw error;
  localStorage.removeItem(`viboard:web:${boardId}`);
  const cachedBoards = getCachedWebBoards().filter((board) => board.id !== boardId);
  localStorage.setItem('viboard:web:index', JSON.stringify(cachedBoards));
  markBoardUnsaved();
};

export const openRecentBoard = () => {
  const recent = JSON.parse(localStorage.getItem('viboard:recent') || '[]') as BoardSnapshot[];
  const latest = recent[0] || JSON.parse(localStorage.getItem('viboard:autosave') || 'null') as BoardSnapshot | null;
  if (latest) loadBoardSnapshot(latest);
};

export const importBoardFile = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `.${BOARD_FILE_EXTENSION},.json,application/json`;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      loadBoardSnapshot(normalizeSnapshot(JSON.parse(text)));
      markBoardImported();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import this board.';
      window.alert(message);
    }
  };
  input.click();
};

export const fetchRecentBoards = async (limit = 10): Promise<SavedBoardSummary[]> => {
  const cached = getCachedWebBoards();
  const { data, error } = await supabase
    .from('moodboards')
    .select('id,title,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    const fallback = await supabase
      .from('moodboards')
      .select('id,title,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fallback.error || !fallback.data) return cached.slice(0, limit);
    const remote = fallback.data.map((board) => ({ ...board, title: board.title || 'Untitled Board' }));
    return mergeBoardSummaries(remote, cached).slice(0, limit);
  }

  const remote = (data || []).map((board) => ({ ...board, title: board.title || 'Untitled Board' }));
  return mergeBoardSummaries(remote, cached).slice(0, limit);
};

const mergeBoardSummaries = (primary: SavedBoardSummary[], secondary: SavedBoardSummary[]) => {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((board) => {
    if (seen.has(board.id)) return false;
    seen.add(board.id);
    return true;
  });
};

export const loadBoardFromWeb = async (boardId: string) => {
  const cached = localStorage.getItem(`viboard:web:${boardId}`);
  const { data, error } = await supabase.from('moodboards').select('*').eq('id', boardId).single();
  if (error && cached) {
    loadBoardSnapshot(JSON.parse(cached) as BoardSnapshot);
    return;
  }
  if (error) throw error;
  const snapshot = parseSnapshot(data as Record<string, unknown>);
  if (snapshot) {
    loadBoardSnapshot(snapshot);
    saveWebSnapshotCache(boardId, snapshot);
    markBoardSaved(boardId);
    return;
  }
  if (cached) {
    loadBoardSnapshot(JSON.parse(cached) as BoardSnapshot);
    markBoardSaved(boardId);
    return;
  }
  loadBoardSnapshot(blankSnapshotForRow(data as Record<string, unknown>));
  markBoardSaved(boardId);
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

const getDrawingBounds = (drawings: DrawingPath[]) => {
  const points = drawings.flatMap((drawing) => drawing.points);
  if (points.length === 0) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const mergeBounds = (
  first: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null,
  second: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null
) => {
  if (!first) return second;
  if (!second) return first;
  const minX = Math.min(first.minX, second.minX);
  const minY = Math.min(first.minY, second.minY);
  const maxX = Math.max(first.maxX, second.maxX);
  const maxY = Math.max(first.maxY, second.maxY);
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
    const data = { ...block.data };
    delete data.groupId;
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
  const blockBounds = blockList.length > 0 ? getSelectionBounds(blockList) : null;
  const drawingBounds = targetBlocks ? null : getDrawingBounds(drawings);
  const bounds = mergeBounds(blockBounds, drawingBounds) || { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };
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

const createImagePdf = (jpegBytes: Uint8Array, width: number, height: number) => {
  const pageWidth = width * 0.75;
  const pageHeight = height * 0.75;
  const parts: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let length = 0;
  const add = (part: string | Uint8Array) => {
    parts.push(part);
    length += typeof part === 'string' ? part.length : part.byteLength;
  };
  const object = (body: string | Uint8Array, prefix = '', suffix = '') => {
    offsets.push(length);
    add(`${offsets.length} 0 obj\n${prefix}`);
    add(body);
    add(`${suffix}\nendobj\n`);
  };

  add('%PDF-1.4\n');
  object('<< /Type /Catalog /Pages 2 0 R >>');
  object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(
    jpegBytes,
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`,
    '\nendstream'
  );
  const content = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  object(content, `<< /Length ${content.length} >>\nstream\n`, 'endstream');

  const xrefOffset = length;
  add(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach((offset) => add(`${String(offset).padStart(10, '0')} 00000 n \n`));
  add(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(parts as unknown as BlobPart[], { type: 'application/pdf' });
};

const dataUrlToBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const exportBoard = async (format: ExportFormat) => {
  const canvas = await renderBoardToCanvas();
  if (!canvas) return;
  const { canvasTitle } = useBoardStore.getState();
  if (format === 'pdf') {
    const jpegBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.95));
    downloadBlob(createImagePdf(jpegBytes, canvas.width, canvas.height), safeFilename(canvasTitle, 'pdf'));
    return;
  }
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, safeFilename(canvasTitle, format));
  }, mime, 0.95);
};

import { v4 as uuidv4 } from 'uuid';
import { MAX_HISTORY, useBoardStore } from '../store';
import { supabase } from './supabase';
import { getSavedBoardId, markBoardDraftClean, markBoardImported, markBoardSaved, markBoardUnsaved } from './boardSession';
import { clampViewportZoom } from '../types';
import type { Block, DrawingPath, Viewport } from '../types';
import type { BoardHistory } from '../store';
import type { Session } from '@supabase/supabase-js';

export type BoardSnapshot = {
  version: 1;
  title: string;
  blocks: Record<string, Block>;
  drawings: DrawingPath[];
  viewport: Viewport;
  history?: BoardHistory;
};

type ExportFormat = 'png' | 'jpg' | 'pdf';
export type SavedBoardSummary = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};
type MoodboardRow = Record<string, unknown> & {
  id?: string;
  title?: string;
  snapshot_path?: string | null;
  snapshot_compressed?: string | null;
  snapshot_encoding?: string | null;
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

export const BOARD_FILE_EXTENSION = 'viboard.json';
const BOARD_CONTENT_COLUMNS = ['snapshot', 'data', 'content'];
const SNAPSHOT_STORAGE_BUCKET = 'board-snapshots';
const SNAPSHOT_STORAGE_VERSION = 1;
const SNAPSHOT_COMPRESSED_ENCODING = 'gzip+base64+json';
const PENDING_AUTHENTICATED_SAVE_KEY = 'viboard:pending-authenticated-save';
const WEB_CACHE_INDEX_KEY = 'viboard:web:index';
const AUTOSAVE_KEY = 'viboard:autosave';
const RECENT_BOARDS_KEY = 'viboard:recent';
const RECENT_WEB_BOARDS_KEY = 'viboard:recent-web-boards';
const TUTORIAL_BOARD_URL = '/tutorial-board.viboard.json';
const DEFAULT_BOARD_VIEWPORT_ZOOM = 1;
const MAX_BROWSER_SNAPSHOT_CHARS = 4_000_000;
const SNAPSHOT_DB_NAME = 'viboard-cache';
const SNAPSHOT_DB_VERSION = 1;
const SNAPSHOT_STORE_NAME = 'snapshots';
const transientSavedSnapshots = new Map<string, BoardSnapshot>();
const DEFAULT_LOCKUP_BLOCK: Block = {
  id: 'viboard-lockup',
  type: 'image',
  x: 0,
  y: 0,
  width: 480,
  height: 105,
  zIndex: 1,
  data: {
    url: '/viboard-lockup.svg',
    alt: 'Viboard',
  },
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const normalizeHistory = (history: unknown): BoardHistory => {
  if (!history || typeof history !== 'object') return { past: [], future: [] };
  const record = history as Partial<BoardHistory>;
  return {
    past: Array.isArray(record.past) ? record.past.slice(-MAX_HISTORY) : [],
    future: Array.isArray(record.future) ? record.future.slice(0, MAX_HISTORY) : [],
  };
};

const normalizeViewport = (viewport?: Partial<Viewport>): Viewport => ({
  x: typeof viewport?.x === 'number' ? viewport.x : 300,
  y: typeof viewport?.y === 'number' ? viewport.y : 200,
  zoom: clampViewportZoom(
    typeof viewport?.zoom === 'number' ? viewport.zoom : DEFAULT_BOARD_VIEWPORT_ZOOM
  ),
});

const snapshotForPersistence = (snapshot: BoardSnapshot): BoardSnapshot => ({
  version: 1,
  title: snapshot.title,
  blocks: snapshot.blocks || {},
  drawings: snapshot.drawings || [],
  viewport: normalizeViewport(snapshot.viewport),
  history: normalizeHistory(snapshot.history),
});

const snapshotSignature = (snapshot: BoardSnapshot) =>
  JSON.stringify({
    title: snapshot.title,
    blocks: snapshot.blocks,
    drawings: snapshot.drawings,
    viewport: snapshot.viewport,
    history: normalizeHistory(snapshot.history),
  });

const snapshotStats = (snapshot: BoardSnapshot) => ({
  title: snapshot.title,
  blockCount: Object.keys(snapshot.blocks || {}).length,
  drawingCount: (snapshot.drawings || []).length,
  jsonChars: estimateJsonChars(snapshot),
  blockIds: Object.keys(snapshot.blocks || {}).slice(0, 10),
});

const isDefaultOnlySnapshot = (snapshot: BoardSnapshot) => {
  const blockIds = Object.keys(snapshot.blocks || {});
  return (
    blockIds.length === 1 &&
    blockIds[0] === DEFAULT_LOCKUP_BLOCK.id &&
    (snapshot.drawings || []).length === 0
  );
};

const timestampValue = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const getBoardSnapshot = (): BoardSnapshot => {
  const { canvasTitle, blocks, drawings, viewport, history } = useBoardStore.getState();
  return {
    version: 1,
    title: canvasTitle,
    blocks,
    drawings,
    viewport,
    history: normalizeHistory(history),
  };
};

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : null;

const isQuotaExceededError = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014);

const safeParseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const compressText = async (text: string) => {
  if (typeof CompressionStream === 'undefined') return btoa(unescape(encodeURIComponent(text)));

  const stream = new Blob([text], { type: 'application/json' })
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
};

const decompressText = async (value: string, encoding?: string | null) => {
  if (encoding !== SNAPSHOT_COMPRESSED_ENCODING) {
    return decodeURIComponent(escape(atob(value)));
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress the stored board snapshot.');
  }

  const stream = new Blob([base64ToBytes(value)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
};

const openSnapshotDb = () =>
  new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SNAPSHOT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });

const withSnapshotStore = async <T,>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
) => {
  const db = await openSnapshotDb();
  if (!db) return null;

  return new Promise<T | null>((resolve) => {
    const transaction = db.transaction(SNAPSHOT_STORE_NAME, mode);
    const request = callback(transaction.objectStore(SNAPSHOT_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
    transaction.onabort = () => db.close();
  });
};

const writeSnapshotIndexedDb = async (key: string, snapshot: BoardSnapshot) => {
  const result = await withSnapshotStore('readwrite', (store) => store.put(snapshot, key));
  return result !== null;
};

const removeSnapshotIndexedDb = (key: string) => {
  void withSnapshotStore('readwrite', (store) => store.delete(key));
};

const readSnapshotIndexedDb = async (key: string): Promise<BoardSnapshot | null> => {
  const stored = await withSnapshotStore<unknown>('readonly', (store) => store.get(key));
  if (!stored || typeof stored !== 'object') return null;

  try {
    const snapshot = normalizeSnapshot(stored);
    return isClearedBoardSnapshot(snapshot) ? null : snapshot;
  } catch {
    removeSnapshotIndexedDb(key);
    return null;
  }
};

const removeCachedWebSnapshots = (exceptBoardId?: string) => {
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith('viboard:web:') || key === WEB_CACHE_INDEX_KEY) continue;
    if (exceptBoardId && key === `viboard:web:${exceptBoardId}`) continue;
    keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
    removeSnapshotIndexedDb(key);
  });
};

const freeBoardStorage = (key: string) => {
  const boardId = key.startsWith('viboard:web:') ? key.slice('viboard:web:'.length) : undefined;
  removeCachedWebSnapshots(boardId);
  if (key !== RECENT_BOARDS_KEY) localStorage.removeItem(RECENT_BOARDS_KEY);
  if (key !== AUTOSAVE_KEY) localStorage.removeItem(AUTOSAVE_KEY);
};

const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;
  }

  freeBoardStorage(key);

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;
    console.warn(`Skipping browser cache write for ${key} because the board exceeds available storage.`);
    return false;
  }
};

const estimateJsonChars = (value: unknown, seen = new WeakSet<object>()): number => {
  if (value === null || value === undefined) return 4;
  if (typeof value === 'string') return value.length + 2;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).length;
  if (typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateJsonChars(item, seen) + 1, 2);
  }

  return Object.entries(value as Record<string, unknown>).reduce(
    (sum, [key, item]) => sum + key.length + 3 + estimateJsonChars(item, seen),
    2
  );
};

const safeSetSnapshotStorage = (key: string, snapshot: BoardSnapshot) => {
  if (estimateJsonChars(snapshot) > MAX_BROWSER_SNAPSHOT_CHARS) {
    localStorage.removeItem(key);
    void writeSnapshotIndexedDb(key, snapshot).catch(() => {
      console.warn(`Skipping browser cache write for ${key} because the board exceeds available storage.`);
    });
    return typeof indexedDB !== 'undefined';
  }

  removeSnapshotIndexedDb(key);
  return safeSetLocalStorage(key, JSON.stringify(snapshot));
};

const readSnapshotStorage = (key: string): BoardSnapshot | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  if (raw.length > MAX_BROWSER_SNAPSHOT_CHARS) {
    localStorage.removeItem(key);
    console.warn(`Ignoring oversized browser cache entry for ${key}.`);
    return null;
  }

  const parsed = safeParseJson<unknown>(raw, null);
  if (!parsed || typeof parsed !== 'object') {
    localStorage.removeItem(key);
    removeSnapshotIndexedDb(key);
    return null;
  }

  try {
    const snapshot = normalizeSnapshot(parsed);
    if (isClearedBoardSnapshot(snapshot)) {
      localStorage.removeItem(key);
      removeSnapshotIndexedDb(key);
      return null;
    }
    return snapshot;
  } catch {
    localStorage.removeItem(key);
    removeSnapshotIndexedDb(key);
    return null;
  }
};

const readSnapshotCache = async (key: string) =>
  readSnapshotStorage(key) ?? await readSnapshotIndexedDb(key);

export const getCachedWebBoardSnapshot = (boardId: string) =>
  readSnapshotCache(`viboard:web:${boardId}`);

const centeredViewportForBlock = (block: Block): Viewport => {
  if (typeof window === 'undefined') {
    return { x: 300, y: 200, zoom: DEFAULT_BOARD_VIEWPORT_ZOOM };
  }

  return {
    x: window.innerWidth / 2 - (block.x + block.width / 2) * DEFAULT_BOARD_VIEWPORT_ZOOM,
    y: window.innerHeight / 2 - (block.y + block.height / 2) * DEFAULT_BOARD_VIEWPORT_ZOOM,
    zoom: DEFAULT_BOARD_VIEWPORT_ZOOM,
  };
};

const defaultBoardSnapshot = (title = 'Untitled Board'): BoardSnapshot => ({
  version: 1,
  title,
  blocks: {
    [DEFAULT_LOCKUP_BLOCK.id]: { ...DEFAULT_LOCKUP_BLOCK, data: { ...DEFAULT_LOCKUP_BLOCK.data } },
  },
  drawings: [],
  viewport: centeredViewportForBlock(DEFAULT_LOCKUP_BLOCK),
  history: { past: [], future: [] },
});

const loadBoardState = (snapshot: BoardSnapshot) => {
  useBoardStore.setState({
    blocks: snapshot.blocks || {},
    drawings: snapshot.drawings || [],
    selection: [],
    drawingSelection: [],
    canvasTitle: snapshot.title || 'Untitled Board',
    viewport: normalizeViewport(snapshot.viewport),
    history: normalizeHistory(snapshot.history),
  });
};

const fetchTutorialBoardSnapshot = async (signal?: AbortSignal): Promise<BoardSnapshot | null> => {
  if (typeof fetch === 'undefined') return null;

  try {
    const response = await fetch(TUTORIAL_BOARD_URL, { cache: 'force-cache', signal });
    if (!response.ok || signal?.aborted) return null;
    return normalizeSnapshot(await response.json());
  } catch (error) {
    if (signal?.aborted) return null;
    console.warn('Could not load tutorial board:', error);
    return null;
  }
};

const isClearedBoardSnapshot = (snapshot: BoardSnapshot) =>
  Object.keys(snapshot.blocks || {}).length === 0 &&
  (snapshot.drawings || []).length === 0 &&
  snapshot.viewport.x === 0 &&
  snapshot.viewport.y === 0 &&
  snapshot.viewport.zoom === DEFAULT_BOARD_VIEWPORT_ZOOM;

export const parseSnapshot = (row: Record<string, unknown> | null): BoardSnapshot | null => {
  if (!row) return null;
  const maybeSnapshot = BOARD_CONTENT_COLUMNS.map((column) => row[column]).find(Boolean);
  if (!maybeSnapshot) return null;

  const snapshot = typeof maybeSnapshot === 'string'
    ? safeParseJson<unknown>(maybeSnapshot, null)
    : maybeSnapshot;

  if (snapshot && typeof snapshot === 'object') {
    try {
      const normalized = normalizeSnapshot(snapshot);
      return isClearedBoardSnapshot(normalized) ? null : normalized;
    } catch {
      return null;
    }
  }

  return null;
};

export const loadSnapshotFromRow = async (row: MoodboardRow | null): Promise<BoardSnapshot | null> => {
  if (!row) return null;

  if (typeof row.snapshot_path === 'string' && row.snapshot_path.trim()) {
    const { data, error } = await supabase.storage
      .from(SNAPSHOT_STORAGE_BUCKET)
      .download(row.snapshot_path);

    if (!error && data) {
      try {
        const normalized = normalizeSnapshot(JSON.parse(await data.text()));
        return isClearedBoardSnapshot(normalized) ? null : normalized;
      } catch (parseError) {
        console.error('Error parsing stored board snapshot:', parseError);
      }
    } else {
      console.error('Error downloading board snapshot:', error);
    }
  }

  if (typeof row.snapshot_compressed === 'string' && row.snapshot_compressed.trim()) {
    try {
      const normalized = normalizeSnapshot(
        JSON.parse(await decompressText(row.snapshot_compressed, row.snapshot_encoding))
      );
      return isClearedBoardSnapshot(normalized) ? null : normalized;
    } catch (parseError) {
      console.error('Error parsing compressed board snapshot:', parseError);
    }
  }

  return parseSnapshot(row);
};

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
    viewport: normalizeViewport(viewport),
    history: normalizeHistory(record.history),
  };
};

export const safeFilename = (name: string, extension: string) => {
  const normalized = name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${normalized || 'Untitled-Board'}.${extension}`;
};

const stripListPrefix = (line: string) =>
  line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '');

const applyListStyleToText = (text: string, style?: 'bullet' | 'number') => {
  const lines = text.split('\n');
  const normalized = lines.map((line) => stripListPrefix(line));

  if (!style) {
    return normalized.join('\n');
  }

  let number = 1;
  return normalized
    .map((line) => {
      if (!line.trim()) return '';
      if (style === 'bullet') return `• ${line}`;
      const next = `${number}. ${line}`;
      number += 1;
      return next;
    })
    .join('\n');
};

const getSelectionTextOffset = (root: HTMLElement, container: Node, offset: number) => {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return range.toString().length;
};

const setEditableSelection = (root: HTMLElement, start: number, end: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const positions: { node: Node; offset: number }[] = [];
  let remainingStart = start;
  let remainingEnd = end;
  let node = walker.nextNode();

  while (node && positions.length < 2) {
    const textLength = node.textContent?.length ?? 0;
    if (positions.length === 0 && remainingStart <= textLength) {
      positions.push({ node, offset: remainingStart });
    }
    if (remainingEnd <= textLength) {
      positions.push({ node, offset: remainingEnd });
      break;
    }
    remainingStart -= textLength;
    remainingEnd -= textLength;
    node = walker.nextNode();
  }

  const range = document.createRange();
  if (positions[0] && positions[1]) {
    range.setStart(positions[0].node, positions[0].offset);
    range.setEnd(positions[1].node, positions[1].offset);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
};

const getEditableSelectionContext = () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const startElement = range.startContainer instanceof HTMLElement
    ? range.startContainer
    : range.startContainer.parentElement;
  const root = startElement?.closest<HTMLElement>('[data-viboard-block-id]');
  if (!root || !root.isContentEditable || !root.contains(range.endContainer)) return null;
  const blockId = root.dataset.viboardBlockId;
  if (!blockId) return null;

  return {
    root,
    blockId,
    start: getSelectionTextOffset(root, range.startContainer, range.startOffset),
    end: getSelectionTextOffset(root, range.endContainer, range.endOffset),
  };
};

const applyListStyleToEditableSelection = (style: 'bullet' | 'number') => {
  const context = getEditableSelectionContext();
  if (!context) return false;

  const text = context.root.innerText === '\n' ? '' : context.root.innerText;
  const selectionStart = Math.min(context.start, context.end);
  const selectionEnd = Math.max(context.start, context.end);
  const firstLineStart = text.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const lastSelectedOffset = Math.max(selectionStart, selectionEnd - 1);
  const nextLineBreak = text.indexOf('\n', lastSelectedOffset);
  const lastLineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const selectedLines = text.slice(firstLineStart, lastLineEnd).split('\n');
  const hasSameListStyle = selectedLines
    .filter((line) => line.trim())
    .every((line) => style === 'bullet' ? /^\s*•\s+/.test(line) : /^\s*\d+[.)]\s+/.test(line));

  let number = 1;
  const transformed = selectedLines
    .map((line) => {
      const normalized = stripListPrefix(line);
      if (!normalized.trim()) return '';
      if (hasSameListStyle) return normalized;
      if (style === 'bullet') return `• ${normalized}`;
      const next = `${number}. ${normalized}`;
      number += 1;
      return next;
    })
    .join('\n');

  const nextText = `${text.slice(0, firstLineStart)}${transformed}${text.slice(lastLineEnd)}`;
  context.root.textContent = nextText;
  setEditableSelection(context.root, firstLineStart, firstLineStart + transformed.length);

  const { blocks, updateBlock } = useBoardStore.getState();
  const block = blocks[context.blockId];
  if (block && (block.type === 'text' || block.type === 'sticky')) {
    updateBlock(context.blockId, { data: { ...block.data, text: nextText } }, true);
  }

  return true;
};

const saveRecentSnapshot = (snapshot: BoardSnapshot) => {
  if (isClearedBoardSnapshot(snapshot)) return false;
  if (estimateJsonChars(snapshot) > MAX_BROWSER_SNAPSHOT_CHARS) {
    localStorage.removeItem(RECENT_BOARDS_KEY);
    return false;
  }

  const recent = safeParseJson<BoardSnapshot[]>(localStorage.getItem(RECENT_BOARDS_KEY), []);
  const next = [snapshot, ...recent.filter((item) => item.title !== snapshot.title)].slice(0, 5);
  return safeSetLocalStorage(RECENT_BOARDS_KEY, JSON.stringify(next));
};

const saveRecentWebBoardSummary = (board: SavedBoardSummary) => {
  const now = new Date().toISOString();
  const nextBoard = {
    ...board,
    title: board.title || 'Untitled Board',
    updated_at: board.updated_at || now,
  };
  const recent = safeParseJson<SavedBoardSummary[]>(localStorage.getItem(RECENT_WEB_BOARDS_KEY), []);
  const next = [nextBoard, ...recent.filter((item) => item.id !== nextBoard.id)].slice(0, 10);
  safeSetLocalStorage(RECENT_WEB_BOARDS_KEY, JSON.stringify(next));
};

const removeRecentWebBoardSummary = (boardId: string) => {
  const recent = safeParseJson<SavedBoardSummary[]>(localStorage.getItem(RECENT_WEB_BOARDS_KEY), []);
  const next = recent.filter((board) => board.id !== boardId);
  safeSetLocalStorage(RECENT_WEB_BOARDS_KEY, JSON.stringify(next));
};

const saveWebSnapshotCache = (boardId: string, snapshot: BoardSnapshot) => {
  const cacheKey = `viboard:web:${boardId}`;
  if (!safeSetSnapshotStorage(cacheKey, snapshot)) {
    localStorage.removeItem(cacheKey);
  }

  const cachedBoards = safeParseJson<SavedBoardSummary[]>(localStorage.getItem(WEB_CACHE_INDEX_KEY), []);
  const now = new Date().toISOString();
  const next = [
    { id: boardId, title: snapshot.title, updated_at: now },
    ...cachedBoards.filter((board) => board.id !== boardId),
  ].slice(0, 25);
  safeSetLocalStorage(WEB_CACHE_INDEX_KEY, JSON.stringify(next));
  saveRecentWebBoardSummary({ id: boardId, title: snapshot.title, updated_at: now });
};

export const getCachedWebBoards = () => safeParseJson<SavedBoardSummary[]>(localStorage.getItem(WEB_CACHE_INDEX_KEY), []);
export const getRecentWebBoards = (limit = 10) =>
  safeParseJson<SavedBoardSummary[]>(localStorage.getItem(RECENT_WEB_BOARDS_KEY), []).slice(0, limit);

export const cacheSavedBoardSnapshot = (boardId: string, snapshot: BoardSnapshot) => {
  saveWebSnapshotCache(boardId, snapshot);
  safeSetSnapshotStorage(AUTOSAVE_KEY, snapshot);
  saveRecentSnapshot(snapshot);
};

export const stashSavedBoardSnapshot = (boardId: string, snapshot: BoardSnapshot) => {
  transientSavedSnapshots.set(boardId, snapshot);
  cacheSavedBoardSnapshot(boardId, snapshot);
};

export const loadStashedSavedBoardSnapshot = (boardId: string) => {
  const snapshot = transientSavedSnapshots.get(boardId);
  if (!snapshot) return false;
  transientSavedSnapshots.delete(boardId);
  loadBoardSnapshot(snapshot);
  markBoardSaved(boardId);
  return true;
};

export const newBoard = () => {
  const snapshot = defaultBoardSnapshot();
  loadBoardState(snapshot);
  markBoardUnsaved();
};

export const loadDefaultBoard = async (options: { useTutorial?: boolean; signal?: AbortSignal } = {}) => {
  const cachedSnapshot = readSnapshotStorage(AUTOSAVE_KEY);
  if (cachedSnapshot) {
    loadBoardState(cachedSnapshot);
    markBoardDraftClean();
    return;
  }

  const fallbackSnapshot = defaultBoardSnapshot();
  loadBoardState(fallbackSnapshot);

  if (options.useTutorial) {
    const tutorialSnapshot = await fetchTutorialBoardSnapshot(options.signal);
    if (options.signal?.aborted) return;
    if (tutorialSnapshot) loadBoardState(tutorialSnapshot);
  }

  markBoardDraftClean();
};

export const saveBoardSnapshot = (snapshot: BoardSnapshot) => {
  if (isClearedBoardSnapshot(snapshot)) return false;
  const savedAutosave = safeSetSnapshotStorage(AUTOSAVE_KEY, snapshot);
  const savedRecent = saveRecentSnapshot(snapshot);
  return savedAutosave || savedRecent;
};

export const saveBoard = () => saveBoardSnapshot(getBoardSnapshot());

type PendingAuthenticatedSave = {
  boardId: string | null;
  snapshot: BoardSnapshot;
};

const readPendingAuthenticatedSave = (): PendingAuthenticatedSave | null => {
  const raw = localStorage.getItem(PENDING_AUTHENTICATED_SAVE_KEY);
  if (!raw) return null;

  try {
    const pending = JSON.parse(raw) as PendingAuthenticatedSave;
    return pending?.snapshot ? pending : null;
  } catch {
    localStorage.removeItem(PENDING_AUTHENTICATED_SAVE_KEY);
    return null;
  }
};

export const hasPendingAuthenticatedSave = () => Boolean(readPendingAuthenticatedSave());

export const queueAuthenticatedSave = (
  title: string,
  boardId?: string | null,
  snapshotOverride?: BoardSnapshot
) => {
  const snapshot = snapshotForPersistence({ ...(snapshotOverride ?? getBoardSnapshot()), title: title.trim() || 'Untitled Board' });
  if (estimateJsonChars(snapshot) > MAX_BROWSER_SNAPSHOT_CHARS) {
    throw new Error('This board is too large to queue in browser storage. Sign in first, then save it again.');
  }

  const queued = safeSetLocalStorage(PENDING_AUTHENTICATED_SAVE_KEY, JSON.stringify({
    boardId: boardId || null,
    snapshot,
  } satisfies PendingAuthenticatedSave));
  if (!queued) {
    throw new Error('This board is too large to queue in browser storage. Sign in first, then save it again.');
  }
  safeSetSnapshotStorage(AUTOSAVE_KEY, snapshot);
  saveRecentSnapshot(snapshot);
};

export const savePendingAuthenticatedBoard = async () => {
  const pending = readPendingAuthenticatedSave();
  if (!pending) return null;

  loadBoardSnapshot(pending.snapshot);
  const { data: sessionData } = await supabase.auth.getSession();
  const savedId = await saveBoardToWeb(pending.snapshot.title, pending.boardId, pending.snapshot, {
    sessionOverride: sessionData.session,
  });
  localStorage.removeItem(PENDING_AUTHENTICATED_SAVE_KEY);
  return savedId;
};

const boardSnapshotStoragePath = (userId: string, boardId: string) =>
  `${userId}/${boardId}.viboard.json`;

const uploadBoardSnapshot = async (path: string, snapshot: BoardSnapshot) => {
  const persistedSnapshot = snapshotForPersistence(snapshot);
  const body = JSON.stringify(persistedSnapshot);
  const { error } = await supabase.storage
    .from(SNAPSHOT_STORAGE_BUCKET)
    .upload(path, new Blob([body], { type: 'application/json' }), {
      cacheControl: '0',
      contentType: 'application/json',
      upsert: true,
    });

  if (error) throw error;

  return {
    snapshot: persistedSnapshot,
    size: body.length,
  };
};

const prepareRemoteSnapshot = async (userId: string, boardId: string, snapshot: BoardSnapshot) => {
  const persistedSnapshot = snapshotForPersistence(snapshot);
  const snapshotPath = boardSnapshotStoragePath(userId, boardId);

  try {
    const uploaded = await uploadBoardSnapshot(snapshotPath, persistedSnapshot);
    return {
      snapshot: uploaded.snapshot,
      size: uploaded.size,
      path: snapshotPath,
      compressed: null,
      encoding: null,
    };
  } catch (storageError) {
    console.error('Error uploading board snapshot to storage, falling back to compressed row storage:', storageError);
  }

  const body = JSON.stringify(persistedSnapshot);
  return {
    snapshot: persistedSnapshot,
    size: body.length,
    path: null,
    compressed: await compressText(body),
    encoding: SNAPSHOT_COMPRESSED_ENCODING,
  };
};

const withoutId = <T extends { id: string }>(payload: T) => {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'id')
  ) as Omit<T, 'id'>;
};

export const saveBoardToWeb = async (
  title: string,
  boardId?: string | null,
  snapshotOverride?: BoardSnapshot,
  options: { allowDefaultSnapshot?: boolean; updateLocalCache?: boolean; sessionOverride?: Session | null } = {}
) => {
  const snapshotTitle = title.trim() || 'Untitled Board';
  const currentSnapshot = snapshotForPersistence({ ...(snapshotOverride ?? getBoardSnapshot()), title: snapshotTitle });
  if (isClearedBoardSnapshot(currentSnapshot)) {
    throw new Error('This board is empty. Add content before saving.');
  }
  if (isDefaultOnlySnapshot(currentSnapshot) && !options.allowDefaultSnapshot) {
    console.warn('Refusing to save default-only Viboard snapshot:', snapshotStats(currentSnapshot));
    throw new Error('This save only contains the default Viboard logo block. Add or restore your board content before saving.');
  }
  const shouldApplySnapshotToStore = !snapshotOverride;
  const userId = options.sessionOverride?.user.id ?? (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('You must be signed in to save this board.');

  const targetBoardId = boardId || uuidv4();
  const remoteSnapshot = await prepareRemoteSnapshot(userId, targetBoardId, currentSnapshot);
  const { snapshot: persistedSnapshot, size: snapshotSize } = remoteSnapshot;

  const timestampedPayload = {
    id: targetBoardId,
    title: persistedSnapshot.title,
    user_id: userId,
    updated_at: new Date().toISOString(),
    snapshot_path: remoteSnapshot.path,
    snapshot_size: snapshotSize,
    snapshot_storage_version: SNAPSHOT_STORAGE_VERSION,
    snapshot_compressed: remoteSnapshot.compressed,
    snapshot_encoding: remoteSnapshot.encoding,
    snapshot: {},
  };
  const basePayload = {
    id: targetBoardId,
    title: persistedSnapshot.title,
    user_id: userId,
    snapshot_path: remoteSnapshot.path,
    snapshot_size: snapshotSize,
    snapshot_storage_version: SNAPSHOT_STORAGE_VERSION,
    snapshot_compressed: remoteSnapshot.compressed,
    snapshot_encoding: remoteSnapshot.encoding,
    snapshot: {},
  };
  const savePayloads = [
    timestampedPayload,
    basePayload,
  ];
  let data: { id: string } | null = null;
  const errors: unknown[] = [];

  const trySave = async (mode: 'update' | 'insert') => {
    for (const payload of savePayloads) {
      const updatePayload = withoutId(payload);
      const query = mode === 'update'
        ? supabase.from('moodboards').update(updatePayload).eq('id', targetBoardId).select('id').single()
        : supabase
          .from('moodboards')
          .insert([payload])
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
    if (!data) {
      await trySave('insert');
    }
  } else {
    await trySave('insert');
  }

  const savedBoard = data as { id: string } | null;
  if (!savedBoard) {
    const lastError = errors[errors.length - 1];
    console.error('Error saving moodboard:', lastError);
    throw new Error(errorMessage(lastError) || 'Could not save this board content to Supabase.');
  }

  const { data: verifiedRow, error: verifyError } = await supabase
    .from('moodboards')
    .select('*')
    .eq('id', savedBoard.id)
    .single();
  if (verifyError || !(await loadSnapshotFromRow(verifiedRow as MoodboardRow | null))) {
    console.error('Error verifying saved moodboard:', verifyError, verifiedRow);
    throw new Error(errorMessage(verifyError) || 'Supabase saved the board row, but the board content could not be read back.');
  }

  if (shouldApplySnapshotToStore) {
    useBoardStore.setState({ canvasTitle: persistedSnapshot.title });
  }
  if (options.updateLocalCache !== false) {
    stashSavedBoardSnapshot(savedBoard.id, persistedSnapshot);
  }
  if (shouldApplySnapshotToStore) {
    markBoardSaved(savedBoard.id);
  }
  return savedBoard.id;
};

export const createBoardOnWeb = (title = 'Untitled Board') =>
  saveBoardToWeb(title, null, defaultBoardSnapshot(title), { allowDefaultSnapshot: true });

export const saveLocalCopy = () => {
  const snapshot = getBoardSnapshot();
  saveRecentSnapshot(snapshot);
  downloadBlob(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
    safeFilename(snapshot.title, BOARD_FILE_EXTENSION)
  );
};

export const deleteCurrentBoard = async () => {
  const boardId = getSavedBoardId();
  if (!boardId) return;
  const { data: existingRow } = await supabase
    .from('moodboards')
    .select('snapshot_path')
    .eq('id', boardId)
    .single();
  const { error } = await supabase.from('moodboards').delete().eq('id', boardId);
  if (error) throw error;
  const snapshotPath = (existingRow as MoodboardRow | null)?.snapshot_path;
  if (snapshotPath) {
    void supabase.storage.from(SNAPSHOT_STORAGE_BUCKET).remove([snapshotPath]);
  }
  localStorage.removeItem(`viboard:web:${boardId}`);
  removeSnapshotIndexedDb(`viboard:web:${boardId}`);
  const cachedBoards = getCachedWebBoards().filter((board) => board.id !== boardId);
  safeSetLocalStorage(WEB_CACHE_INDEX_KEY, JSON.stringify(cachedBoards));
  removeRecentWebBoardSummary(boardId);
  markBoardUnsaved();
};

export const openRecentBoard = () => {
  const recent = safeParseJson<BoardSnapshot[]>(localStorage.getItem(RECENT_BOARDS_KEY), []);
  const latest = recent[0] || safeParseJson<BoardSnapshot | null>(localStorage.getItem(AUTOSAVE_KEY), null);
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
  const cached = getRecentWebBoards(limit);
  const { data, error } = await supabase
    .from('moodboards')
    .select('id,title,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    return cached;
  }

  const remoteById = new Map(
    (data || []).map((board) => [board.id, { ...board, title: board.title || 'Untitled Board' }])
  );
  return cached
    .map((board) => remoteById.get(board.id) ?? board)
    .slice(0, limit);
};

export let currentLoadingBoardId: string | null = null;

export const setCurrentLoadingBoardId = (id: string | null) => {
  currentLoadingBoardId = id;
};

export const loadBoardFromWeb = async (boardId: string, onSnapshotApplied?: () => void) => {
  const cachedSnapshot = await readSnapshotCache(`viboard:web:${boardId}`);
  const cachedSignature = cachedSnapshot ? snapshotSignature(cachedSnapshot) : null;
  const cachedSummary = getCachedWebBoards().find((board) => board.id === boardId);
  const cachedUpdatedAt = timestampValue(cachedSummary?.updated_at);

  const fetchAndApplyRemoteSnapshot = async () => {
    const { data, error } = await supabase.from('moodboards').select('*').eq('id', boardId).single();
    
    if (currentLoadingBoardId !== boardId) return;

    if (error && cachedSnapshot) return;
    if (error) {
      markBoardUnsaved();
      throw error;
    }

    const snapshot = await loadSnapshotFromRow(data as MoodboardRow);
    if (snapshot) {
      const remoteSignature = snapshotSignature(snapshot);
      const remoteUpdatedAt = timestampValue((data as Record<string, unknown>)?.updated_at)
        ?? timestampValue((data as Record<string, unknown>)?.created_at);

      if (cachedSnapshot && cachedSignature && remoteSignature !== cachedSignature) {
        const currentSignature = snapshotSignature(getBoardSnapshot());
        if (currentSignature !== cachedSignature) {
          return;
        }

        const cachedLooksNewer = cachedUpdatedAt !== null
          && (remoteUpdatedAt === null || cachedUpdatedAt > remoteUpdatedAt);
        if (cachedLooksNewer) {
          void saveBoardToWeb(cachedSnapshot.title, boardId, cachedSnapshot).catch((saveError) => {
            console.error('Error syncing newer cached moodboard:', saveError);
          });
          return;
        }
      }

      if (cachedSignature && snapshotSignature(getBoardSnapshot()) !== cachedSignature) {
        return;
      }
      loadBoardSnapshot(snapshot);
      onSnapshotApplied?.();
      saveWebSnapshotCache(boardId, snapshot);
      markBoardSaved(boardId);
      return;
    }
    if (cachedSnapshot) {
      markBoardSaved(boardId);
      return;
    }
    throw new Error('This board row exists in Supabase, but it does not contain readable Viboard content.');
  };

  if (cachedSnapshot) {
    loadBoardSnapshot(cachedSnapshot);
    saveRecentWebBoardSummary({
      id: boardId,
      title: cachedSnapshot.title,
      updated_at: cachedSummary?.updated_at || new Date().toISOString(),
    });
    markBoardSaved(boardId);
    void fetchAndApplyRemoteSnapshot().catch((error) => {
      console.error('Error refreshing cached moodboard:', error);
    });
    return;
  }

  await fetchAndApplyRemoteSnapshot();
  markBoardSaved(boardId);
};

const loadBoardSnapshot = (snapshot: BoardSnapshot) => {
  loadBoardState(snapshot);
  saveRecentSnapshot(snapshot);
};

const getSelectedBlocks = () => {
  const { blocks, selection } = useBoardStore.getState();
  return selection.map((id) => blocks[id]).filter(Boolean);
};

const containsBlockCenter = (frame: Block, block: Block) => {
  const centerX = block.x + block.width / 2;
  const centerY = block.y + block.height / 2;
  return centerX >= frame.x &&
    centerX <= frame.x + frame.width &&
    centerY >= frame.y &&
    centerY <= frame.y + frame.height;
};

const drawingIntersectsFrame = (frame: Block, drawing: DrawingPath) =>
  drawing.points.some((point) =>
    point.x >= frame.x &&
    point.x <= frame.x + frame.width &&
    point.y >= frame.y &&
    point.y <= frame.y + frame.height
  );

const getCopyPngTargets = () => {
  const { blocks, drawings, selection, drawingSelection } = useBoardStore.getState();
  if (selection.length === 0 && drawingSelection.length === 0) {
    return { blocks: undefined, drawings: undefined };
  }

  const selectedBlocks = selection.map((id) => blocks[id]).filter(Boolean);
  const selectedFrames = selectedBlocks.filter((block) => block.type === 'frame');
  const targetBlocks = new Map<string, Block>();
  const targetDrawings = new Map<string, DrawingPath>();

  selectedBlocks.forEach((block) => targetBlocks.set(block.id, block));
  drawingSelection
    .map((id) => drawings.find((drawing) => drawing.id === id))
    .filter((drawing): drawing is DrawingPath => Boolean(drawing))
    .forEach((drawing) => targetDrawings.set(drawing.id, drawing));

  selectedFrames.forEach((frame) => {
    Object.values(blocks)
      .filter((block) => block.id !== frame.id && containsBlockCenter(frame, block))
      .forEach((block) => targetBlocks.set(block.id, block));
    drawings
      .filter((drawing) => drawingIntersectsFrame(frame, drawing))
      .forEach((drawing) => targetDrawings.set(drawing.id, drawing));
  });

  return {
    blocks: Array.from(targetBlocks.values()),
    drawings: Array.from(targetDrawings.values()),
  };
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
  try {
    const targets = getCopyPngTargets();
    const canvas = await renderBoardToCanvas(targets.blocks, {
      transparentBackground: true,
      targetDrawings: targets.drawings,
    });
    if (!canvas) return;
    if (!('clipboard' in navigator) || !('ClipboardItem' in window)) {
      throw new Error('Clipboard image copy is not supported in this browser.');
    }
    const blob = await canvasToBlob(canvas, 'image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (error) {
    console.error('Error copying board as PNG:', error);
    window.alert('Could not copy this board as PNG.');
  }
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
  const { selection } = useBoardStore.getState();
  if (selection.length < 2) return;
  const groupId = uuidv4();
  updateSelectedBlocks((block) => ({ data: { ...block.data, groupId } }));
};

export const ungroupSelection = () => {
  const { blocks, selection, updateBlocks } = useBoardStore.getState();
  const selectedGroupIds = new Set(
    selection
      .map((id) => blocks[id]?.data?.groupId)
      .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.length > 0)
  );

  if (selectedGroupIds.size === 0) return;

  const updates = Object.values(blocks)
    .filter((block) => selectedGroupIds.has(block.data.groupId))
    .map((block) => {
      const data = { ...block.data };
      delete data.groupId;
      return { id: block.id, updates: { data } };
    });

  if (updates.length > 0) {
    updateBlocks(updates);
  }
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
  if (command === 'bulletedList' && applyListStyleToEditableSelection('bullet')) return;
  if (command === 'numberedList' && applyListStyleToEditableSelection('number')) return;

  updateSelectedBlocks((block) => {
    if (block.type !== 'text' && block.type !== 'sticky') return {};
    const data = { ...block.data };
    if (command === 'bold') data.bold = !data.bold;
    if (command === 'italic') data.italic = !data.italic;
    if (command === 'underline') data.underline = !data.underline;
    if (command === 'strikethrough') data.strikethrough = !data.strikethrough;
    if (command === 'bulletedList') {
      data.listStyle = data.listStyle === 'bullet' ? undefined : 'bullet';
      data.text = applyListStyleToText(data.text || '', data.listStyle);
    }
    if (command === 'numberedList') {
      data.listStyle = data.listStyle === 'number' ? undefined : 'number';
      data.text = applyListStyleToText(data.text || '', data.listStyle);
    }
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

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const wrapCanvasText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxHeight = Infinity
) => {
  const paragraphs = text.split(/\n/);
  let cursorY = y;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words.length ? words : ['']) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        if (cursorY + lineHeight > y + maxHeight) return;
        ctx.fillText(line, x, cursorY);
        cursorY += lineHeight;
        line = word;
      } else {
        line = next;
      }
    }
    if (cursorY + lineHeight > y + maxHeight) return;
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
};

const proxiedImageUrl = (url: string) => {
  if (!/^https?:\/\//i.test(url)) return url;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//i, ''))}`;
};

const isCanvasSafeImage = (image: HTMLImageElement) => {
  const testCanvas = document.createElement('canvas');
  testCanvas.width = 1;
  testCanvas.height = 1;
  const ctx = testCanvas.getContext('2d');
  if (!ctx) return false;
  try {
    ctx.drawImage(image, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
};

const loadCanvasImage = async (url?: string) => {
  if (!url) return null;
  const candidates = /^https?:\/\//i.test(url) ? [proxiedImageUrl(url), url] : [url];
  for (const candidate of candidates) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = candidate;
    });
    if (loaded && isCanvasSafeImage(loaded)) return loaded;
  }
  return null;
};

const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};

const drawPlaceholderCard = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  subtitle?: string,
  dark = false
) => {
  ctx.fillStyle = dark ? '#18181b' : '#ffffff';
  ctx.strokeStyle = dark ? '#27272a' : '#d4d4d8';
  ctx.lineWidth = 1;
  roundedRect(ctx, 0, 0, width, height, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = dark ? '#f4f4f5' : '#18181b';
  ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  wrapCanvasText(ctx, title, 16, 30, Math.max(20, width - 32), 20, Math.max(20, height - 56));
  if (subtitle) {
    ctx.fillStyle = dark ? '#a1a1aa' : '#71717a';
    ctx.font = '500 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    wrapCanvasText(ctx, subtitle, 16, Math.max(54, height - 28), Math.max(20, width - 32), 15, 18);
  }
};

const drawBlockImage = async (
  ctx: CanvasRenderingContext2D,
  block: Block,
  imageUrl?: string,
  fallbackTitle = 'Image unavailable'
) => {
  const image = await loadCanvasImage(imageUrl);
  if (image) {
    drawImageCover(ctx, image, 0, 0, block.width, block.height);
    return;
  }
  drawPlaceholderCard(ctx, block.width, block.height, fallbackTitle, imageUrl);
};

const drawDrawingPath = (
  ctx: CanvasRenderingContext2D,
  path: DrawingPath,
  offsetX = 0,
  offsetY = 0
) => {
  if (path.points.length === 0) return;
  ctx.save();
  ctx.globalAlpha = path.toolType === 'highlighter' ? 0.4 : 1;
  ctx.strokeStyle = path.color;
  ctx.lineWidth = path.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path.points[0].x + offsetX, path.points[0].y + offsetY);
  path.points.slice(1).forEach((point) => ctx.lineTo(point.x + offsetX, point.y + offsetY));
  ctx.stroke();
  ctx.restore();
};

const drawBlockToCanvas = async (ctx: CanvasRenderingContext2D, block: Block) => {
  const rotation = ((block.data.rotation || 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(block.x + block.width / 2, block.y + block.height / 2);
  ctx.rotate(rotation);
  ctx.scale(block.data.flipX ? -1 : 1, block.data.flipY ? -1 : 1);
  ctx.translate(-block.width / 2, -block.height / 2);

  if (block.type === 'frame') {
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(0, 0, block.width, block.height);
    ctx.setLineDash([]);
    ctx.fillStyle = '#52525b';
    ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(block.data.title || 'Frame', 0, -8);
  } else if (block.type === 'sticky') {
    const hue = block.data.hue !== undefined ? block.data.hue : 55;
    ctx.fillStyle = `hsl(${hue}, 90%, 85%)`;
    ctx.fillRect(0, 0, block.width, block.height);
    ctx.fillStyle = '#27272a';
    ctx.font = `${block.data.italic ? 'italic ' : ''}${block.data.bold ? 700 : 500} 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    wrapCanvasText(ctx, block.data.text || '', 24, 48, Math.max(20, block.width - 48), 25, Math.max(20, block.height - 48));
  } else if (block.type === 'text') {
    const fontSize = block.data.fontSize ?? 20;
    ctx.fillStyle = block.data.color ?? (block.data.hue !== undefined ? `hsl(${block.data.hue}, 75%, 28%)` : '#27272a');
    ctx.font = `${block.data.italic ? 'italic ' : ''}${block.data.bold ? 700 : 400} ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    wrapCanvasText(ctx, block.data.text || '', 8, fontSize + 8, Math.max(20, block.width - 16), fontSize * 1.3, block.height);
  } else if (block.type === 'shape') {
    const color = block.data.color || '#ff6b6b';
    ctx.fillStyle = `${color}33`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (block.data.shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(block.width / 2, block.height / 2, block.width / 2, block.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      roundedRect(ctx, 0, 0, block.width, block.height, 3);
      ctx.fill();
      ctx.stroke();
    }
  } else if (block.type === 'drawing') {
    drawDrawingPath(ctx, block.data.path);
  } else if (block.type === 'image') {
    await drawBlockImage(ctx, block, block.data.url, block.data.alt || 'Image unavailable');
  } else if (block.type === 'youtube') {
    await drawBlockImage(ctx, block, `https://img.youtube.com/vi/${block.data.videoId}/hqdefault.jpg`, 'YouTube video');
  } else if (block.type === 'medium' || block.type === 'github' || block.type === 'wikipedia' || block.type === 'reddit' || block.type === 'arena') {
    const metadata = block.data.metadata || {};
    const imageUrl = metadata.image || metadata.logo;
    if (imageUrl) {
      await drawBlockImage(ctx, block, imageUrl, metadata.title || block.type);
    } else {
      drawPlaceholderCard(ctx, block.width, block.height, metadata.title || block.type, block.data.url, block.type === 'github' || block.type === 'reddit');
    }
  } else if (block.type === 'audio') {
    await drawBlockImage(ctx, block, block.data.coverUrl, block.data.platform || 'Audio');
  } else if (block.type === 'link') {
    await drawBlockImage(
      ctx,
      block,
      `https://api.microlink.io?url=${encodeURIComponent(block.data.url || '')}&screenshot=true&embed=screenshot.url`,
      block.data.url || 'Link'
    );
  } else {
    drawPlaceholderCard(ctx, block.width, block.height, block.type === 'pdf' ? 'PDF document' : block.type, block.data.url);
  }

  ctx.restore();
};

export const renderBoardToCanvas = async (
  targetBlocks?: Block[],
  options: { transparentBackground?: boolean; targetDrawings?: DrawingPath[]; blocks?: Record<string, Block>; drawings?: DrawingPath[] } = {}
) => {
  const state = useBoardStore.getState();
  const blocks = options.blocks || state.blocks;
  const drawings = options.drawings || state.drawings;
  
  const blockList = targetBlocks !== undefined ? targetBlocks : Object.values(blocks);
  const drawingList = options.targetDrawings ?? drawings;
  const isTargetedRender = Boolean(targetBlocks || options.targetDrawings);
  if (blockList.length === 0 && drawingList.length === 0) return null;
  const blockBounds = blockList.length > 0 ? getSelectionBounds(blockList) : null;
  const drawingBounds = drawingList.length > 0 ? getDrawingBounds(drawingList) : null;
  const bounds = mergeBounds(blockBounds, drawingBounds) || { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };
  const padding = 48;
  const width = Math.max(320, Math.ceil(bounds.width + padding * 2));
  const height = Math.max(240, Math.ceil(bounds.height + padding * 2));
  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create export canvas.');
  if (!options.transparentBackground) {
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.translate(offsetX, offsetY);

  for (const block of [...blockList].sort((a, b) => a.zIndex - b.zIndex)) {
    await drawBlockToCanvas(ctx, block);
  }

  if (!isTargetedRender || drawingList.length > 0) {
    drawingList.forEach((path) => drawDrawingPath(ctx, path));
  }

  return canvas;
};

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create export image.'));
      }, mime, quality);
    } catch (error) {
      reject(error);
    }
  });

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

export const generateBoardPreview = async (blocks: Record<string, Block>, drawings: DrawingPath[]): Promise<string | null> => {
  try {
    const canvas = await renderBoardToCanvas(undefined, { 
      transparentBackground: false,
      blocks,
      drawings
    });
    if (!canvas) return null;
    
    // Create a smaller thumbnail version
    const thumbnailCanvas = document.createElement('canvas');
    const MAX_WIDTH = 800;
    let width = canvas.width;
    let height = canvas.height;
    
    if (width > MAX_WIDTH) {
      height = Math.floor(height * (MAX_WIDTH / width));
      width = MAX_WIDTH;
    }
    
    thumbnailCanvas.width = width;
    thumbnailCanvas.height = height;
    const ctx = thumbnailCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, width, height);
      return thumbnailCanvas.toDataURL('image/jpeg', 0.8);
    }
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (error) {
    console.error('Error generating preview:', error);
    return null;
  }
};

export const exportBoard = async (format: ExportFormat) => {
  try {
    const canvas = await renderBoardToCanvas(undefined, { transparentBackground: format === 'png' });
    if (!canvas) return;
    const { canvasTitle } = useBoardStore.getState();
    if (format === 'pdf') {
      const jpegBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.95));
      downloadBlob(createImagePdf(jpegBytes, canvas.width, canvas.height), safeFilename(canvasTitle, 'pdf'));
      return;
    }
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    downloadBlob(await canvasToBlob(canvas, mime, 0.95), safeFilename(canvasTitle, format));
  } catch (error) {
    console.error('Error exporting board:', error);
    window.alert('Could not export this board. Try removing unavailable embedded content and exporting again.');
  }
};

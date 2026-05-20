import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Canvas } from '../components/Canvas';
import { BlockShell } from '../components/BlockShell';
import { BlockRenderer } from '../components/Blocks';
import { Toolbar } from '../components/Toolbar';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { ContextMenu } from '../components/ContextMenu';
import { PropertyToolbar } from '../components/PropertyToolbar';
import { useBoardStore } from '../store';
import { getBoardSnapshot, loadBoardFromWeb, loadDefaultBoard, loadStashedSavedBoardSnapshot, saveBoardSnapshot, saveBoardToWeb, setCurrentLoadingBoardId, stashSavedBoardSnapshot } from '../lib/boardCommands';
import {
  consumeImportedLocalSnapshotFlag,
  getSavedBoardId,
  markBoardClean,
  markBoardDirty,
  markBoardUnsaved,
  shouldPromptToSaveBoard,
} from '../lib/boardSession';
import { initializeCollection, syncAllBlocks } from '../lib/typesense';
import { AnimatePresence, motion } from 'framer-motion';
import { UploadCloud } from 'lucide-react';
import { fileToBoardImageDataUrl } from '../lib/imageData';
import type { Block, Viewport } from '../types';

const LOCAL_DEFAULT_BOARD_ID = 'local-default-board';
const BOARD_RENDER_OVERSCAN_PX = 640;
const BOARD_RENDER_BUCKET_SIZE = 1200;
const MAX_BUCKETS_PER_BLOCK = 128;
const AUTOSAVE_DEBOUNCE_MS = 1200;

type ViewportSize = { width: number; height: number };
type RenderBounds = { minX: number; minY: number; maxX: number; maxY: number };
type BlockRenderIndex = {
  buckets: Map<string, Block[]>;
  fullScanBlocks: Block[];
};

const getViewportSize = (): ViewportSize => {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
};

const getBucketKey = (x: number, y: number) => `${x}:${y}`;

const getBlockBucketRange = (block: Block) => ({
  minBucketX: Math.floor(block.x / BOARD_RENDER_BUCKET_SIZE),
  minBucketY: Math.floor(block.y / BOARD_RENDER_BUCKET_SIZE),
  maxBucketX: Math.floor((block.x + block.width) / BOARD_RENDER_BUCKET_SIZE),
  maxBucketY: Math.floor((block.y + block.height) / BOARD_RENDER_BUCKET_SIZE),
});

const getViewportRenderBounds = (viewport: Viewport, viewportSize: ViewportSize): RenderBounds => {
  if (typeof window === 'undefined') {
    return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
  }

  const zoom = Math.max(viewport.zoom, 0.1);
  const margin = BOARD_RENDER_OVERSCAN_PX / Math.max(zoom, 0.25);
  return {
    minX: -viewport.x / zoom - margin,
    minY: -viewport.y / zoom - margin,
    maxX: (-viewport.x + viewportSize.width) / zoom + margin,
    maxY: (-viewport.y + viewportSize.height) / zoom + margin,
  };
};

const doesBlockIntersectBounds = (block: Block, bounds: RenderBounds) => (
  block.x < bounds.maxX &&
  block.x + block.width > bounds.minX &&
  block.y < bounds.maxY &&
  block.y + block.height > bounds.minY
);

const buildBlockRenderIndex = (blocks: Record<string, Block>): BlockRenderIndex => {
  const buckets = new Map<string, Block[]>();
  const fullScanBlocks: Block[] = [];

  Object.values(blocks).forEach((block) => {
    const { minBucketX, minBucketY, maxBucketX, maxBucketY } = getBlockBucketRange(block);
    const bucketCount = (maxBucketX - minBucketX + 1) * (maxBucketY - minBucketY + 1);

    if (bucketCount > MAX_BUCKETS_PER_BLOCK) {
      fullScanBlocks.push(block);
      return;
    }

    for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX += 1) {
      for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY += 1) {
        const key = getBucketKey(bucketX, bucketY);
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.push(block);
        } else {
          buckets.set(key, [block]);
        }
      }
    }
  });

  return { buckets, fullScanBlocks };
};

const queryBlockRenderIndex = (index: BlockRenderIndex, bounds: RenderBounds) => {
  const visibleById = new Map<string, Block>();
  const minBucketX = Math.floor(bounds.minX / BOARD_RENDER_BUCKET_SIZE);
  const minBucketY = Math.floor(bounds.minY / BOARD_RENDER_BUCKET_SIZE);
  const maxBucketX = Math.floor(bounds.maxX / BOARD_RENDER_BUCKET_SIZE);
  const maxBucketY = Math.floor(bounds.maxY / BOARD_RENDER_BUCKET_SIZE);

  for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX += 1) {
    for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY += 1) {
      const bucket = index.buckets.get(getBucketKey(bucketX, bucketY));
      if (!bucket) continue;
      bucket.forEach((block) => {
        if (!visibleById.has(block.id) && doesBlockIntersectBounds(block, bounds)) {
          visibleById.set(block.id, block);
        }
      });
    }
  }

  index.fullScanBlocks.forEach((block) => {
    if (doesBlockIntersectBounds(block, bounds)) {
      visibleById.set(block.id, block);
    }
  });

  return visibleById;
};

const BoardBlock = memo(({ block }: { block: Block }) => (
  <BlockShell block={block}>
    <BlockRenderer block={block} />
  </BlockShell>
));
BoardBlock.displayName = 'BoardBlock';

function Board() {
  const params = useParams();
  const activeBoardId = params.id ?? LOCAL_DEFAULT_BOARD_ID;
  const blocks = useBoardStore((state) => state.blocks);
  const drawings = useBoardStore((state) => state.drawings);
  const canvasTitle = useBoardStore((state) => state.canvasTitle);
  const viewport = useBoardStore((state) => state.viewport);
  const selection = useBoardStore((state) => state.selection);
  const mode = useBoardStore((state) => state.mode);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [renderViewport, setRenderViewport] = useState<Viewport>(() => useBoardStore.getState().viewport);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(getViewportSize);
  const autosaveReadyRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const pendingAutosaveRef = useRef(false);
  const changeVersionRef = useRef(0);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveQueueRef = useRef(Promise.resolve());
  const importedSnapshotBoardIdRef = useRef<string | null>(null);
  const routeBoardIdRef = useRef<string | null>(params.id ?? null);

  useLayoutEffect(() => {
    routeBoardIdRef.current = params.id ?? null;
  }, [params.id]);

  const blockRenderIndex = useMemo(() => buildBlockRenderIndex(blocks), [blocks]);

  const renderedBlocks = useMemo(() => {
    const selectedIds = new Set(selection);
    const visibleById = queryBlockRenderIndex(
      blockRenderIndex,
      getViewportRenderBounds(renderViewport, viewportSize),
    );

    selectedIds.forEach((id) => {
      const block = blocks[id];
      if (block) visibleById.set(id, block);
    });

    return Array.from(visibleById.values());
  }, [blockRenderIndex, blocks, renderViewport, selection, viewportSize]);

  const flushPendingAutosave = useCallback(() => {
    if (!pendingAutosaveRef.current) return;
    pendingAutosaveRef.current = false;

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const savedBoardId = getSavedBoardId();
    const versionAtSave = changeVersionRef.current;
    const snapshotAtSave = getBoardSnapshot();
    const savedLocally = saveBoardSnapshot(snapshotAtSave);

    if (savedLocally && !savedBoardId && changeVersionRef.current === versionAtSave) {
      markBoardClean();
    }

    if (!savedBoardId || savedBoardId !== (params.id ?? null)) return;

    stashSavedBoardSnapshot(savedBoardId, snapshotAtSave);
    autosaveQueueRef.current = autosaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveBoardToWeb(snapshotAtSave.title, savedBoardId, snapshotAtSave, { updateLocalCache: false }))
      .then(() => {
        if (routeBoardIdRef.current !== savedBoardId) return;
        if (changeVersionRef.current === versionAtSave) {
          stashSavedBoardSnapshot(savedBoardId, snapshotAtSave);
          markBoardClean();
        } else {
          markBoardDirty();
        }
      })
      .catch((error) => {
        if (routeBoardIdRef.current !== savedBoardId) return;
        markBoardDirty();
        pendingAutosaveRef.current = true;
        console.error('Error autosaving moodboard:', error);
      });
  }, [params.id]);

  useEffect(() => {
    return () => {
      flushPendingAutosave();
      setCurrentLoadingBoardId(null);
    };
  }, [flushPendingAutosave]);

  useEffect(() => {
    let viewportTimer: number | null = null;
    const unsubscribe = useBoardStore.subscribe((state, previousState) => {
      const next = state.viewport;
      const previous = previousState.viewport;
      if (next.x === previous.x && next.y === previous.y && next.zoom === previous.zoom) return;

      if (viewportTimer !== null) {
        window.clearTimeout(viewportTimer);
      }

      viewportTimer = window.setTimeout(() => {
        viewportTimer = null;
        setRenderViewport(useBoardStore.getState().viewport);
      }, 120);
    });

    return () => {
      if (viewportTimer !== null) {
        window.clearTimeout(viewportTimer);
      }
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let resizeFrame: number | null = null;

    const handleResize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        setViewportSize(getViewportSize());
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (!params.id) {
      const defaultBoardLoad = new AbortController();
      setCurrentLoadingBoardId(null);
      importedSnapshotBoardIdRef.current = null;
      autosaveReadyRef.current = false;
      skipNextAutosaveRef.current = true;
      void loadDefaultBoard({ useTutorial: true, signal: defaultBoardLoad.signal }).then(() => {
        if (defaultBoardLoad.signal.aborted) return;
        syncAllBlocks(useBoardStore.getState().blocks);
        changeVersionRef.current = 0;
        autosaveReadyRef.current = true;
        window.setTimeout(() => {
          skipNextAutosaveRef.current = false;
        }, 0);
      });
      return () => defaultBoardLoad.abort();
    }

    const boardId = params.id;
    
    setCurrentLoadingBoardId(boardId);

    const loadedStashedSnapshot = loadStashedSavedBoardSnapshot(boardId);
    if (loadedStashedSnapshot) {
      importedSnapshotBoardIdRef.current = boardId;
      skipNextAutosaveRef.current = true;
      changeVersionRef.current = 0;
      autosaveReadyRef.current = true;
    }
    
    if (consumeImportedLocalSnapshotFlag()) {
      importedSnapshotBoardIdRef.current = boardId;
      autosaveReadyRef.current = true;
      changeVersionRef.current = 0;
      return;
    }

    importedSnapshotBoardIdRef.current = null;
    if (loadedStashedSnapshot) return;
    autosaveReadyRef.current = false;
    useBoardStore.getState().clearBoard();
  }, [params.id]);

  useEffect(() => {
    if (!params.id || importedSnapshotBoardIdRef.current === params.id) return;
    const boardId = params.id;

    let cancelled = false;

    const markLoadedSnapshotClean = () => {
      skipNextAutosaveRef.current = true;
      changeVersionRef.current = 0;
      syncAllBlocks(useBoardStore.getState().blocks);
      markBoardClean();
    };

    void loadBoardFromWeb(boardId, markLoadedSnapshotClean)
      .then(() => {
        if (cancelled) return;
        markLoadedSnapshotClean();
        autosaveReadyRef.current = true;
      })
      .catch((error) => {
        if (cancelled) return;
        autosaveReadyRef.current = true;
        markBoardUnsaved();
        console.error('Error loading moodboard:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (!autosaveReadyRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    const changeVersion = changeVersionRef.current + 1;
    changeVersionRef.current = changeVersion;
    pendingAutosaveRef.current = true;
    markBoardDirty();

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      flushPendingAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [blocks, drawings, canvasTitle, viewport, params.id, flushPendingAutosave]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      flushPendingAutosave();
      if (!shouldPromptToSaveBoard()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingAutosave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', flushPendingAutosave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', flushPendingAutosave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushPendingAutosave]);

  useEffect(() => {
    void initializeCollection();
  }, []);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDraggingOver(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX === 0 || e.clientY === 0) {
        setIsDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer?.files || []);
      files.forEach((file) => {
        if (!file.type.startsWith('image/')) return;

        void fileToBoardImageDataUrl(file)
          .then((url) => {
            if (window.__handleAddBlock) {
              window.__handleAddBlock('image', { url });
            }
          })
          .catch((error) => {
            console.error('Could not process dropped image:', error);
          });
      });
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <motion.div 
      className="relative w-screen h-screen overflow-hidden bg-zinc-50"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.3, ease: 'easeIn' } }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-blue-500/10 backdrop-blur-sm pointer-events-none border-4 border-dashed border-blue-500/50 m-4 rounded-3xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-xl border border-blue-100"
            >
              <div className="p-4 bg-blue-50 rounded-full text-blue-500">
                <UploadCloud className="w-10 h-10" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-zinc-900">Drop files to upload</h3>
                <p className="text-sm text-zinc-500 mt-1">Images will be added to your canvas</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <KeyboardShortcuts />
      <ContextMenu />
      <Canvas>
        <AnimatePresence initial={false} key={activeBoardId}>
          {renderedBlocks.map((block) => (
            <BoardBlock key={block.id} block={block} />
          ))}
        </AnimatePresence>
      </Canvas>
      <Toolbar />
      {mode === 'edit' && <PropertyToolbar />}
    </motion.div>
  );
}

export default Board;

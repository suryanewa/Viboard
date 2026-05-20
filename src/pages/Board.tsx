import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { clampViewportZoom, type Block, type DrawingPath, type Viewport } from '../types';

const LOCAL_DEFAULT_BOARD_ID = 'local-default-board';
const AUTOSAVE_DEBOUNCE_MS = 1200;
const VIEWPORT_RECOVERY_PADDING_PX = 96;

type BoardBounds = { minX: number; minY: number; maxX: number; maxY: number };

const mergeBounds = (bounds: BoardBounds | null, next: BoardBounds): BoardBounds => {
  if (!bounds) return next;
  return {
    minX: Math.min(bounds.minX, next.minX),
    minY: Math.min(bounds.minY, next.minY),
    maxX: Math.max(bounds.maxX, next.maxX),
    maxY: Math.max(bounds.maxY, next.maxY),
  };
};

const getBoardContentBounds = (blocks: Record<string, Block>, drawings: DrawingPath[]) => {
  let bounds: BoardBounds | null = null;

  Object.values(blocks).forEach((block) => {
    bounds = mergeBounds(bounds, {
      minX: block.x,
      minY: block.y,
      maxX: block.x + block.width,
      maxY: block.y + block.height,
    });
  });

  drawings.forEach((drawing) => {
    if (drawing.points.length === 0) return;
    const strokePadding = Math.max(1, drawing.strokeWidth / 2);
    bounds = mergeBounds(bounds, {
      minX: Math.min(...drawing.points.map((point) => point.x)) - strokePadding,
      minY: Math.min(...drawing.points.map((point) => point.y)) - strokePadding,
      maxX: Math.max(...drawing.points.map((point) => point.x)) + strokePadding,
      maxY: Math.max(...drawing.points.map((point) => point.y)) + strokePadding,
    });
  });

  return bounds;
};

const getViewportWorldBounds = (viewport: Viewport): BoardBounds => {
  if (typeof window === 'undefined') {
    return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
  }

  const zoom = Math.max(viewport.zoom, 0.1);
  return {
    minX: -viewport.x / zoom,
    minY: -viewport.y / zoom,
    maxX: (-viewport.x + window.innerWidth) / zoom,
    maxY: (-viewport.y + window.innerHeight) / zoom,
  };
};

const boundsIntersect = (first: BoardBounds, second: BoardBounds) =>
  first.minX < second.maxX &&
  first.maxX > second.minX &&
  first.minY < second.maxY &&
  first.maxY > second.minY;

const hasVisibleBoardContent = (
  blocks: Record<string, Block>,
  drawings: DrawingPath[],
  viewportBounds: BoardBounds,
) => {
  const hasVisibleBlock = Object.values(blocks).some((block) =>
    boundsIntersect(
      { minX: block.x, minY: block.y, maxX: block.x + block.width, maxY: block.y + block.height },
      viewportBounds,
    )
  );
  if (hasVisibleBlock) return true;

  return drawings.some((drawing) => {
    const drawingBounds = getBoardContentBounds({}, [drawing]);
    return drawingBounds ? boundsIntersect(drawingBounds, viewportBounds) : false;
  });
};

const fitViewportToBounds = (bounds: BoardBounds): Viewport | null => {
  if (typeof window === 'undefined') return null;

  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, window.innerWidth - VIEWPORT_RECOVERY_PADDING_PX * 2);
  const availableHeight = Math.max(1, window.innerHeight - VIEWPORT_RECOVERY_PADDING_PX * 2);
  const zoom = clampViewportZoom(Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight));
  const centerX = bounds.minX + contentWidth / 2;
  const centerY = bounds.minY + contentHeight / 2;

  return {
    x: window.innerWidth / 2 - centerX * zoom,
    y: window.innerHeight / 2 - centerY * zoom,
    zoom,
  };
};

const recoverViewportIfContentOffscreen = () => {
  const { blocks, drawings, viewport, setViewport } = useBoardStore.getState();
  const contentBounds = getBoardContentBounds(blocks, drawings);
  if (!contentBounds) return;
  if (hasVisibleBoardContent(blocks, drawings, getViewportWorldBounds(viewport))) return;

  const nextViewport = fitViewportToBounds(contentBounds);
  if (nextViewport) setViewport(nextViewport);
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
  const mode = useBoardStore((state) => state.mode);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
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

  const renderedBlocks = Object.values(blocks);

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

  useLayoutEffect(() => {
    if (!params.id) {
      const defaultBoardLoad = new AbortController();
      setCurrentLoadingBoardId(null);
      importedSnapshotBoardIdRef.current = null;
      autosaveReadyRef.current = false;
      skipNextAutosaveRef.current = true;
      void loadDefaultBoard({ useTutorial: true, signal: defaultBoardLoad.signal }).then(() => {
        if (defaultBoardLoad.signal.aborted) return;
        recoverViewportIfContentOffscreen();
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
      recoverViewportIfContentOffscreen();
      changeVersionRef.current = 0;
      autosaveReadyRef.current = true;
    }
    
    if (consumeImportedLocalSnapshotFlag()) {
      importedSnapshotBoardIdRef.current = boardId;
      recoverViewportIfContentOffscreen();
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
      recoverViewportIfContentOffscreen();
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

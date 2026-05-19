import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Canvas } from '../components/Canvas';
import { BlockShell } from '../components/BlockShell';
import { BlockRenderer } from '../components/Blocks';
import { Toolbar } from '../components/Toolbar';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { ContextMenu } from '../components/ContextMenu';
import { PropertyToolbar } from '../components/PropertyToolbar';
import { useBoardStore } from '../store';
import { getBoardSnapshot, loadBoardFromWeb, loadDefaultBoard, saveBoard, saveBoardToWeb, setCurrentLoadingBoardId } from '../lib/boardCommands';
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
import type { Block, Viewport } from '../types';

const boardSignature = () => {
  const { blocks, drawings, canvasTitle } = useBoardStore.getState();
  return JSON.stringify({ blocks, drawings, canvasTitle });
};

const LOCAL_DEFAULT_BOARD_ID = 'local-default-board';
const BOARD_RENDER_OVERSCAN_PX = 4000;

const isBlockInRenderViewport = (block: Block, viewport: Viewport) => {
  if (typeof window === 'undefined') return true;

  const zoom = Math.max(viewport.zoom, 0.1);
  const margin = BOARD_RENDER_OVERSCAN_PX / Math.max(zoom, 0.25);
  const minX = -viewport.x / zoom - margin;
  const minY = -viewport.y / zoom - margin;
  const maxX = (-viewport.x + window.innerWidth) / zoom + margin;
  const maxY = (-viewport.y + window.innerHeight) / zoom + margin;

  return (
    block.x < maxX &&
    block.x + block.width > minX &&
    block.y < maxY &&
    block.y + block.height > minY
  );
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
  const selection = useBoardStore((state) => state.selection);
  const mode = useBoardStore((state) => state.mode);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [renderViewport, setRenderViewport] = useState<Viewport>(() => useBoardStore.getState().viewport);
  const autosaveReadyRef = useRef(false);
  const lastSavedSignatureRef = useRef('');
  const autosaveQueueRef = useRef(Promise.resolve());
  const searchSyncTimerRef = useRef<number | null>(null);
  const importedSnapshotBoardIdRef = useRef<string | null>(null);

  const renderedBlocks = useMemo(() => {
    const selectedIds = new Set(selection);
    return Object.values(blocks).filter((block) =>
      selectedIds.has(block.id) || isBlockInRenderViewport(block, renderViewport)
    );
  }, [blocks, renderViewport, selection]);

  useEffect(() => {
    return () => {
      setCurrentLoadingBoardId(null);
      useBoardStore.getState().clearBoard();
    };
  }, []);

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

  useLayoutEffect(() => {
    if (!params.id) {
      setCurrentLoadingBoardId(null);
      importedSnapshotBoardIdRef.current = null;
      loadDefaultBoard();
      lastSavedSignatureRef.current = boardSignature();
      autosaveReadyRef.current = true;
      return;
    }

    const boardId = params.id;
    
    setCurrentLoadingBoardId(boardId);
    
    if (consumeImportedLocalSnapshotFlag()) {
      importedSnapshotBoardIdRef.current = boardId;
      autosaveReadyRef.current = true;
      lastSavedSignatureRef.current = boardSignature();
      return;
    }

    importedSnapshotBoardIdRef.current = null;
    autosaveReadyRef.current = false;
    useBoardStore.getState().clearBoard();
  }, [params.id]);

  useEffect(() => {
    if (!params.id || importedSnapshotBoardIdRef.current === params.id) return;
    const boardId = params.id;

    let cancelled = false;

    const markLoadedSnapshotClean = () => {
      lastSavedSignatureRef.current = boardSignature();
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
    const signature = boardSignature();
    if (signature === lastSavedSignatureRef.current) return;

    markBoardDirty();
    const savedBoardId = getSavedBoardId();
    const signatureAtLocalSave = signature;
    const savedLocally = saveBoard();
    if (savedLocally && !savedBoardId && boardSignature() === signatureAtLocalSave) {
      lastSavedSignatureRef.current = signatureAtLocalSave;
      markBoardClean();
    }

    if (!savedBoardId || savedBoardId !== params.id) return;

    const snapshotAtSave = getBoardSnapshot();
    autosaveQueueRef.current = autosaveQueueRef.current
      .catch(() => undefined)
      .then(() => {
        const signatureAtSave = signatureAtLocalSave;
        return saveBoardToWeb(snapshotAtSave.title, savedBoardId, snapshotAtSave)
          .then(() => {
            if (boardSignature() === signatureAtSave) {
              lastSavedSignatureRef.current = signatureAtSave;
              markBoardClean();
            } else {
              markBoardDirty();
            }
          })
          .catch((error) => {
            markBoardDirty();
            console.error('Error autosaving moodboard:', error);
          });
      });
  }, [blocks, drawings, canvasTitle, params.id]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldPromptToSaveBoard()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    void initializeCollection();
  }, []);

  useEffect(() => {
    if (searchSyncTimerRef.current !== null) {
      window.clearTimeout(searchSyncTimerRef.current);
    }

    searchSyncTimerRef.current = window.setTimeout(() => {
      syncAllBlocks(useBoardStore.getState().blocks);
      searchSyncTimerRef.current = null;
    }, 150);

    return () => {
      if (searchSyncTimerRef.current !== null) {
        window.clearTimeout(searchSyncTimerRef.current);
        searchSyncTimerRef.current = null;
      }
    };
  }, [blocks]);

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

        const reader = new FileReader();
        reader.onload = (event) => {
          const url = event.target?.result as string;
          if (window.__handleAddBlock) {
            window.__handleAddBlock('image', { url });
          }
        };
        reader.readAsDataURL(file);
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
